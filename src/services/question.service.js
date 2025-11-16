import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import { QuestionType, ExamStatus } from '../generated/prisma/index.js';


// Selection for returning question data including options
const questionSelection = {
    id: true,
    examId: true,
    questionText: true,
    questionType: true,
    marks: true,
    correctOptionKey: true,
    explanation: true,
    difficulty: true,
    topic: true,
    isBankQuestion: true,
    displayOrder: true,
    addedByLecturerId: true,
    addedByICTStaffId: true,
    createdAt: true,
    updatedAt: true,
    options: {
        select: {
            id: true,
            optionKey: true,
            optionText: true,
            isCorrect: true,
        },
        orderBy: {
            optionKey: 'asc'
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
// Helper to validate common question fields
const validateQuestionData = (question, index = 'a question') => {
    const questionType = question.questionType ? String(question.questionType).toUpperCase() : null;
    const questionMarks = question.marks ? parseFloat(question.marks) : NaN;

    if (!question.questionText || !questionType || isNaN(questionMarks) || questionMarks <= 0) {
        throw new AppError(`'${index}' is missing required fields (text, type, positive marks).`, 400);
    }
    if (!Object.values(QuestionType).includes(questionType)) {
        throw new AppError(`'${index}' has an invalid questionType: ${question.questionType}`, 400);
    }
    return { questionType, questionMarks };
};

// Helper to prepare options for creation/update
const prepareOptionsData = (options, correctOptionKey, index = 'a question') => {
    if (!options || !Array.isArray(options) || options.length < 2 || !correctOptionKey) {
        throw new AppError(`'${index}' (MULTIPLE_CHOICE/TRUE_FALSE) requires at least 2 options and a correctOptionKey.`, 400);
    }
    if (!options.find(opt => opt.optionKey === correctOptionKey)) {
        throw new AppError(`'${index}': correctOptionKey '${correctOptionKey}' does not match any provided optionKey.`, 400);
    }

    return options.map((opt, optIndex) => {
        if (!opt.optionKey || !opt.optionText) {
            throw new AppError(`'${index}', Option at index ${optIndex + 1} is missing required fields (key, text).`, 400);
        }
        return {
            optionKey: opt.optionKey,
            optionText: opt.optionText,
            isCorrect: opt.optionKey === correctOptionKey
        };
    });
};

// --- Authorization Helper ---
const authorizeQuestionManagement = async (questionOrExamId, requestingUser, isForExam = true) => {
    let courseId;
    if (isForExam) {
        const examId = parseInt(questionOrExamId, 10);
        if (isNaN(examId)) throw new AppError('Invalid Exam ID format.', 400);
        const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { courseId: true } });
        if (!exam) throw new AppError('Exam not found.', 404);
        courseId = exam.courseId;
    } else { // It's a question ID
        const questionId = parseInt(questionOrExamId, 10);
        if (isNaN(questionId)) throw new AppError('Invalid Question ID format.', 400);
        const question = await prisma.question.findUnique({ where: { id: questionId }, select: { exam: { select: { courseId: true } } } });
        if (!question || !question.exam) throw new AppError('Question or its associated exam not found.', 404);
        courseId = question.exam.courseId;
    }

    if (!await canUserManageExamForCourse(requestingUser, courseId)) {
        throw new AppError('Not authorized to manage questions for this exam/course.', 403);
    }
};

// --- Service Functions ---

/**
 * Creates a single question with its options for a given exam.
 * @param {string} examId - The ID of the exam.
 * @param {object} questionData - Data for the question and its options.
 * @param {object} creatingUser - The user initiating the creation.
 * @returns {Promise<object>} The created question.
 */
export const createQuestion = async (examId, questionData, creatingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const pExamId = parseInt(examId, 10);
        if (isNaN(pExamId)) throw new AppError('Invalid exam ID format.', 400);

        await authorizeQuestionManagement(pExamId, creatingUser, true);

        const exam = await prisma.exam.findUnique({
            where: { id: pExamId },
            select: { status: true, questionsInBank: true, _count: { select: { examAttempts: true } } }
        });

        if (!exam) throw new AppError('Exam not found.', 404);
        if (exam._count.examAttempts > 0) {
            throw new AppError('Cannot add questions to an exam that already has attempts.', 400);
        }

        const { questionType, questionMarks } = validateQuestionData(questionData, 'new question');

        const dataToCreate = {
            examId: pExamId,
            questionText: questionData.questionText,
            questionType: questionType,
            marks: questionMarks,
            explanation: questionData.explanation || null,
            difficulty: questionData.difficulty || null,
            topic: questionData.topic || null,
            isBankQuestion: questionData.isBankQuestion !== undefined ? Boolean(questionData.isBankQuestion) : true,
            displayOrder: questionData.displayOrder ? parseInt(questionData.displayOrder, 10) : undefined,
            addedByLecturerId: creatingUser.type === 'lecturer' ? creatingUser.id : null,
            addedByICTStaffId: creatingUser.type === 'ictstaff' ? creatingUser.id : null,
        };

        if (questionType === QuestionType.MULTIPLE_CHOICE || questionType === QuestionType.TRUE_FALSE) {
            dataToCreate.correctOptionKey = questionData.correctOptionKey;
            dataToCreate.options = {
                create: prepareOptionsData(questionData.options, questionData.correctOptionKey, 'new question')
            };
        } else if (questionType === QuestionType.ESSAY || questionType === QuestionType.SHORT_ANSWER) {
            // Explanation field serves as the model answer for essay/short answer
            if (questionData.correctAnswer || questionData.answerText) {
                dataToCreate.explanation = questionData.correctAnswer || questionData.answerText;
            }
        }

        const newQuestion = await prisma.question.create({
            data: dataToCreate,
            select: questionSelection
        });

        // Update questionsInBank count on the exam
        await prisma.exam.update({
            where: { id: pExamId },
            data: { questionsInBank: { increment: 1 } }
        });

        return newQuestion;

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error creating question (raw):", error.message, error.stack);
        throw new AppError('Could not create question.', 500);
    }
};

/**
 * Creates multiple questions for a given exam.
 * @param {string} examId - The ID of the exam.
 * @param {Array<object>} questionsData - An array of question data.
 * @param {object} creatingUser - The user initiating the creation.
 * @returns {Promise<Array<object>>} An array of created questions.
 */
export const createMultipleQuestions = async (examId, questionsData, creatingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const pExamId = parseInt(examId, 10);
        if (isNaN(pExamId)) throw new AppError('Invalid exam ID format.', 400);
        if (!Array.isArray(questionsData) || questionsData.length === 0) {
            throw new AppError('No questions data provided.', 400);
        }

        await authorizeQuestionManagement(pExamId, creatingUser, true);

        const exam = await prisma.exam.findUnique({
            where: { id: pExamId },
            select: { status: true, questionsInBank: true, _count: { select: { examAttempts: true } } }
        });

        if (!exam) throw new AppError('Exam not found.', 404);
        if (exam._count.examAttempts > 0) {
            throw new AppError('Cannot add questions to an exam that already has attempts.', 400);
        }

        const createdQuestions = [];
        let questionsCount = 0;

        await prisma.$transaction(async (tx) => {
            for (let i = 0; i < questionsData.length; i++) {
                const questionData = questionsData[i];
                const index = `question at index ${i + 1}`;
                const { questionType, questionMarks } = validateQuestionData(questionData, index);

                const dataToCreate = {
                    examId: pExamId,
                    questionText: questionData.questionText,
                    questionType: questionType,
                    marks: questionMarks,
                    explanation: questionData.explanation || null,
                    difficulty: questionData.difficulty || null,
                    topic: questionData.topic || null,
                    isBankQuestion: questionData.isBankQuestion !== undefined ? Boolean(questionData.isBankQuestion) : true,
                    displayOrder: questionData.displayOrder ? parseInt(questionData.displayOrder, 10) : i + 1,
                    addedByLecturerId: creatingUser.type === 'lecturer' ? creatingUser.id : null,
                    addedByICTStaffId: creatingUser.type === 'ictstaff' ? creatingUser.id : null,
                };

                if (questionType === QuestionType.MULTIPLE_CHOICE || questionType === QuestionType.TRUE_FALSE) {
                    dataToCreate.correctOptionKey = questionData.correctOptionKey;
                    dataToCreate.options = {
                        create: prepareOptionsData(questionData.options, questionData.correctOptionKey, index)
                    };
                } else if (questionType === QuestionType.ESSAY || questionType === QuestionType.SHORT_ANSWER) {
                    if (questionData.correctAnswer || questionData.answerText) {
                        dataToCreate.explanation = questionData.correctAnswer || questionData.answerText;
                    }
                }

                const newQuestion = await tx.question.create({
                    data: dataToCreate,
                    select: questionSelection
                });
                createdQuestions.push(newQuestion);
                questionsCount++;
            }

            // Update questionsInBank count on the exam using the transaction client
            if (questionsCount > 0) {
                await tx.exam.update({
                    where: { id: pExamId },
                    data: { questionsInBank: { increment: questionsCount } }
                });
            }
        });

        return createdQuestions;

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error creating multiple questions (raw):", error.message, error.stack);
        throw new AppError('Could not create multiple questions.', 500);
    }
};

/**
 * Fetches a single question by its ID.
 * @param {string} questionId - The ID of the question.
 * @param {object} requestingUser - The user initiating the fetch.
 * @returns {Promise<object>} The question with its options.
 */
export const getQuestionById = async (questionId, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const id = parseInt(questionId, 10);
        if (isNaN(id)) throw new AppError('Invalid question ID format.', 400);

        await authorizeQuestionManagement(id, requestingUser, false); // false because it's a questionId

        const question = await prisma.question.findUnique({
            where: { id },
            select: questionSelection
        });

        if (!question) throw new AppError('Question not found.', 404);
        return question;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching question by ID (raw):", error.message, error.stack);
        throw new AppError('Could not retrieve question.', 500);
    }
};

/**
 * Fetches all questions for a specific exam with pagination and filtering.
 * @param {string} examId - The ID of the exam.
 * @param {object} query - Query parameters (page, limit, questionType, difficulty, topic).
 * @param {object} requestingUser - The user initiating the fetch.
 * @returns {Promise<object>} An object containing questions, totalPages, currentPage, totalQuestions.
 */
export const getQuestionsForExam = async (examId, query, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const pExamId = parseInt(examId, 10);
        if (isNaN(pExamId)) throw new AppError('Invalid exam ID format.', 400);

        await authorizeQuestionManagement(pExamId, requestingUser, true);

        const { page = 1, limit = 10, questionType, difficulty, topic } = query;
        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;

        const where = { examId: pExamId };
        if (questionType && Object.values(QuestionType).includes(questionType.toUpperCase())) {
            where.questionType = questionType.toUpperCase();
        }
        if (difficulty) where.difficulty = difficulty;
        if (topic) where.topic = { contains: topic, mode: 'insensitive' }; // Case-insensitive search

        const questions = await prisma.question.findMany({
            where,
            select: questionSelection,
            orderBy: { displayOrder: 'asc' },
            skip,
            take: limitNum
        });

        const totalQuestions = await prisma.question.count({ where });

        return {
            questions,
            totalPages: Math.ceil(totalQuestions / limitNum),
            currentPage: pageNum,
            totalQuestions
        };

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching questions for exam (raw):", error.message, error.stack);
        throw new AppError('Could not retrieve questions for the exam.', 500);
    }
};

/**
 * Updates a single question and its options.
 * @param {string} questionId - The ID of the question to update.
 * @param {object} updateData - Data to update the question and its options.
 * @param {object} requestingUser - The user initiating the update.
 * @returns {Promise<object>} The updated question.
 */
export const updateQuestion = async (questionId, updateData, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const id = parseInt(questionId, 10);
        if (isNaN(id)) throw new AppError('Invalid question ID format.', 400);

        const existingQuestion = await prisma.question.findUnique({
            where: { id },
            include: {
                exam: { select: { courseId: true, _count: { select: { examAttempts: true } } } },
                options: { select: { id: true, optionKey: true, optionText: true, isCorrect: true } }
            }
        });

        if (!existingQuestion) throw new AppError('Question not found for update.', 404);
        if (!existingQuestion.exam) throw new AppError('Associated exam not found for question.', 500);
        if (existingQuestion.exam._count.examAttempts > 0) {
            throw new AppError('Cannot update questions in an exam that already has attempts.', 400);
        }

        await authorizeQuestionManagement(id, requestingUser, false); // false because it's a questionId

        const dataToUpdate = {};
        let newQuestionType = updateData.questionType ? String(updateData.questionType).toUpperCase() : existingQuestion.questionType;

        // Fields directly on the Question model
        const allowedQuestionFields = [
            'questionText', 'marks', 'explanation', 'difficulty', 'topic', 'isBankQuestion', 'displayOrder', 'correctOptionKey'
        ];
        for (const field of allowedQuestionFields) {
            if (updateData[field] !== undefined) {
                if (field === 'marks') {
                    const parsedMarks = parseFloat(updateData.marks);
                    if (isNaN(parsedMarks) || parsedMarks <= 0) {
                        throw new AppError('Marks must be a positive number.', 400);
                    }
                    dataToUpdate.marks = parsedMarks;
                } else if (field === 'displayOrder') {
                    const parsedOrder = parseInt(updateData.displayOrder, 10);
                    if (isNaN(parsedOrder) || parsedOrder <= 0) {
                        throw new AppError('Display order must be a positive integer.', 400);
                    }
                    dataToUpdate.displayOrder = parsedOrder;
                } else {
                    dataToUpdate[field] = updateData[field];
                }
            }
        }

        // Handle questionType change - this is complex, as it affects options
        if (updateData.questionType && newQuestionType !== existingQuestion.questionType) {
            if (!Object.values(QuestionType).includes(newQuestionType)) {
                throw new AppError(`Invalid questionType: '${updateData.questionType}'.`, 400);
            }
            dataToUpdate.questionType = newQuestionType;
            // If changing to MCQ/TF from Essay/ShortAnswer, options must be provided
            if ((newQuestionType === QuestionType.MULTIPLE_CHOICE || newQuestionType === QuestionType.TRUE_FALSE) && !updateData.options) {
                throw new AppError('When changing question type to MULTIPLE_CHOICE or TRUE_FALSE, options must be provided.', 400);
            }
            // If changing from MCQ/TF to Essay/ShortAnswer, clear correctOptionKey and remove options
            if ((newQuestionType === QuestionType.ESSAY || newQuestionType === QuestionType.SHORT_ANSWER) &&
                (existingQuestion.questionType === QuestionType.MULTIPLE_CHOICE || existingQuestion.questionType === QuestionType.TRUE_FALSE)) {
                dataToUpdate.correctOptionKey = null;
                // Delete existing options
                await prisma.questionOption.deleteMany({ where: { questionId: id } });
            }
        }

        // Handle options update for MULTIPLE_CHOICE / TRUE_FALSE
        if ((newQuestionType === QuestionType.MULTIPLE_CHOICE || newQuestionType === QuestionType.TRUE_FALSE) && updateData.options !== undefined) {
            const currentCorrectOptionKey = updateData.correctOptionKey || existingQuestion.correctOptionKey;
            if (!currentCorrectOptionKey) {
                 throw new AppError('A correctOptionKey must be provided for MULTIPLE_CHOICE or TRUE_FALSE questions.', 400);
            }

            const incomingOptions = prepareOptionsData(updateData.options, currentCorrectOptionKey, 'updated question');
            const existingOptions = existingQuestion.options;

            const optionsToCreate = incomingOptions.filter(
                incOpt => !existingOptions.some(exOpt => exOpt.optionKey === incOpt.optionKey)
            );
            const optionsToUpdate = incomingOptions.filter(
                incOpt => existingOptions.some(exOpt => exOpt.optionKey === incOpt.optionKey)
            );
            const optionsToDelete = existingOptions.filter(
                exOpt => !incomingOptions.some(incOpt => incOpt.optionKey === exOpt.optionKey)
            );

            await prisma.$transaction(async (tx) => {
                // Delete options no longer present
                if (optionsToDelete.length > 0) {
                    await tx.questionOption.deleteMany({
                        where: { id: { in: optionsToDelete.map(opt => opt.id) } }
                    });
                }

                // Create new options
                if (optionsToCreate.length > 0) {
                    await tx.questionOption.createMany({
                        data: optionsToCreate.map(opt => ({ ...opt, questionId: id }))
                    });
                }

                // Update existing options
                for (const opt of optionsToUpdate) {
                    await tx.questionOption.update({
                        where: { questionId_optionKey: { questionId: id, optionKey: opt.optionKey } },
                        data: { optionText: opt.optionText, isCorrect: opt.isCorrect }
                    });
                }
            });
            dataToUpdate.correctOptionKey = currentCorrectOptionKey; // Ensure correctOptionKey is updated on question
        } else if ((newQuestionType === QuestionType.ESSAY || newQuestionType === QuestionType.SHORT_ANSWER) && updateData.options !== undefined) {
            throw new AppError('ESSAY or SHORT_ANSWER question types cannot have options.', 400);
        }

        if (Object.keys(dataToUpdate).length === 0 && updateData.options === undefined) {
            throw new AppError('No valid fields provided for update.', 400);
        }

        const updatedQuestion = await prisma.question.update({
            where: { id },
            data: dataToUpdate,
            select: questionSelection
        });
        return updatedQuestion;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error updating question (raw):", error.message, error.stack);
        throw new AppError('Could not update question.', 500);
    }
};

/**
 * Updates multiple questions and their options for a given exam.
 * This is complex as it involves individual updates including nested option management.
 * @param {string} examId - The ID of the exam.
 * @param {Array<object>} questionsUpdateData - An array of objects, each containing a questionId and its update data.
 * @param {object} requestingUser - The user initiating the update.
 * @returns {Promise<Array<object>>} An array of updated questions.
 */
export const updateMultipleQuestions = async (examId, questionsUpdateData, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const pExamId = parseInt(examId, 10);
        if (isNaN(pExamId)) throw new AppError('Invalid exam ID format.', 400);
        if (!Array.isArray(questionsUpdateData) || questionsUpdateData.length === 0) {
            throw new AppError('No questions data provided for update.', 400);
        }

        await authorizeQuestionManagement(pExamId, requestingUser, true);

        const exam = await prisma.exam.findUnique({
            where: { id: pExamId },
            select: { _count: { select: { examAttempts: true } } }
        });
        if (!exam) throw new AppError('Exam not found.', 404);
        if (exam._count.examAttempts > 0) {
            throw new AppError('Cannot update questions in an exam that already has attempts.', 400);
        }

        const updatedQuestions = [];

        await prisma.$transaction(async (tx) => {
            for (let i = 0; i < questionsUpdateData.length; i++) {
                const updateItem = questionsUpdateData[i];
                const questionId = updateItem.id;
                const questionData = updateItem.data; // The actual update data for the question

                if (!questionId) {
                    throw new AppError(`Update item at index ${i + 1} is missing a question 'id'.`, 400);
                }
                if (Object.keys(questionData).length === 0) {
                    continue; // Skip if no data for this specific question update
                }

                const existingQuestion = await tx.question.findUnique({
                    where: { id: questionId },
                    include: { options: true }
                });

                if (!existingQuestion || existingQuestion.examId !== pExamId) {
                    throw new AppError(`Question with ID ${questionId} not found or does not belong to exam ${pExamId}.`, 404);
                }

                const dataToUpdate = {};
                let newQuestionType = questionData.questionType ? String(questionData.questionType).toUpperCase() : existingQuestion.questionType;

                const allowedQuestionFields = [
                    'questionText', 'marks', 'explanation', 'difficulty', 'topic', 'isBankQuestion', 'displayOrder', 'correctOptionKey'
                ];
                for (const field of allowedQuestionFields) {
                    if (questionData[field] !== undefined) {
                        if (field === 'marks') {
                            const parsedMarks = parseFloat(questionData.marks);
                            if (isNaN(parsedMarks) || parsedMarks <= 0) {
                                throw new AppError(`Question ${questionId}: Marks must be a positive number.`, 400);
                            }
                            dataToUpdate.marks = parsedMarks;
                        } else if (field === 'displayOrder') {
                            const parsedOrder = parseInt(questionData.displayOrder, 10);
                            if (isNaN(parsedOrder) || parsedOrder <= 0) {
                                throw new AppError(`Question ${questionId}: Display order must be a positive integer.`, 400);
                            }
                            dataToUpdate.displayOrder = parsedOrder;
                        } else {
                            dataToUpdate[field] = questionData[field];
                        }
                    }
                }

                // Question Type change logic
                if (questionData.questionType && newQuestionType !== existingQuestion.questionType) {
                    if (!Object.values(QuestionType).includes(newQuestionType)) {
                        throw new AppError(`Question ${questionId}: Invalid questionType: '${questionData.questionType}'.`, 400);
                    }
                    dataToUpdate.questionType = newQuestionType;
                    if ((newQuestionType === QuestionType.MULTIPLE_CHOICE || newQuestionType === QuestionType.TRUE_FALSE) && !questionData.options) {
                        throw new AppError(`Question ${questionId}: When changing question type to MULTIPLE_CHOICE or TRUE_FALSE, options must be provided.`, 400);
                    }
                    if ((newQuestionType === QuestionType.ESSAY || newQuestionType === QuestionType.SHORT_ANSWER) &&
                        (existingQuestion.questionType === QuestionType.MULTIPLE_CHOICE || existingQuestion.questionType === QuestionType.TRUE_FALSE)) {
                        dataToUpdate.correctOptionKey = null;
                        await tx.questionOption.deleteMany({ where: { questionId: questionId } });
                    }
                }

                // Handle options update for MULTIPLE_CHOICE / TRUE_FALSE
                if ((newQuestionType === QuestionType.MULTIPLE_CHOICE || newQuestionType === QuestionType.TRUE_FALSE) && questionData.options !== undefined) {
                    const currentCorrectOptionKey = questionData.correctOptionKey || existingQuestion.correctOptionKey;
                    if (!currentCorrectOptionKey) {
                         throw new AppError(`Question ${questionId}: A correctOptionKey must be provided for MULTIPLE_CHOICE or TRUE_FALSE questions.`, 400);
                    }

                    const incomingOptions = prepareOptionsData(questionData.options, currentCorrectOptionKey, `question ${questionId}`);
                    const existingOptions = existingQuestion.options;

                    const optionsToCreate = incomingOptions.filter(
                        incOpt => !existingOptions.some(exOpt => exOpt.optionKey === incOpt.optionKey)
                    );
                    const optionsToUpdate = incomingOptions.filter(
                        incOpt => existingOptions.some(exOpt => exOpt.optionKey === incOpt.optionKey)
                    );
                    const optionsToDelete = existingOptions.filter(
                        exOpt => !incomingOptions.some(incOpt => incOpt.optionKey === exOpt.optionKey)
                    );

                    // Delete options no longer present
                    if (optionsToDelete.length > 0) {
                        await tx.questionOption.deleteMany({
                            where: { id: { in: optionsToDelete.map(opt => opt.id) } }
                        });
                    }

                    // Create new options
                    if (optionsToCreate.length > 0) {
                        await tx.questionOption.createMany({
                            data: optionsToCreate.map(opt => ({ ...opt, questionId: questionId }))
                        });
                    }

                    // Update existing options
                    for (const opt of optionsToUpdate) {
                        await tx.questionOption.update({
                            where: { questionId_optionKey: { questionId: questionId, optionKey: opt.optionKey } },
                            data: { optionText: opt.optionText, isCorrect: opt.isCorrect }
                        });
                    }
                    dataToUpdate.correctOptionKey = currentCorrectOptionKey;
                } else if ((newQuestionType === QuestionType.ESSAY || newQuestionType === QuestionType.SHORT_ANSWER) && questionData.options !== undefined) {
                    throw new AppError(`Question ${questionId}: ESSAY or SHORT_ANSWER question types cannot have options.`, 400);
                }

                if (Object.keys(dataToUpdate).length > 0 || questionData.options !== undefined) { // Check if any actual update happened
                    const updatedQuestion = await tx.question.update({
                        where: { id: questionId },
                        data: dataToUpdate,
                        select: questionSelection
                    });
                    updatedQuestions.push(updatedQuestion);
                } else {
                    // If no changes were made to this specific question, still include its original data for completeness
                    updatedQuestions.push(existingQuestion);
                }
            }
        });

        return updatedQuestions;

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error updating multiple questions (raw):", error.message, error.stack);
        throw new AppError('Could not update multiple questions.', 500);
    }
};


/**
 * Deletes a question.
 * @param {string} questionId - The ID of the question to delete.
 * @param {object} requestingUser - The user initiating the deletion.
 * @returns {Promise<object>} A success message.
 */
export const deleteQuestion = async (questionId, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const id = parseInt(questionId, 10);
        if (isNaN(id)) throw new AppError('Invalid question ID format.', 400);

        const questionToDelete = await prisma.question.findUnique({
            where: { id },
            include: {
                exam: { select: { courseId: true, _count: { select: { examAttempts: true } } } },
                _count: { select: { studentAnswers: true } }
            }
        });

        if (!questionToDelete) throw new AppError('Question not found for deletion.', 404);
        if (!questionToDelete.exam) throw new AppError('Associated exam not found for question.', 500);

        await authorizeQuestionManagement(id, requestingUser, false); // false because it's a questionId

        if (questionToDelete._count.studentAnswers > 0) {
            throw new AppError('Cannot delete a question that has student answers. Archive the exam instead.', 400);
        }
        if (questionToDelete.exam._count.examAttempts > 0) {
            throw new AppError('Cannot delete questions from an exam that already has attempts.', 400);
        }

        await prisma.$transaction(async (tx) => {
            // Options are cascade deleted with the question.
            await tx.question.delete({ where: { id } });

            // Decrement questionsInBank count on the exam
            await tx.exam.update({
                where: { id: questionToDelete.examId },
                data: { questionsInBank: { decrement: 1 } }
            });
        });

        return { message: `Question (ID: ${id}) permanently deleted.` };

    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2003') { // Foreign key constraint failed
            throw new AppError('Cannot delete question due to related student answers or other dependencies.', 400);
        }
        console.error("Error deleting question (raw):", error.message, error.stack);
        throw new AppError('Could not delete question.', 500);
    }
};