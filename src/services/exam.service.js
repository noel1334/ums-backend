// src/services/exam.service.js
import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import { ExamStatus, ExamType, QuestionType } from '../generated/prisma/index.js';
import { hashPassword, comparePassword } from '../utils/password.utils.js'; // Import comparePassword

// ... (existing examSelection and examDetailSelection) ...
const examSelection = {
    id: true, title: true, courseId: true, semesterId: true, seasonId: true, examType: true,
    instructions: true, durationMinutes: true, totalMarks: true, passMark: true,
    questionsInBank: true, questionsToAttempt: true, status: true,
    createdByLecturerId: true, createdByICTStaffId: true, createdAt: true, updatedAt: true,
    course: { select: { id: true, code: true, title: true, departmentId: true } },
    semester: { select: { id: true, name: true, type: true } },
    season: { select: { id: true, name: true } },
    createdByLecturer: { select: { id: true, name: true, staffId: true } },
    createdByICTStaff: { select: { id: true, name: true, staffId: true } },
    _count: { select: { questions: true, examSessions: true, examAttempts: true } }
};
const examDetailSelection = {
    ...examSelection, // Spread the basic exam selection
    questions: {
        select: {
            id: true,
            questionText: true,
            questionType: true,
            marks: true,
            explanation: true, // Explanation might also be stripped for students in a real exam scenario
            difficulty: true,
            topic: true,
            isBankQuestion: true,
            displayOrder: true,
            correctOptionKey: true, // This might also be stripped for students
            options: {
                select: {
                    id: true,
                    optionKey: true,
                    optionText: true,
                    isCorrect: true, // This is the field we want to remove for students
                },
                orderBy: {
                    optionKey: 'asc'
                }
            }
        },
        orderBy: {
            displayOrder: 'asc'
        }
    }
};

const canUserManageExamForCourse = async (user, courseIdForExam) => {
    if (!user || !courseIdForExam) return false;
    if (user.type === 'admin' || (user.type === 'ictstaff' && user.canManageExams === true)) return true;

    const course = await prisma.course.findUnique({
        where: { id: courseIdForExam },
        select: { departmentId: true }
    });
    if (!course) return false;

    if (user.type === 'lecturer') {
        if (user.role === 'LECTURER') {
            const staffCourse = await prisma.staffCourse.findFirst({
                where: { lecturerId: user.id, courseId: courseIdForExam }
            });
            return !!staffCourse;
        }
        if (user.role === 'HOD') return course.departmentId === user.departmentId;
        if (user.role === 'DEAN') {
            const courseDepartment = await prisma.department.findUnique({
                where: { id: course.departmentId }, select: { facultyId: true }
            });
            // Assumes user.department.facultyId is available or user.facultyId for DEAN
            if (courseDepartment && user.department?.facultyId === courseDepartment.facultyId) return true;
        }
        if (user.role === 'EXAMINER') {
            if (course.departmentId === user.departmentId) return true; // Simplified rule
        }
    }
    return false;
};

export const createExam = async (examData, creatingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const {
            title, courseId, semesterId, seasonId, examType, instructions,
            durationMinutes, totalMarks, passMark, questionsToAttempt, status, accessPassword,
            questions // <-- Destructured for nested creation
        } = examData;

        // --- Basic Validation ---
        if (!title || !courseId || !semesterId || !seasonId || !examType || !durationMinutes || !questionsToAttempt) {
            throw new AppError('Required exam fields missing.', 400);
        }
        if (!Object.values(ExamType).includes(examType)) {
            throw new AppError(`Invalid examType: '${examType}'.`, 400);
        }
        if (status && !Object.values(ExamStatus).includes(status)) {
            throw new AppError(`Invalid status: '${status}'.`, 400);
        }

        const pCourseId = parseInt(courseId, 10);
        const pSemesterId = parseInt(semesterId, 10);
        const pSeasonId = parseInt(seasonId, 10);
        const pDurationMinutes = parseInt(durationMinutes, 10);
        const pQuestionsToAttempt = parseInt(questionsToAttempt, 10);

        if (isNaN(pCourseId) || isNaN(pSemesterId) || isNaN(pSeasonId) || isNaN(pDurationMinutes) || isNaN(pQuestionsToAttempt)) {
            throw new AppError('Invalid numeric format for ID, duration, or questions to attempt.', 400);
        }
        if (pDurationMinutes <= 0 || pQuestionsToAttempt <= 0) {
            throw new AppError('Duration and questions to attempt must be positive.', 400);
        }

        if (!await canUserManageExamForCourse(creatingUser, pCourseId)) {
            throw new AppError('Not authorized to create exam for this course/department.', 403);
        }
        // ... (check existence of course, semester, season) ...
        const [course, semester, season] = await Promise.all([
            prisma.course.findUnique({ where: { id: pCourseId, isActive: true } }),
            prisma.semester.findUnique({ where: { id: pSemesterId, isActive: true } }),
            prisma.season.findUnique({ where: { id: pSeasonId } })
        ]);
        if (!course) throw new AppError(`Active course ID ${pCourseId} not found.`, 404);
        if (!semester) throw new AppError(`Active semester ID ${pSemesterId} not found.`, 404);
        if (!season) throw new AppError(`Season ID ${pSeasonId} not found.`, 404);

        const dataToCreate = {
            title, courseId: pCourseId, semesterId: pSemesterId, seasonId: pSeasonId, examType,
            instructions: instructions || null,
            durationMinutes: pDurationMinutes,
            totalMarks: totalMarks ? parseFloat(totalMarks) : null,
            passMark: passMark ? parseFloat(passMark) : null,
            questionsToAttempt: pQuestionsToAttempt,
            status: status || ExamStatus.PENDING,
            accessPassword: accessPassword ? await hashPassword(accessPassword) : null,
        };

        if (creatingUser.type === 'lecturer') dataToCreate.createdByLecturerId = creatingUser.id;
        if (creatingUser.type === 'ictstaff') dataToCreate.createdByICTStaffId = creatingUser.id;

        let questionsCount = 0;

        // --- Handle nested creation of questions and options ---
        if (questions && Array.isArray(questions) && questions.length > 0) {
            const processedQuestions = questions.map((q, index) => {
                const questionType = q.questionType ? String(q.questionType).toUpperCase() : null;
                const questionMarks = q.marks ? parseFloat(q.marks) : NaN;

                if (!q.questionText || !questionType || isNaN(questionMarks) || questionMarks <= 0) {
                    throw new AppError(`Question at index ${index + 1} is missing required fields (text, type, positive marks).`, 400);
                }

                // Ensure the QuestionType is a valid enum value
                if (!Object.values(QuestionType).includes(questionType)) {
                    throw new AppError(`Question at index ${index + 1} has an invalid questionType: ${q.questionType}`, 400);
                }

                const questionData = {
                    questionText: q.questionText,
                    questionType: questionType,
                    marks: questionMarks,
                    explanation: q.explanation || null, // Default value
                    difficulty: q.difficulty || null,
                    topic: q.topic || null,
                    isBankQuestion: q.isBankQuestion !== undefined ? Boolean(q.isBankQuestion) : true,
                    displayOrder: q.displayOrder ? parseInt(q.displayOrder, 10) : index + 1,
                    addedByLecturerId: creatingUser.type === 'lecturer' ? creatingUser.id : null,
                    addedByICTStaffId: creatingUser.type === 'ictstaff' ? creatingUser.id : null,
                };

                // --- MODIFIED LOGIC HERE: Include FILL_IN_THE_BLANKS for explanation as answer ---
                if (questionType === QuestionType.ESSAY || questionType === QuestionType.SHORT_ANSWER || questionType === QuestionType.FILL_IN_THE_BLANKS) {
                     // The lecturer's reference answer/solution is saved in the 'explanation' field
                     const answerText = q.correctAnswer || q.answerText || null;
                     if (answerText) {
                         questionData.explanation = answerText;
                     }
                     // NOTE: These question types do not have 'options' so the optionsData block is skipped.
                }

                let optionsData = [];
                // ONLY process options for MCQ/TF
                if (questionType === QuestionType.MULTIPLE_CHOICE || questionType === QuestionType.TRUE_FALSE) {
                    if (!q.options || q.options.length < 2 || !q.correctOptionKey) {
                        throw new AppError(`Question at index ${index + 1} (${questionType}) requires at least 2 options and a correctOptionKey.`, 400);
                    }
                    if (!q.options.find(opt => opt.optionKey === q.correctOptionKey)) {
                         throw new AppError(`Question at index ${index + 1}: correctOptionKey '${q.correctOptionKey}' does not match any provided optionKey.`, 400);
                    }

                    questionData.correctOptionKey = q.correctOptionKey;

                    optionsData = q.options.map((opt, optIndex) => {
                        if (!opt.optionKey || !opt.optionText) {
                            throw new AppError(`Question at index ${index + 1}, Option at index ${optIndex + 1} is missing required fields (key, text).`, 400);
                        }
                        return {
                            optionKey: opt.optionKey,
                            optionText: opt.optionText,
                            isCorrect: opt.optionKey === q.correctOptionKey
                        };
                    });
                }

                // Nest options creation within question creation
                if (optionsData.length > 0) {
                    questionData.options = { create: optionsData };
                }

                return questionData;
            });

            // Final structure for nested creation of questions
            dataToCreate.questions = {
                create: processedQuestions
            };

            questionsCount = processedQuestions.length;
        }

        // Update questionsInBank with the number of created questions
        if (questionsCount > 0) {
            dataToCreate.questionsInBank = questionsCount;
        }


        const newExam = await prisma.exam.create({
            data: dataToCreate,
            select: examSelection
        });
        return newExam;
    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code) {
             console.error("Prisma Error Code in createExam:", error.code);
        }
        console.error("Error creating exam (raw):", error.message, error.stack);
        throw new AppError('Could not create exam.', 500);
    }
};

export const getExamById = async (examId, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const id = parseInt(examId, 10);
        if (isNaN(id)) throw new AppError('Invalid exam ID format.', 400);

        let exam = await prisma.exam.findUnique({ // Use 'let' because we might modify it
            where: { id },
            select: examDetailSelection // Use the detailed selection
        });
        if (!exam) throw new AppError('Exam not found.', 404);

        let canView = await canUserManageExamForCourse(requestingUser, exam.courseId);

        // Allow students to view active exams
        if (requestingUser.type === 'student') {
            if (exam.status === ExamStatus.ACTIVE || exam.status === ExamStatus.PENDING) { // Students might view pending exams for practice
                canView = true;
                // --- Conditional removal of sensitive fields for students ---
                if (exam.questions && Array.isArray(exam.questions)) {
                    exam.questions = exam.questions.map(question => {
                        // Remove explanation and correctOptionKey for students
                        const { explanation, correctOptionKey, ...restQuestion } = question;

                        if (question.options && Array.isArray(question.options)) {
                            restQuestion.options = question.options.map(option => {
                                // Remove the 'isCorrect' flag from each option
                                const { isCorrect, ...restOption } = option;
                                return restOption;
                            });
                        }
                        return restQuestion;
                    });
                }
            } else {
                // If student can't view because it's not active/pending, then explicitly set canView to false
                canView = false;
            }
        }


        if (!canView) {
            throw new AppError('Not authorized to view this exam.', 403);
        }
        return exam;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching exam by ID (raw):", error.message, error.stack);
        throw new AppError('Could not retrieve exam.', 500);
    }
};

export const getAllExams = async (query, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const { courseId, semesterId, seasonId, examType, status, page = 1, limit = 10, departmentId, facultyId } = query;
        const where = {};

        if (courseId) where.courseId = parseInt(courseId, 10);
        if (semesterId) where.semesterId = parseInt(semesterId, 10);
        if (seasonId) where.seasonId = parseInt(seasonId, 10);
        if (examType && Object.values(ExamType).includes(examType)) where.examType = examType;
        if (status && Object.values(ExamStatus).includes(status)) where.status = status;

        if (requestingUser.type === 'admin' || (requestingUser.type === 'ictstaff' && requestingUser.canManageExams)) {
            if (departmentId) where.course = { ...where.course, departmentId: parseInt(departmentId, 10) };
            else if (facultyId) where.course = { ...where.course, department: { facultyId: parseInt(facultyId, 10) } };
        } else if (requestingUser.type === 'lecturer') {
            if (requestingUser.role === 'LECTURER') {
                const staffCourses = await prisma.staffCourse.findMany({
                    where: { lecturerId: requestingUser.id }, select: { courseId: true }
                });
                const lecturerCourseIds = staffCourses.map(sc => sc.courseId);
                if (lecturerCourseIds.length === 0 && !where.createdByLecturerId) {
                    return { exams: [], totalPages: 0, currentPage: parseInt(page,10), totalExams: 0 };
                }
                where.OR = [
                    { createdByLecturerId: requestingUser.id },
                    ...(lecturerCourseIds.length > 0 ? [{ courseId: { in: lecturerCourseIds } }] : [])
                ];
            } else if (requestingUser.role === 'HOD') {
                if (!requestingUser.departmentId) throw new AppError('HOD department info missing.', 500);
                const targetDepartmentId = departmentId && parseInt(departmentId, 10) === requestingUser.departmentId
                                           ? parseInt(departmentId, 10) : requestingUser.departmentId;
                where.course = { ...where.course, departmentId: targetDepartmentId };
            } else if (requestingUser.role === 'DEAN' || requestingUser.role === 'EXAMINER') {
                let deanFacultyId = requestingUser.department?.facultyId;
                if (requestingUser.role === 'DEAN' && deanFacultyId) {
                    const targetFacultyId = facultyId && parseInt(facultyId, 10) === deanFacultyId
                                          ? parseInt(facultyId, 10) : deanFacultyId;
                    where.course = { ...where.course, department: { facultyId: targetFacultyId } };
                } else if (requestingUser.role === 'EXAMINER' && requestingUser.departmentId) {
                    where.course = { ...where.course, departmentId: requestingUser.departmentId };
                } else {
                    return { exams: [], totalPages: 0, currentPage: parseInt(page,10), totalExams: 0 };
                }
            }
        } else if (requestingUser.type === 'student') {
            where.status = ExamStatus.ACTIVE; // Students see limited list
        } else {
            throw new AppError("Not authorized to view this list of exams.", 403);
        }

        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;

        const exams = await prisma.exam.findMany({
            where, select: examSelection, orderBy: { createdAt: 'desc' }, skip, take: limitNum
        });
        const totalExams = await prisma.exam.count({ where });
        return { exams, totalPages: Math.ceil(totalExams / limitNum), currentPage: pageNum, totalExams };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching all exams (raw):", error.message, error.stack);
        throw new AppError('Could not retrieve exam list.', 500);
    }
};

export const updateExam = async (examId, updateData, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const id = parseInt(examId, 10);
        if (isNaN(id)) throw new AppError('Invalid exam ID format.', 400);

        const existingExam = await prisma.exam.findUnique({
            where: { id },
            include: {
                questions: { include: { options: true } },
                _count: { select: { examAttempts: true, examSessions: true } }
            }
        });

        if (!existingExam) throw new AppError('Exam not found for update.', 404);

        if (!await canUserManageExamForCourse(requestingUser, existingExam.courseId)) {
            throw new AppError('Not authorized to update this exam.', 403);
        }

        const hasAttempts = existingExam._count.examAttempts > 0;
        const isActiveOrCompleted = [ExamStatus.ACTIVE, ExamStatus.COMPLETED, ExamStatus.GRADED].includes(existingExam.status);

        // Security check: Prevent changing core details of a live or completed exam
        if (isActiveOrCompleted || hasAttempts) {
            const forbiddenFields = [
                'courseId', 'semesterId', 'seasonId', 'examType',
                'durationMinutes', 'questionsToAttempt', 'totalMarks', 'passMark'
            ];
            for (const field of forbiddenFields) {
                // Check if the update payload tries to change a forbidden field
                if (updateData.hasOwnProperty(field) && updateData[field] !== existingExam[field]) {
                    throw new AppError(`Cannot change '${field}' for an exam that is active, completed, or has attempts.`, 400);
                }
            }
            if (updateData.questions !== undefined) {
                throw new AppError('Cannot modify questions for an exam that is active, completed, or has attempts.', 400);
            }
        }

        return await prisma.$transaction(async (tx) => {
            const dataToUpdate = {};
            
            // CORRECTED: This list now includes all editable fields from your form
            const allowedExamFields = [
                'title', 'instructions', 'status', 'accessPassword', 'courseId',
                'semesterId', 'seasonId', 'examType', 'durationMinutes',
                'questionsToAttempt', 'totalMarks', 'passMark'
            ];

            // Process all allowed fields from the incoming data
            allowedExamFields.forEach(key => {
                if (updateData[key] !== undefined) {
                    const numericFields = ['courseId', 'semesterId', 'seasonId', 'durationMinutes', 'questionsToAttempt', 'totalMarks', 'passMark'];
                    if (numericFields.includes(key)) {
                        // Ensure null/undefined values are handled correctly for optional numeric fields
                        dataToUpdate[key] = updateData[key] ? parseInt(updateData[key], 10) : null;
                    } else {
                        dataToUpdate[key] = updateData[key];
                    }
                }
            });

            // Handle password hashing separately
            if (updateData.accessPassword !== undefined) {
                dataToUpdate.accessPassword = updateData.accessPassword ? await hashPassword(updateData.accessPassword) : null;
            }

            // Handle batch update of questions if they are provided
            if (updateData.questions && Array.isArray(updateData.questions)) {
                const incomingQuestions = updateData.questions;
                const existingQuestionIds = existingExam.questions.map(q => q.id);
                const incomingQuestionIds = incomingQuestions.map(q => q.id).filter(id => id);

                // Delete questions that are no longer in the incoming list
                const questionsToDeleteIds = existingQuestionIds.filter(id => !incomingQuestionIds.includes(id));
                if (questionsToDeleteIds.length > 0) {
                    await tx.question.deleteMany({ where: { id: { in: questionsToDeleteIds } } });
                }

                // Process incoming questions for creation or update
                for (const [index, q] of incomingQuestions.entries()) {
                    if (!q.questionText || !q.questionType) throw new AppError(`Question at index ${index} is missing text or type.`, 400);
                    const questionType = q.questionType.toUpperCase();

                    const questionPayload = {
                        questionText: q.questionText,
                        questionType: questionType,
                        marks: q.marks || 1,
                        explanation: q.explanation || q.correctAnswer || null,
                        difficulty: q.difficulty || null,
                        topic: q.topic || null,
                        isBankQuestion: q.isBankQuestion !== undefined ? q.isBankQuestion : true,
                        displayOrder: index + 1,
                        correctOptionKey: null,
                    };

                    if (questionType === QuestionType.MULTIPLE_CHOICE || questionType === QuestionType.TRUE_FALSE) {
                        if (!q.correctOptionKey || !q.options || q.options.length < 2) throw new AppError(`MCQ/TF Question "${q.questionText}" requires a correctOptionKey and at least 2 options.`, 400);
                        questionPayload.correctOptionKey = q.correctOptionKey;
                    }

                    if (q.id) { // UPDATE existing question
                        await tx.question.update({ where: { id: q.id }, data: questionPayload });

                        // The "Delete and Recreate" fix for options
                        await tx.questionOption.deleteMany({ where: { questionId: q.id } });

                        if ((questionType === QuestionType.MULTIPLE_CHOICE || questionType === QuestionType.TRUE_FALSE) && q.options) {
                            const optionsToCreate = q.options.map(opt => ({
                                questionId: q.id, optionKey: opt.optionKey, optionText: opt.optionText, isCorrect: opt.optionKey === q.correctOptionKey
                            }));
                            if (optionsToCreate.length > 0) await tx.questionOption.createMany({ data: optionsToCreate });
                        }
                    } else { // CREATE new question
                        const newQuestion = await tx.question.create({
                            data: {
                                ...questionPayload,
                                examId: id,
                                addedByLecturerId: requestingUser.type === 'lecturer' ? requestingUser.id : null,
                                addedByICTStaffId: requestingUser.type === 'ictstaff' ? requestingUser.id : null,
                            }
                        });
                        if ((questionType === QuestionType.MULTIPLE_CHOICE || questionType === QuestionType.TRUE_FALSE) && q.options) {
                            const optionsToCreate = q.options.map(opt => ({
                                questionId: newQuestion.id, optionKey: opt.optionKey, optionText: opt.optionText, isCorrect: opt.optionKey === q.correctOptionKey
                            }));
                            if (optionsToCreate.length > 0) await tx.questionOption.createMany({ data: optionsToCreate });
                        }
                    }
                }
                dataToUpdate.questionsInBank = incomingQuestions.length;
            }

            // Finally, perform the main update on the exam record
            return await tx.exam.update({
                where: { id },
                data: dataToUpdate,
                select: examSelection
            });
        });

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error updating exam (raw):", error);
        throw new AppError('Could not update exam.', 500);
    }
};


export const deleteExam = async (examId, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const id = parseInt(examId, 10);
        if (isNaN(id)) throw new AppError('Invalid exam ID format.', 400);

        const examToDelete = await prisma.exam.findUnique({
            where: { id },
            include: { _count: { select: { examAttempts: true, examSessions: true } } }
        });
        if (!examToDelete) throw new AppError('Exam not found for deletion.', 404);

        if (!await canUserManageExamForCourse(requestingUser, examToDelete.courseId)) {
            throw new AppError('Not authorized to delete this exam.', 403);
        }

        if (examToDelete._count.examAttempts > 0) {
            throw new AppError('Cannot delete exam with student attempts. Consider archiving.', 400);
        }
        if (examToDelete.status === ExamStatus.ACTIVE) {
            const activeSessions = await prisma.examSession.count({ where: { examId: id, isActive: true } });
            if (activeSessions > 0) {
                throw new AppError('Cannot delete exam with active sessions. Deactivate sessions first or archive.', 400);
            }
        }

        await prisma.exam.delete({ where: { id } });
        return { message: `Exam '${examToDelete.title}' (ID: ${id}) and its associated questions & sessions permanently deleted.` };
    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2003') {
            throw new AppError('Cannot delete exam. It is still referenced by other records (e.g., exam attempts). Archive instead.', 400);
        }
        console.error("Error deleting exam (raw):", error.message, error.stack);
        throw new AppError('Could not delete exam.', 500);
    }
};

// NEW FUNCTION: Verify Exam Access Password
export const verifyExamAccessPassword = async (examId, providedPassword, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const id = parseInt(examId, 10);
        if (isNaN(id)) throw new AppError('Invalid exam ID format.', 400);
        if (!providedPassword) throw new AppError('Password is required for verification.', 400);

        // --- ADD THESE LOGS ---
        console.log('DEBUG: verifyExamAccessPassword called.');
        console.log('DEBUG: Exam ID (parsed):', id);
        console.log('DEBUG: Provided password from frontend:', providedPassword);
        console.log('DEBUG: Length of provided password:', providedPassword ? providedPassword.length : 'N/A');
        // --- END ADDED LOGS ---

        const exam = await prisma.exam.findUnique({
            where: { id },
            select: {
                id: true,
                courseId: true,
                accessPassword: true,
                status: true,
                questionsInBank: true,
            }
        });

        if (!exam) {
            console.log('DEBUG: Exam not found for ID:', id); // Added log
            throw new AppError('Exam not found.', 404);
        }

        // --- ADD THESE LOGS ---
        console.log('DEBUG: Fetched exam accessPassword hash from DB:', exam.accessPassword);
        console.log('DEBUG: Length of DB password hash:', exam.accessPassword ? exam.accessPassword.length : 'N/A');
        // --- END ADDED LOGS ---

        let isAuthorizedToVerify = false;
        // ... (rest of authorization logic) ...
        if (requestingUser.type === 'student') {
            if (exam.status === ExamStatus.ACTIVE || exam.status === ExamStatus.PENDING) {
                isAuthorizedToVerify = true;
            }
        } else {
            isAuthorizedToVerify = await canUserManageExamForCourse(requestingUser, exam.courseId);
        }

        if (!isAuthorizedToVerify) {
            console.log('DEBUG: User not authorized to verify password.'); // Added log
            throw new AppError('Not authorized to perform password verification for this exam.', 403);
        }

        if (!exam.accessPassword) {
            console.log('DEBUG: Exam has no access password set in DB.'); // Added log
            return { message: 'Exam does not require an access password.', verified: true };
        }

        const isMatch = await comparePassword(providedPassword, exam.accessPassword);

        // --- ADD THIS LOG ---
        console.log('DEBUG: Result of password comparison (isMatch):', isMatch);
        // --- END ADDED LOG ---

        if (!isMatch) {
            throw new AppError('Incorrect exam access password.', 401);
        }

        return { message: 'Exam password verified successfully.', verified: true };

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("DEBUG ERROR: Error verifying exam access password (raw):", error.message, error.stack); // Modified log
        throw new AppError('Could not verify exam access password.', 500);
    }
};

// NEW FUNCTION: Update Exam Status
export const updateExamStatus = async (examId, newStatus, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const id = parseInt(examId, 10);
        if (isNaN(id)) throw new AppError('Invalid exam ID format.', 400);
        if (!newStatus || !Object.values(ExamStatus).includes(newStatus)) {
            throw new AppError(`Invalid status provided: '${newStatus}'.`, 400);
        }

        const existingExam = await prisma.exam.findUnique({
            where: { id },
            select: {
                id: true,
                title: true,
                courseId: true,
                status: true,
                questionsInBank: true,
                _count: {
                    select: {
                        questions: true,
                        examAttempts: true,
                        examSessions: { where: { isActive: true } }
                    }
                }
            }
        });

        if (!existingExam) throw new AppError('Exam not found.', 404);

        // Authorization check
        if (!await canUserManageExamForCourse(requestingUser, existingExam.courseId)) {
            throw new AppError('Not authorized to change the status of this exam.', 403);
        }

        // Prevent status changes if the exam is already in certain states and has attempts
        const hasAttempts = existingExam._count.examAttempts > 0;
        const currentStatus = existingExam.status;

        // Specific business logic for status transitions
        if (newStatus === ExamStatus.ACTIVE) {
            if (existingExam.questionsInBank === null || existingExam.questionsInBank < 1) {
                throw new AppError('Cannot activate an exam that has no questions.', 400);
            }
            if (currentStatus === ExamStatus.COMPLETED || currentStatus === ExamStatus.GRADED || currentStatus === ExamStatus.RESULTS_PUBLISHED || currentStatus === ExamStatus.ARCHIVED) {
                throw new AppError(`Cannot set status to ACTIVE from ${currentStatus}.`, 400);
            }
        } else if (newStatus === ExamStatus.COMPLETED) {
            if (currentStatus === ExamStatus.PENDING) {
                throw new AppError('Cannot complete a PENDING exam. It must be ACTIVE first.', 400);
            }
            if (existingExam._count.examSessions.length > 0) { // Check for active sessions
                 throw new AppError('Cannot complete exam with active sessions. Deactivate all sessions first.', 400);
            }
        } else if (newStatus === ExamStatus.ARCHIVED) {
            // Allow archiving from most states, but maybe restrict if results are pending publication
            if (currentStatus === ExamStatus.GRADING_IN_PROGRESS || currentStatus === ExamStatus.RESULTS_PUBLISHED) {
                 // You might want to allow archiving if results are published, but be strict if grading is still happening.
                 // For now, let's allow archiving from any state EXCEPT GRADING_IN_PROGRESS to avoid data issues during active grading.
            }
            if (currentStatus === ExamStatus.ACTIVE && existingExam._count.examSessions.length > 0) {
                 throw new AppError('Cannot archive an ACTIVE exam with active sessions.', 400);
            }
        } else if (newStatus === ExamStatus.CANCELLED) {
            if (hasAttempts) {
                throw new AppError('Cannot cancel an exam that has student attempts. Consider archiving instead.', 400);
            }
             if (existingExam._count.examSessions.length > 0) {
                 throw new AppError('Cannot cancel exam with active sessions. Deactivate all sessions first.', 400);
            }
        } else if (newStatus === ExamStatus.PENDING) {
             // Allow reverting to PENDING only from CANCELLED or if no attempts/sessions
            if (currentStatus !== ExamStatus.CANCELLED && hasAttempts) {
                throw new AppError('Cannot revert to PENDING for an exam with attempts.', 400);
            }
            if (currentStatus !== ExamStatus.CANCELLED && existingExam._count.examSessions.length > 0) {
                throw new AppError('Cannot revert to PENDING for an exam with active sessions.', 400);
            }
        }
        // Add more specific rules for GRADING_IN_PROGRESS, GRADED, RESULTS_PUBLISHED as needed

        const updatedExam = await prisma.exam.update({
            where: { id },
            data: { status: newStatus },
            select: examSelection
        });

        return updatedExam;

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error updating exam status (raw):", error.message, error.stack);
        throw new AppError('Could not update exam status.', 500);
    }
};