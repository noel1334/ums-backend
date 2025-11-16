// src/services/examSession.service.js
import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import { hashPassword } from '../utils/password.utils.js'; // Assuming you have this utility

// Re-use canUserManageQuestionsForExam helper as canUserManageExam (same logic for now)
const canUserManageExam = async (user, examId) => {
    const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { courseId: true, createdByLecturerId: true, createdByICTStaffId: true } });
    if (!exam) throw new AppError('Exam not found for session authorization check.', 404);

    if (user.type === 'admin' || (user.type === 'ictstaff' && user.canManageExams)) return true;

    if (user.type === 'lecturer') {
        if (exam.createdByLecturerId === user.id) return true;
        const course = await prisma.course.findUnique({ where: { id: exam.courseId } });
        if(!course) return false;
        if (user.role === 'LECTURER') {
            const staffCourse = await prisma.staffCourse.findFirst({ where: { lecturerId: user.id, courseId: exam.courseId }});
            return !!staffCourse;
        }
        if (user.role === 'HOD' && course.departmentId === user.departmentId) return true;
    }
    return false;
};

const sessionSelection = {
    id: true, examId: true, venueId: true, sessionName: true, startTime: true, endTime: true,
    accessPassword: false, maxAttendees: true, isActive: true, createdAt: true, updatedAt: true,
    exam: { select: { id: true, title: true, courseId: true, semesterId: true, seasonId: true } }, // Include more exam details
    venue: { select: { id: true, name: true, location: true } }, // Include venue location
    _count: { select: { studentAssignments: true, examAttempts: true } }
};


export const createExamSession = async (examId, sessionData, creatingUser) => {
    try {
        const pExamId = parseInt(examId, 10);
        if (!await canUserManageExam(creatingUser, pExamId)) {
            throw new AppError('You are not authorized to create sessions for this exam.', 403);
        }

        const { venueId, sessionName, startTime, endTime, accessPassword, maxAttendees, isActive } = sessionData;
        if (!startTime || !endTime) throw new AppError('Start time and end time are required.', 400);
        // MODIFIED: venueId and sessionName are now required.
        if (!venueId) throw new AppError('Venue ID is required.', 400);
        if (!sessionName) throw new AppError('Session name is required.', 400);

        const dataToCreate = {
            examId: pExamId,
            startTime: new Date(startTime),
            endTime: new Date(endTime),
            sessionName,
            accessPassword: accessPassword ? await hashPassword(accessPassword) : null,
            maxAttendees: maxAttendees ? parseInt(maxAttendees) : null,
            isActive: isActive === undefined ? true : isActive,
        };
        
        // MODIFIED: venueId is now always required and validated here.
        const pVenueId = parseInt(venueId, 10);
        if (isNaN(pVenueId)) throw new AppError('Invalid Venue ID format.', 400);
        const venue = await prisma.venue.findUnique({ where: { id: pVenueId, isActive: true } });
        if (!venue) throw new AppError(`Active venue ID ${pVenueId} not found.`, 404);
        dataToCreate.venueId = pVenueId;
        

        const newSession = await prisma.examSession.create({ data: dataToCreate, select: sessionSelection });
        return newSession;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error creating exam session:", error.message, error.stack);
        throw new AppError('Could not create exam session.', 500);
    }
};

// --- MODIFIED SERVICE FUNCTION (now generic for all or exam-specific sessions) ---
export const getSessions = async (query, requestingUser) => {
    try {
        const { examId, page = 1, limit = 10, isActive, search } = query;
        const where = {}; 

        // Handle examId filtering and authorization
        if (examId) {
            const pExamId = parseInt(examId, 10);
            if (isNaN(pExamId)) throw new AppError("Invalid Exam ID format.", 400);
            where.examId = pExamId;

            if (!await canUserManageExam(requestingUser, pExamId)) {
                // For exam-specific session lists, students only see active/active exams
                if (requestingUser.type !== 'student') {
                    throw new AppError('You are not authorized to view sessions for this exam.', 403);
                }
            }
        } else {
            // If no examId is provided (e.g., a global /exam-sessions route, if it existed),
            // only admin/ictstaff can view ALL sessions globally.
            // This part of the logic is retained for completeness but will not be hit
            // by the `getSessionsForExam` controller in the nested router.
            if (requestingUser.type !== 'admin' && requestingUser.type !== 'ictstaff') {
                throw new AppError('You need to provide an Exam ID or have admin/ICT privileges to view all sessions.', 403);
            }
        }

        if (isActive !== undefined) where.isActive = isActive === 'true';

        // Add search capability across session name, exam title, and venue name
        if (search) {
            where.OR = [
                { sessionName: { contains: search, mode: 'insensitive' } },
                { exam: { title: { contains: search, mode: 'insensitive' } } },
                { venue: { name: { contains: search, mode: 'insensitive' } } },
            ];
        }

        // For students, only show active sessions for active exams (when fetching all or specific exam sessions)
        if (requestingUser.type === 'student') {
            where.isActive = true;
            where.exam = { status: 'ACTIVE' }; // Ensure the parent exam is active
        }

        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;

        const sessions = await prisma.examSession.findMany({
            where, select: sessionSelection,
            orderBy: { startTime: 'asc' },
            skip,
            take: limitNum
        });
        const totalSessions = await prisma.examSession.count({ where });

        return { sessions, totalPages: Math.ceil(totalSessions / limitNum), currentPage: pageNum, totalSessions };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("[EXAM_SESSION_SERVICE] getSessions:", error.message, error.stack);
        throw new AppError('Could not retrieve exam sessions.', 500);
    }
};

// You can keep `getSessionsForExam` as a thin wrapper if you prefer specific method names, or remove it.
// It effectively just passes the examId from the params to the generic getSessions method.
export const getSessionsForExam = async (examId, query, requestingUser) => {
    return getSessions({ ...query, examId }, requestingUser);
};


export const getExamSessionById = async (sessionId, requestingUser) => {
    try {
        const id = parseInt(sessionId, 10);
        const session = await prisma.examSession.findUnique({ where: {id}, select: sessionSelection });
        if(!session) throw new AppError("Exam session not found.", 404);

        if (!await canUserManageExam(requestingUser, session.examId)) { 
            // Allow students to view active sessions for active exams
            if (requestingUser.type !== 'student' || !session.isActive || session.exam.status !== 'ACTIVE') {
                throw new AppError('You are not authorized to view this exam session.', 403);
            }
        }
        return session;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching session by ID:", error.message, error.stack);
        throw new AppError('Could not retrieve session.', 500);
    }
};


export const updateExamSession = async (sessionId, updateData, updatingUser) => {
    try {
        const id = parseInt(sessionId, 10);
        const existingSession = await prisma.examSession.findUnique({ where: { id } });
        if (!existingSession) throw new AppError('Exam session not found for update.', 404);

        if (!await canUserManageExam(updatingUser, existingSession.examId)) {
            throw new AppError('You are not authorized to update this exam session.', 403);
        }

        // Add checks: cannot update if attempts exist or session is completed.
        const attempts = await prisma.examAttempt.count({where: {examSessionId: id}});
        if(attempts > 0) {
            // Allow only isActive update or similar minor changes if attempts exist
            if(updateData.startTime || updateData.endTime || updateData.venueId || updateData.examId){
                 throw new AppError('Cannot change core session details once attempts have begun. You may update isActive or sessionName.', 400);
            }
        }

        const dataToUpdate = {...updateData};
        if(dataToUpdate.startTime) dataToUpdate.startTime = new Date(dataToUpdate.startTime);
        if(dataToUpdate.endTime) dataToUpdate.endTime = new Date(dataToUpdate.endTime);
        if(dataToUpdate.accessPassword) dataToUpdate.accessPassword = await hashPassword(dataToUpdate.accessPassword);
        else if (dataToUpdate.accessPassword === null || dataToUpdate.accessPassword === '') dataToUpdate.accessPassword = null;

        // MODIFIED: Handle venueId update with validation
        if (dataToUpdate.venueId !== undefined) { 
            const pVenueId = parseInt(dataToUpdate.venueId, 10);
            if (isNaN(pVenueId)) throw new AppError('Invalid Venue ID format for update.', 400);
            const venue = await prisma.venue.findUnique({ where: { id: pVenueId, isActive: true } });
            if (!venue) throw new AppError(`Active venue ID ${pVenueId} not found for update.`, 404);
            dataToUpdate.venueId = pVenueId;
        }

        delete dataToUpdate.id;
        delete dataToUpdate.examId; // Exam of session should not change

        const updatedSession = await prisma.examSession.update({
            where: { id }, data: dataToUpdate, select: sessionSelection
        });
        return updatedSession;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error updating exam session:", error.message, error.stack);
        throw new AppError('Could not update exam session.', 500);
    }
};

export const deleteExamSession = async (sessionId, deletingUser) => {
     try {
        const id = parseInt(sessionId, 10);
        const sessionToDelete = await prisma.examSession.findUnique({ where: { id }, include: { _count: {select: { examAttempts: true, studentAssignments: true }}}});
        if (!sessionToDelete) throw new AppError('Exam session not found for deletion.', 404);

        if (!await canUserManageExam(deletingUser, sessionToDelete.examId)) {
            throw new AppError('You are not authorized to delete this exam session.', 403);
        }

        if(sessionToDelete._count.examAttempts > 0){
            throw new AppError('Cannot delete session with student attempts. Clear attempts or archive.', 400);
        }
        // StudentExamSessionAssignments will be cascade deleted by schema

        await prisma.examSession.delete({ where: { id } });
        return { message: 'Exam session and its assignments permanently deleted.' };
    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2003') throw new AppError('Cannot delete session due to existing relations (e.g. attempts).', 400);
        console.error("Error deleting exam session:", error.message, error.stack);
        throw new AppError('Could not delete exam session.', 500);
    }
};