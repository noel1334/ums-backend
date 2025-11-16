// src/services/studentExamAssignment.service.js
import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import { ExamStatus } from '../generated/prisma/index.js';

const assignmentSelection = {
    id: true,
    seatNumber: true,
    assignedAt: true,
    student: {
        select: { 
            id: true, 
            regNo: true, 
            name: true, 
            email: true, 
            profileImg: true,
            currentLevel: {select: { id: true, name: true } },
            department: {
                select: {
                    id: true,
                    name: true,
                }
            },
            program: {
                select: {
                    id: true,
                    name: true,
                }
            }
            // END OF NEW ADDITIONS
        }
    },
    examSession: {
        select: {
            id: true, sessionName: true, startTime: true, endTime: true, isActive: true,
            exam: {
                select: {
                    id: true, title: true, examType: true, status: true,
                    courseId: true,
                    semesterId: true,
                    seasonId: true,
                    course: { select: { id: true, code: true, title: true } }
                }
            },
            venue: { select: { id: true, name: true, location: true } }
        }
    }
};


// --- Authorization Helper (re-used) ---
const canUserManageExamSessions = async (user, examId) => {
    if (!user || !examId) return false;
    if (user.type === 'admin' || (user.type === 'ictstaff' && user.canManageExams)) return true;

    const exam = await prisma.exam.findUnique({
        where: { id: examId },
        select: { courseId: true, createdByLecturerId: true }
    });
    if (!exam) return false;

    if (user.type === 'lecturer') {
        if (exam.createdByLecturerId === user.id) return true;

        const course = await prisma.course.findUnique({
            where: { id: exam.courseId },
            select: { departmentId: true }
        });
        if (!course) return false;

        if (user.role === 'HOD' && user.departmentId === course.departmentId) return true;
        if (user.role === 'LECTURER') {
            const staffCourse = await prisma.staffCourse.findFirst({
                where: { lecturerId: user.id, courseId: exam.courseId }
            });
            return !!staffCourse;
        }
    }
    return false;
};

/**
 * Shuffles an array randomly.
 * @param {Array} array The array to shuffle.
 * @returns {Array} The shuffled array.
 */
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

/**
 * Assigns a batch of students to exam sessions for a specific exam randomly.
 *
 * @param {number} examId The ID of the exam for which to create assignments.
 * @param {object} studentFilters Criteria to filter students (e.g., { studentIds: [1,2,3], programId: 1, levelId: 1 }).
 * @param {object} options Additional options for assignment (e.g., { overwriteExisting: false }).
 * @param {object} requestingUser The user performing the action, for authorization.
 * @returns {Promise<object>} An object containing successful and failed assignments.
 */
export const batchAssignStudentsToExamSessions = async (examId, studentFilters, options = {}, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const pExamId = parseInt(examId, 10);
        if (isNaN(pExamId)) throw new AppError('Invalid Exam ID format.', 400);

        if (!await canUserManageExamSessions(requestingUser, pExamId)) {
            throw new AppError('You are not authorized to batch assign students for this exam.', 403);
        }

        const { overwriteExisting = false } = options;

        const exam = await prisma.exam.findUnique({
            where: { id: pExamId },
            select: { id: true, courseId: true, semesterId: true, seasonId: true, status: true }
        });
        if (!exam) throw new AppError(`Exam with ID ${pExamId} not found.`, 404);
        if (exam.status !== ExamStatus.PENDING && exam.status !== ExamStatus.ACTIVE) {
            throw new AppError(`Cannot assign students to an exam with status '${exam.status}'. Only PENDING or ACTIVE exams allow assignment.`, 400);
        }

        const examSessions = await prisma.examSession.findMany({
            where: {
                examId: pExamId,
                isActive: true,
            },
            select: { id: true, maxAttendees: true, _count: { select: { studentAssignments: true } } }
        });

        if (examSessions.length === 0) {
            throw new AppError(`No active exam sessions found for Exam ID ${pExamId}.`, 404);
        }

        const availableSessions = examSessions
            .map(session => ({
                ...session,
                remainingCapacity: session.maxAttendees ? (session.maxAttendees - session._count.studentAssignments) : Infinity
            }))
            .filter(session => session.remainingCapacity > 0);

        if (availableSessions.length === 0) {
            throw new AppError(`All active exam sessions for Exam ID ${pExamId} are currently full.`, 400);
        }

        const shuffledSessions = shuffleArray(availableSessions);
        let currentSessionIndex = 0;

        const studentWhereClause = { isActive: true };
        if (studentFilters.studentIds && studentFilters.studentIds.length > 0) {
            studentWhereClause.id = { in: studentFilters.studentIds.map(id => parseInt(id, 10)) };
        }
        if (studentFilters.programId) {
            studentWhereClause.programId = parseInt(studentFilters.programId, 10);
        }
        if (studentFilters.levelId) {
            studentWhereClause.currentLevelId = parseInt(studentFilters.levelId, 10);
        }
        if (studentFilters.departmentId) {
            studentWhereClause.departmentId = parseInt(studentFilters.departmentId, 10);
        }

        studentWhereClause.registrations = {
            some: {
                courseId: exam.courseId,
                semesterId: exam.semesterId,
                seasonId: exam.seasonId,
            }
        };

        const studentsToAssign = await prisma.student.findMany({
            where: studentWhereClause,
            select: { id: true, regNo: true, name: true }
        });

        if (studentsToAssign.length === 0) {
            throw new AppError('No eligible students found matching the provided criteria and course registration for this exam.', 404);
        }

        const shuffledStudents = shuffleArray(studentsToAssign);

        const successfulAssignments = [];
        const failedAssignments = [];

        await prisma.$transaction(async (tx) => {
            for (const student of shuffledStudents) {
                const existingAssignmentForExam = await tx.studentExamSessionAssignment.findFirst({
                    where: {
                        studentId: student.id,
                        examId: pExamId
                    }
                });

                if (existingAssignmentForExam && !overwriteExisting) {
                    failedAssignments.push({ studentId: student.id, reason: `Already assigned to a session for exam ID ${pExamId}.` });
                    continue;
                }

                let assigned = false;
                let attempts = 0;
                const maxAttempts = shuffledSessions.length;

                while (!assigned && attempts < maxAttempts) {
                    const session = shuffledSessions[currentSessionIndex];

                    if (session.remainingCapacity > 0) {
                        try {
                            const dataToCreate = {
                                studentId: student.id,
                                examSessionId: session.id,
                                examId: pExamId,
                                seatNumber: null,
                            };

                            let newAssignment;
                            if (existingAssignmentForExam && overwriteExisting) {
                                newAssignment = await tx.studentExamSessionAssignment.update({
                                    where: { id: existingAssignmentForExam.id },
                                    data: { examSessionId: session.id, examId: pExamId },
                                    select: assignmentSelection
                                });
                            } else {
                                newAssignment = await tx.studentExamSessionAssignment.create({
                                    data: dataToCreate,
                                    select: assignmentSelection
                                });
                            }

                            successfulAssignments.push(newAssignment);
                            session.remainingCapacity--;
                            assigned = true;
                        } catch (error) {
                            if (error.code === 'P2002' && error.meta?.target?.includes('studentId_examSessionId')) {
                                failedAssignments.push({ studentId: student.id, reason: `Already assigned to session ID ${session.id} for exam ID ${pExamId}.` });
                                assigned = true;
                            } else {
                                console.error(`Error assigning student ${student.id} to session ${session.id}:`, error.message);
                            }
                        }
                    }

                    currentSessionIndex = (currentSessionIndex + 1) % shuffledSessions.length;
                    attempts++;
                }

                if (!assigned) {
                    failedAssignments.push({ studentId: student.id, reason: 'No available sessions with capacity could be found for assignment.' });
                }
            }
        }, {
            timeout: 60000
        });

        return {
            successfulAssignments,
            failedAssignments,
            totalStudentsProcessed: shuffledStudents.length,
            totalSuccessful: successfulAssignments.length,
            totalFailed: failedAssignments.length
        };

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("[STUDENT_EXAM_ASSIGNMENT_SERVICE] batchAssignStudentsToExamSessions:", error.message, error.stack);
        throw new AppError('Could not perform batch assignment of students to exam sessions.', 500);
    }
};

/**
 * Assigns a batch of students to a *specific* exam session.
 *
 * @param {number} examSessionId The ID of the specific exam session to assign students to.
 * @param {object} studentFilters Criteria to filter students (e.g., { studentIds: [1,2,3], programId: 1 }).
 * @param {object} options Additional options for assignment (e.g., { overwriteExisting: false }).
 * @param {object} requestingUser The user performing the action, for authorization.
 * @returns {Promise<object>} An object containing successful and failed assignments.
 */
export const batchAssignStudentsToSpecificSession = async (examSessionId, studentFilters, options = {}, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const pExamSessionId = parseInt(examSessionId, 10);
        if (isNaN(pExamSessionId)) throw new AppError('Invalid Exam Session ID format.', 400);
        if (!studentFilters || Object.keys(studentFilters).length === 0) {
            throw new AppError('Student filters are required for batch assignment.', 400);
        }

        const { overwriteExisting = false } = options;

        const targetSession = await prisma.examSession.findUnique({
            where: { id: pExamSessionId },
            include: {
                exam: { select: { id: true, courseId: true, semesterId: true, seasonId: true, status: true } },
                _count: { select: { studentAssignments: true } }
            }
        });

        if (!targetSession) throw new AppError(`Exam Session with ID ${pExamSessionId} not found.`, 404);
        if (!targetSession.isActive) throw new AppError(`Target exam session is not active.`, 400);
        if (!targetSession.exam) throw new AppError(`Exam details missing for session ID ${pExamSessionId}. Internal error.`, 500);
        if (targetSession.exam.status !== ExamStatus.PENDING && targetSession.exam.status !== ExamStatus.ACTIVE) {
            throw new AppError(`Cannot assign students to an exam with status '${targetSession.exam.status}'.`, 400);
        }

        if (!await canUserManageExamSessions(requestingUser, targetSession.exam.id)) {
            throw new AppError('You are not authorized to manage assignments for this exam session.', 403);
        }

        let currentAssignmentsCount = targetSession._count.studentAssignments;
        let remainingCapacity = targetSession.maxAttendees ? (targetSession.maxAttendees - currentAssignmentsCount) : Infinity;

        if (remainingCapacity <= 0) {
            throw new AppError(`Target exam session ID ${pExamSessionId} is already full.`, 400);
        }

        const studentWhereClause = { isActive: true };
        if (studentFilters.studentIds && studentFilters.studentIds.length > 0) {
            studentWhereClause.id = { in: studentFilters.studentIds.map(id => parseInt(id, 10)) };
        }
        if (studentFilters.programId) {
            studentWhereClause.programId = parseInt(studentFilters.programId, 10);
        }
        if (studentFilters.levelId) {
            studentWhereClause.currentLevelId = parseInt(studentFilters.levelId, 10);
        }
        if (studentFilters.departmentId) {
            studentWhereClause.departmentId = parseInt(studentFilters.departmentId, 10);
        }

        studentWhereClause.registrations = {
            some: {
                courseId: targetSession.exam.courseId,
                semesterId: targetSession.exam.semesterId,
                seasonId: targetSession.exam.seasonId,
            }
        };

        const studentsToAssign = await prisma.student.findMany({
            where: studentWhereClause,
            select: { id: true, regNo: true, name: true }
        });

        if (studentsToAssign.length === 0) {
            throw new AppError('No eligible students found matching the provided criteria and course registration for this exam.', 404);
        }

        const successfulAssignments = [];
        const failedAssignments = [];

        await prisma.$transaction(async (tx) => {
            for (const student of studentsToAssign) {
                if (remainingCapacity <= 0) {
                    failedAssignments.push({ studentId: student.id, reason: 'Session became full during batch assignment.' });
                    continue;
                }

                const existingAssignmentForExam = await tx.studentExamSessionAssignment.findFirst({
                    where: {
                        studentId: student.id,
                        examId: targetSession.exam.id
                    }
                });

                if (existingAssignmentForExam) {
                    if (existingAssignmentForExam.examSessionId === pExamSessionId) {
                        failedAssignments.push({ studentId: student.id, reason: `Already assigned to this specific session (ID: ${pExamSessionId}).` });
                        continue;
                    } else if (!overwriteExisting) {
                        failedAssignments.push({ studentId: student.id, reason: `Already assigned to a different session (ID: ${existingAssignmentForExam.examSessionId}) for exam ID ${targetSession.exam.id}.` });
                        continue;
                    } else {
                        await tx.studentExamSessionAssignment.delete({
                            where: { id: existingAssignmentForExam.id }
                        });
                    }
                }

                try {
                    const newAssignment = await tx.studentExamSessionAssignment.create({
                        data: {
                            studentId: student.id,
                            examSessionId: pExamSessionId,
                            examId: targetSession.exam.id,
                            seatNumber: null,
                        },
                        select: assignmentSelection
                    });
                    successfulAssignments.push(newAssignment);
                    remainingCapacity--;
                } catch (error) {
                    if (error.code === 'P2002' && error.meta?.target?.includes('studentId_examSessionId')) {
                        failedAssignments.push({ studentId: student.id, reason: `Already assigned to this session (ID: ${pExamSessionId}) during transaction.` });
                    } else {
                        console.error(`Error assigning student ${student.id} to session ${pExamSessionId}:`, error.message);
                        failedAssignments.push({ studentId: student.id, reason: `Database error: ${error.message}` });
                    }
                }
            }
        }, {
            timeout: 60000
        });

        return {
            successfulAssignments,
            failedAssignments,
            totalStudentsProcessed: studentsToAssign.length,
            totalSuccessful: successfulAssignments.length,
            totalFailed: failedAssignments.length
        };

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("[STUDENT_EXAM_ASSIGNMENT_SERVICE] batchAssignStudentsToSpecificSession:", error.message, error.stack);
        throw new AppError('Could not perform batch assignment of students to the specific exam session.', 500);
    }
};


/**
 * Batch unassigns students from a specific exam session or an entire exam.
 * Students with existing exam attempts for the target session/exam cannot be unassigned.
 *
 * @param {number} targetId The ID of the ExamSession or Exam from which to unassign.
 * @param {'session' | 'exam'} targetType Specifies whether to unassign from a 'session' or an entire 'exam'.
 * @param {object} studentFilters Criteria to filter students to unassign (e.g., { studentIds: [1,2,3] }).
 * @param {object} requestingUser The user performing the action, for authorization.
 * @returns {Promise<object>} An object containing successful and failed unassignments.
 */
export const batchUnassignStudents = async (targetId, targetType, studentFilters = {}, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const pTargetId = parseInt(targetId, 10);
        if (isNaN(pTargetId)) throw new AppError(`Invalid ${targetType} ID format.`, 400);
        if (targetType !== 'session' && targetType !== 'exam') {
            throw new AppError('Invalid targetType. Must be "session" or "exam".', 400);
        }

        let examIdForAuth;
        if (targetType === 'session') {
            const session = await prisma.examSession.findUnique({
                where: { id: pTargetId },
                select: { examId: true }
            });
            if (!session) throw new AppError(`Exam Session with ID ${pTargetId} not found.`, 404);
            examIdForAuth = session.examId;
        } else { // targetType === 'exam'
            const exam = await prisma.exam.findUnique({
                where: { id: pTargetId },
                select: { id: true }
            });
            if (!exam) throw new AppError(`Exam with ID ${pTargetId} not found.`, 404);
            examIdForAuth = exam.id;
        }

        if (!await canUserManageExamSessions(requestingUser, examIdForAuth)) {
            throw new AppError('You are not authorized to batch unassign students from this exam/session.', 403);
        }

        const assignmentWhereClause = {};
        if (targetType === 'session') {
            assignmentWhereClause.examSessionId = pTargetId;
        } else { // targetType === 'exam'
            assignmentWhereClause.examId = pTargetId;
        }

        if (studentFilters.studentIds && studentFilters.studentIds.length > 0) {
            assignmentWhereClause.studentId = { in: studentFilters.studentIds.map(id => parseInt(id, 10)) };
        }

        const assignmentsToDelete = await prisma.studentExamSessionAssignment.findMany({
            where: assignmentWhereClause,
            select: { id: true, studentId: true, examSessionId: true, examId: true }
        });

        if (assignmentsToDelete.length === 0) {
            return {
                successfulUnassignments: [],
                failedUnassignments: [],
                totalStudentsProcessed: 0,
                totalSuccessful: 0,
                totalFailed: 0,
                message: 'No assignments found matching the criteria for unassignment.'
            };
        }

        const successfulUnassignments = [];
        const failedUnassignments = [];
        const assignmentIdsToActuallyDelete = [];

        await prisma.$transaction(async (tx) => {
            for (const assignment of assignmentsToDelete) {
                const attemptExists = await tx.examAttempt.findFirst({
                    where: {
                        studentId: assignment.studentId,
                        examSessionId: assignment.examSessionId,
                    }
                });

                if (attemptExists) {
                    failedUnassignments.push({
                        assignmentId: assignment.id,
                        studentId: assignment.studentId,
                        reason: 'Student has already started or completed an exam attempt for this session.',
                        attemptId: attemptExists.id
                    });
                } else {
                    assignmentIdsToActuallyDelete.push(assignment.id);
                }
            }

            if (assignmentIdsToActuallyDelete.length > 0) {
                const deleteResult = await tx.studentExamSessionAssignment.deleteMany({
                    where: { id: { in: assignmentIdsToActuallyDelete } }
                });
                const deletedAssignmentsDetails = assignmentsToDelete.filter(a => assignmentIdsToActuallyDelete.includes(a.id));
                successfulUnassignments.push(...deletedAssignmentsDetails);
            }
        }, {
            timeout: 60000
        });

        return {
            successfulUnassignments,
            failedUnassignments,
            totalStudentsProcessed: assignmentsToDelete.length,
            totalSuccessful: successfulUnassignments.length,
            totalFailed: failedUnassignments.length,
            message: `Batch unassignment completed. ${successfulUnassignments.length} assignments removed, ${failedUnassignments.length} failed.`
        };

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("[STUDENT_EXAM_ASSIGNMENT_SERVICE] batchUnassignStudents:", error.message, error.stack);
        throw new AppError('Could not perform batch unassignment of students.', 500);
    }
};


export const assignStudentToExamSession = async (assignmentData) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const { studentId, examSessionId, examId, seatNumber } = assignmentData; // <<< Now explicitly expecting examId

        if (!studentId || !examSessionId || !examId) { // <<< Added examId check
            throw new AppError('Student ID, Exam Session ID, and Exam ID are required.', 400);
        }

        const pStudentId = parseInt(studentId, 10);
        const pExamSessionId = parseInt(examSessionId, 10);
        const pExamId = parseInt(examId, 10); // <<< Parse examId

        if (isNaN(pStudentId) || isNaN(pExamSessionId) || isNaN(pExamId)) { // <<< Added examId check
            throw new AppError('Invalid ID format for student, exam, or exam session.', 400);
        }

        const [student, examSession] = await Promise.all([
            prisma.student.findUnique({ where: { id: pStudentId, isActive: true } }),
            prisma.examSession.findUnique({
                where: { id: pExamSessionId, isActive: true },
                include: { exam: true }
            })
        ]);

        if (!student) throw new AppError(`Active student with ID ${pStudentId} not found.`, 404);
        if (!examSession) throw new AppError(`Active exam session with ID ${pExamSessionId} not found.`, 404);
        if (!examSession.exam) throw new AppError(`Exam details missing for session ID ${pExamSessionId}. This is an internal error.`, 500);

        // Verify that the provided examId matches the examId of the fetched session
        if (examSession.exam.id !== pExamId) {
            throw new AppError(`The provided Exam ID (${pExamId}) does not match the exam associated with session ID (${pExamSessionId}).`, 400);
        }

        if (examSession.exam.status !== ExamStatus.PENDING && examSession.exam.status !== ExamStatus.ACTIVE) {
           throw new AppError(`Cannot assign student. Exam status is '${examSession.exam.status}'.`, 400);
        }

        if (examSession.maxAttendees) {
            const currentAssignments = await prisma.studentExamSessionAssignment.count({
                where: { examSessionId: pExamSessionId }
            });
            if (currentAssignments >= examSession.maxAttendees) {
                throw new AppError(`Exam session ID ${pExamSessionId} has reached its maximum attendee capacity (${examSession.maxAttendees}).`, 400);
            }
        }

        const isRegistered = await prisma.studentCourseRegistration.findFirst({
            where: {
                studentId: pStudentId,
                courseId: examSession.exam.courseId,
                semesterId: examSession.exam.semesterId,
                seasonId: examSession.exam.seasonId,
            }
        });
        if (!isRegistered) {
            throw new AppError(`Student (RegNo: ${student.regNo}) is not registered for the course (ID: ${examSession.exam.courseId}) in the required semester (ID: ${examSession.exam.semesterId}) and season (ID: ${examSession.exam.seasonId}).`, 400);
        }

        const newAssignment = await prisma.studentExamSessionAssignment.create({
            data: {
                studentId: pStudentId,
                examSessionId: pExamSessionId,
                examId: pExamId, // Store denormalized examId
                seatNumber: seatNumber || null,
            },
            select: assignmentSelection
        });
        return newAssignment;
    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2002') {
            throw new AppError('This student is already assigned to this exam session.', 409);
        }
        console.error("Error assigning student to exam session:", error.message, error.stack);
        throw new AppError('Could not assign student to exam session.', 500);
    }
};

export const getAssignmentsForSession = async (examSessionIdParam, query) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const examSessionId = parseInt(examSessionIdParam, 10);
        if (isNaN(examSessionId)) throw new AppError('Invalid Exam Session ID format.', 400);

        const { page = 1, limit = 20, studentName, studentRegNo } = query;
        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;

        const whereClause = {
            examSessionId: examSessionId,
            ...(studentName && { student: { name: { contains: studentName } } }),
            ...(studentRegNo && { student: { regNo: { contains: studentRegNo } } }),
        };

        const assignments = await prisma.studentExamSessionAssignment.findMany({
            where: whereClause,
            select: assignmentSelection,
            orderBy: { student: { name: 'asc' } },
            skip,
            take: limitNum,
        });
        const totalAssignments = await prisma.studentExamSessionAssignment.count({ where: whereClause });

        return {
            assignments,
            totalPages: Math.ceil(totalAssignments / limitNum),
            currentPage: pageNum,
            totalAssignments
        };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching assignments for session:", error.message, error.stack);
        throw new AppError('Could not retrieve assignments for this session.', 500);
    }
};

export const getAssignmentsForStudent = async (studentIdParam, query, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const studentId = parseInt(studentIdParam, 10);
        if (isNaN(studentId)) throw new AppError('Invalid Student ID format.', 400);

        const { page = 1, limit = 20, seasonId, semesterId, examType } = query;
        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;

        const whereClause = {
            studentId: studentId,
            ...(seasonId && { examSession: { exam: { seasonId: parseInt(seasonId, 10) } } }),
            ...(semesterId && { examSession: { exam: { semesterId: parseInt(semesterId, 10) } } }),
            ...(examType && { examSession: { exam: { examType: examType } } }),
        };

    if (requestingUser?.type === 'student' && requestingUser?.id === studentId) {
    whereClause.examSession = {
        ...whereClause.examSession,
        // Option 1: Only show if the exam is not YET OVER
        // endTime: { gt: new Date() } 

        // Option 2: Remove the strict status filters for now (temporary for testing)
        // isActive: true, // <--- You might remove this line
        // exam: {
        //     ...whereClause.examSession?.exam,
        //     status: ExamStatus.ACTIVE // <--- You might remove this block
        // }
    };
}

        const assignments = await prisma.studentExamSessionAssignment.findMany({
            where: whereClause,
            select: assignmentSelection,
            orderBy: { examSession: { startTime: 'asc' } },
            skip,
            take: limitNum,
        });
        const totalAssignments = await prisma.studentExamSessionAssignment.count({ where: whereClause });
        return {
            assignments,
            totalPages: Math.ceil(totalAssignments / limitNum),
            currentPage: pageNum,
            totalAssignments
        };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching assignments for student:", error.message, error.stack);
        throw new AppError('Could not retrieve assignments for this student.', 500);
    }
};

export const getAssignmentById = async (assignmentIdParam /*, requestingUser */) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const assignmentId = parseInt(assignmentIdParam, 10);
        if (isNaN(assignmentId)) throw new AppError('Invalid Assignment ID format.', 400);

        const assignment = await prisma.studentExamSessionAssignment.findUnique({
            where: { id: assignmentId },
            select: assignmentSelection,
        });

        if (!assignment) throw new AppError('Exam session assignment not found.', 404);
        return assignment;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching assignment by ID:", error.message, error.stack);
        throw new AppError('Could not retrieve assignment details.', 500);
    }
};

export const updateAssignmentSeat = async (assignmentIdParam, seatNumber) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const assignmentId = parseInt(assignmentIdParam, 10);
        if (isNaN(assignmentId)) throw new AppError('Invalid Assignment ID format.', 400);

        if (seatNumber === undefined) {
            throw new AppError('The "seatNumber" field is required in the request body for update (can be null or empty string).', 400);
        }

        const existingAssignment = await prisma.studentExamSessionAssignment.findUnique({
            where: { id: assignmentId }
        });
        if (!existingAssignment) throw new AppError('Assignment not found for update.', 404);

        const seatToSet = (seatNumber === "" || seatNumber === null) ? null : seatNumber;
        if (seatToSet) {
            const seatTaken = await prisma.studentExamSessionAssignment.findFirst({
                where: {
                    examSessionId: existingAssignment.examSessionId,
                    seatNumber: seatToSet,
                    id: { not: assignmentId }
                }
            });
            if (seatTaken) {
                throw new AppError(`Seat number '${seatToSet}' is already assigned in this exam session.`, 409);
            }
        }

        const updatedAssignment = await prisma.studentExamSessionAssignment.update({
            where: { id: assignmentId },
            data: { seatNumber: seatToSet },
            select: assignmentSelection
        });
        return updatedAssignment;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error updating assignment seat:", error.message, error.stack);
        throw new AppError('Could not update assignment seat number.', 500);
    }
};

export const removeStudentFromExamSession = async (assignmentIdParam) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const assignmentId = parseInt(assignmentIdParam, 10);
        if (isNaN(assignmentId)) throw new AppError('Invalid Assignment ID format.', 400);

        const assignmentToDelete = await prisma.studentExamSessionAssignment.findUnique({
            where: { id: assignmentId },
            include: { examSession: { include: { exam: true } } }
        });
        if (!assignmentToDelete) throw new AppError('Exam session assignment not found for deletion.', 404);

        const now = new Date();
        if (new Date(assignmentToDelete.examSession.startTime) < now && assignmentToDelete.examSession.exam.status === ExamStatus.ACTIVE) {
            const attemptExists = await prisma.examAttempt.findFirst({
                where: { studentId: assignmentToDelete.studentId, examSessionId: assignmentToDelete.examSessionId }
            });
            if (attemptExists) {
                throw new AppError('Cannot unassign student. An exam attempt has already been started or recorded for this session.', 400);
            }
            console.warn(`Unassigning student from an exam session (ID: ${assignmentToDelete.examSessionId}) that has already started.`);
        }

        await prisma.studentExamSessionAssignment.delete({
            where: { id: assignmentId },
        });
        return { message: 'Student successfully unassigned from the exam session.' };
    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2003') {
            throw new AppError('Cannot delete session due to existing relations (e.g. attempts).', 400);
        }
        console.error("Error removing student from exam session:", error.message, error.stack);
        throw new AppError('Could not remove student from exam session.', 500);
    }
};