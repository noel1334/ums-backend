// src/services/score.service.js

import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import { calculateGradeAndPoint } from '../utils/grading.utils.js'; 
import { LecturerRole } from '../generated/prisma/index.js';

// --- SELECTION OBJECT ---
const scorePublicSelection = {
    id: true,
    firstCA: true,
    secondCA: true,
    examScore: true,
    totalScore: true,
    grade: true,
    point: true,
    cuGp: true,
    submittedAt: true,
    isApprovedByExaminer: true,
    examinerApprovedAt: true,
    isAcceptedByHOD: true,
    hodAcceptedAt: true,
    createdAt: true,
    updatedAt: true,
    studentCourseRegistration: {
        select: {
            id: true,
            student: { select: { id: true, regNo: true, name: true, departmentId: true } },
            course: { select: { id: true, code: true, title: true, creditUnit: true } },
            semester: { select: { id: true, name: true, type: true } },
            season: { select: { id: true, name: true } },
        }
    },
    submittedByLecturer: { select: { id: true, name: true, staffId: true } },
    submittedByICTStaff: { select: { id: true, name: true, staffId: true } }, 
    examinerWhoApproved: { select: { id: true, name: true, staffId: true } },
    hodWhoAccepted: { select: { id: true, name: true, staffId: true } },
    resultId: true,
};

// Helper to check if a lecturer is assigned
async function isLecturerAssigned(lecturerId, registration) {
    if (!registration) return false;
    return !!await prisma.staffCourse.findFirst({
        where: {
            lecturerId,
            courseId: registration.courseId,
            semesterId: registration.semesterId,
            seasonId: registration.seasonId,
        }
    });
}

/**
 * Helper for core score validation.
 */
function validateScoreData(data, existingScore = {}) {
    const dataForDb = {
        firstCA: data.firstCA !== undefined ? (data.firstCA === null ? null : parseFloat(data.firstCA)) : (existingScore.firstCA ?? null),
        secondCA: data.secondCA !== undefined ? (data.secondCA === null ? null : parseFloat(data.secondCA)) : (existingScore.secondCA ?? null),
        examScore: data.examScore !== undefined ? (data.examScore === null ? null : parseFloat(data.examScore)) : (existingScore.examScore ?? null),
    };

    for (const key of ['firstCA', 'secondCA', 'examScore']) {
        if (dataForDb[key] !== null && (isNaN(dataForDb[key]) || dataForDb[key] < 0)) {
            throw new AppError(`Invalid value for ${key}. Must be a non-negative number or null.`, 400);
        }
    }
    
    if (dataForDb.firstCA > 30) throw new AppError('First CA cannot exceed 30.', 400);
    if (dataForDb.secondCA > 30) throw new AppError('Second CA cannot exceed 30.', 400);
    if (dataForDb.examScore > 70) throw new AppError('Exam Score cannot exceed 70.', 400);

    dataForDb.totalScore = (dataForDb.firstCA || 0) + (dataForDb.secondCA || 0) + (dataForDb.examScore || 0);
    if (dataForDb.totalScore > 100) dataForDb.totalScore = 100;

    const { grade, point } = calculateGradeAndPoint(dataForDb.totalScore);
    dataForDb.grade = grade;
    dataForDb.point = point;
    
    return dataForDb;
}

/**
 * Submit CBT Exam Scores dynamically to specified score fields (firstCA, secondCA, examScore)
 */
export const submitCbtScores = async (submitData, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);

        const { courseId, seasonId, semesterId, scoreField, attemptIds } = submitData;

        if (!courseId || !seasonId || !semesterId || !scoreField || !Array.isArray(attemptIds) || attemptIds.length === 0) {
            throw new AppError('Missing required parameters for CBT score submission.', 400);
        }

        const pCourseId = parseInt(courseId, 10);
        const pSeasonId = parseInt(seasonId, 10);
        const pSemesterId = parseInt(semesterId, 10);

        // Map frontend fields safely to score model database fields
        const validFields = ['firstCA', 'secondCA', 'examScore'];
        if (!validFields.includes(scoreField)) {
            throw new AppError(`Invalid target score field: '${scoreField}'. Must be one of: ${validFields.join(', ')}`, 400);
        }

        // Fetch selected CBT exam attempts
        const attempts = await prisma.examAttempt.findMany({
            where: { id: { in: attemptIds.map(id => parseInt(id, 10)) } },
            include: { student: true, exam: true }
        });

        if (attempts.length === 0) {
            throw new AppError('No valid CBT exam attempts found for the selected IDs.', 404);
        }

        const processedScores = [];

        // Run the operations inside a transaction to ensure atomic execution
        await prisma.$transaction(async (tx) => {
            for (const attempt of attempts) {
                // Find matching course registration for the student
                const registration = await tx.studentCourseRegistration.findFirst({
                    where: {
                        studentId: attempt.studentId,
                        courseId: pCourseId,
                        semesterId: pSemesterId,
                        seasonId: pSeasonId
                    },
                    include: { course: true }
                });

                if (!registration) {
                    console.warn(`[CBT_SUBMISSION_WARNING] Student ID ${attempt.studentId} is not registered for course ID ${pCourseId}. Skipping.`);
                    continue;
                }

                // Check for existing score record
                const existingScore = await tx.score.findUnique({
                    where: { studentCourseRegistrationId: registration.id }
                });

                const scoreValue = attempt.scoreAchieved || 0;

                // Validate and update fields dynamically
                const updatePayload = {
                    [scoreField]: scoreValue
                };

                const validatedData = validateScoreData(updatePayload, existingScore || {});
                
                const creditUnit = registration.course.creditUnit || 0;
                validatedData.cuGp = (validatedData.point || 0) * creditUnit;

                // Set submitter context
                if (requestingUser.type === 'lecturer') {
                    validatedData.submittedByLecturerId = requestingUser.id;
                    validatedData.submittedByICTStaffId = null;
                } else if (requestingUser.type === 'ictstaff' && requestingUser.canManageScores) {
                    validatedData.submittedByICTStaffId = requestingUser.id;
                    validatedData.submittedByLecturerId = null;
                }
                validatedData.submittedAt = new Date();

                let savedScore;
                if (existingScore) {
                    // Reset approvals when updating values
                    validatedData.isApprovedByExaminer = false;
                    validatedData.isAcceptedByHOD = false;
                    validatedData.examinerWhoApprovedId = null;
                    validatedData.hodWhoAcceptedId = null;

                    savedScore = await tx.score.update({
                        where: { id: existingScore.id },
                        data: validatedData
                    });
                } else {
                    validatedData.studentCourseRegistrationId = registration.id;
                    savedScore = await tx.score.create({
                        data: validatedData
                    });

                    // Set score recorded status to true
                    await tx.studentCourseRegistration.update({
                        where: { id: registration.id },
                        data: { isScoreRecorded: true }
                    });
                }

                processedScores.push(savedScore);
            }
        });

        return {
            count: processedScores.length,
            message: `Successfully processed and recorded ${processedScores.length} CBT score(s).`
        };

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error submitting CBT scores:", error.message, error.stack);
        throw new AppError('Could not process CBT score submission.', 500);
    }
};

export const createScore = async (scoreData, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const { studentCourseRegistrationId } = scoreData;

        const pRegId = parseInt(studentCourseRegistrationId, 10);
        if (isNaN(pRegId)) throw new AppError('Invalid registration ID.', 400);

        const registration = await prisma.studentCourseRegistration.findUnique({
            where: { id: pRegId },
            include: { semester: true, course: { select: { creditUnit: true } } }
        });
        if (!registration) throw new AppError('Student course registration not found.', 404);

        const existingScore = await prisma.score.findUnique({ where: { studentCourseRegistrationId: pRegId } });
        if (existingScore) throw new AppError('A score for this registration already exists. Use update instead.', 409);

        const isAdmin = requestingUser.type === 'admin';
        const isPermittedICT = requestingUser.type === 'ictstaff' && requestingUser.canManageScores;
        const isAssignedLecturer = requestingUser.type === 'lecturer' && await isLecturerAssigned(requestingUser.id, registration);

        if (!isAdmin && !isPermittedICT && !isAssignedLecturer) {
            throw new AppError('You are not authorized to create a score for this course.', 403);
        }
        if (registration.semester.areLecturerScoreEditsLocked && !isAdmin && !isPermittedICT) {
            throw new AppError('Score entry period is locked for this semester.', 400);
        }

        const dataForDb = validateScoreData(scoreData);
        
        const creditUnit = registration.course.creditUnit || 0;
        dataForDb.cuGp = (dataForDb.point || 0) * creditUnit;

        if (requestingUser.type === 'lecturer') {
            dataForDb.submittedByLecturerId = requestingUser.id;
            dataForDb.submittedByICTStaffId = null;
        } else if (isPermittedICT) {
            dataForDb.submittedByICTStaffId = requestingUser.id;
            dataForDb.submittedByLecturerId = null;
        }
        
        dataForDb.submittedAt = new Date();
        dataForDb.studentCourseRegistrationId = pRegId;

        const [newScore] = await prisma.$transaction([
            prisma.score.create({ data: dataForDb, select: scorePublicSelection }),
            prisma.studentCourseRegistration.update({
                where: { id: pRegId },
                data: { isScoreRecorded: true }
            })
        ]);

        return newScore;

    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2002') throw new AppError('A score record conflict occurred.', 409);
        console.error("Error creating score:", error.message, error.stack);
        throw new AppError('Could not record score.', 500);
    }
};

export const updateScore = async (scoreId, scoreData, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const pScoreId = parseInt(scoreId, 10);
        if (isNaN(pScoreId)) throw new AppError('Invalid score ID.', 400);

        const score = await prisma.score.findUnique({
            where: { id: pScoreId },
            include: { studentCourseRegistration: { include: { semester: true, course: { select: { creditUnit: true } } } } }
        });
        if (!score) throw new AppError('Score record not found.', 404);

        const isAdmin = requestingUser.type === 'admin';
        const isPermittedICT = requestingUser.type === 'ictstaff' && requestingUser.canManageScores;
        const isAssignedLecturer = requestingUser.type === 'lecturer' && await isLecturerAssigned(requestingUser.id, score.studentCourseRegistration);

        if (!isAdmin && !isPermittedICT && !isAssignedLecturer) {
            throw new AppError('You are not authorized to update this score.', 403);
        }
        if (score.isAcceptedByHOD && !isAdmin) throw new AppError('Score is finalized by HOD and cannot be modified.', 403);
        if (score.studentCourseRegistration.semester.areLecturerScoreEditsLocked && !isAdmin && !isPermittedICT) {
            throw new AppError('Score editing period is locked for this semester.', 400);
        }
        
        const dataForDb = validateScoreData(scoreData, score);
        
        const creditUnit = score.studentCourseRegistration.course.creditUnit || 0;
        dataForDb.cuGp = (dataForDb.point || 0) * creditUnit;
        
        dataForDb.isApprovedByExaminer = false;
        dataForDb.isAcceptedByHOD = false;
        dataForDb.examinerWhoApprovedId = null;
        dataForDb.hodWhoAcceptedId = null;
        
        if (requestingUser.type === 'lecturer') {
            dataForDb.submittedByLecturerId = requestingUser.id;
            dataForDb.submittedByICTStaffId = null; 
        } else if (isPermittedICT) {
            dataForDb.submittedByICTStaffId = requestingUser.id;
            dataForDb.submittedByLecturerId = null; 
        }
        dataForDb.submittedAt = new Date();

        const updatedScore = await prisma.score.update({
            where: { id: score.id },
            data: dataForDb,
            select: scorePublicSelection
        });

        return updatedNotification;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error updating score:", error.message);
        throw new AppError('Could not update score.', 500);
    }
};

export const approveScoreByExaminer = async (scoreId, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const pScoreId = parseInt(scoreId, 10);
        if (isNaN(pScoreId)) throw new AppError('Invalid score ID.', 400);

        const score = await prisma.score.findUnique({
            where: { id: pScoreId },
            include: { studentCourseRegistration: { include: { student: true } } }
        });

        if (!score) throw new AppError('Score not found.', 404);
        if (score.isApprovedByExaminer) throw new AppError('Score is already approved by an examiner.', 400);

        const isAdmin = requestingUser.type === 'admin';
        const isExaminerInDept = requestingUser.type === 'lecturer' &&
            requestingUser.role === LecturerRole.EXAMINER &&
            requestingUser.departmentId === score.studentCourseRegistration.student.departmentId;

        if (!isAdmin && !isExaminerInDept) throw new AppError('You are not authorized to approve this score.', 403);

        const updatedScore = await prisma.score.update({
            where: { id: score.id },
            data: {
                isApprovedByExaminer: true,
                examinerApprovedAt: new Date(),
                examinerWhoApprovedId: requestingUser.type === 'lecturer' ? requestingUser.id : null,
            },
            select: scorePublicSelection
        });
        return updatedScore;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error approving score by examiner:", error.message);
        throw new AppError('Could not approve score.', 500);
    }
};

export const acceptScoreByHOD = async (scoreId, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const pScoreId = parseInt(scoreId, 10);
        if (isNaN(pScoreId)) throw new AppError('Invalid score ID.', 400);

        const score = await prisma.score.findUnique({
            where: { id: pScoreId },
            include: { studentCourseRegistration: { include: { student: true } } }
        });

        if (!score) throw new AppError('Score not found.', 404);
        if (score.isAcceptedByHOD) throw new AppError('Score is already accepted by the HOD.', 400);
        if (!score.isApprovedByExaminer) throw new AppError('Score must be approved by an examiner first.', 400);

        const isAdmin = requestingUser.type === 'admin';
        const isHodInDept = requestingUser.type === 'lecturer' &&
            requestingUser.role === LecturerRole.HOD &&
            requestingUser.departmentId === score.studentCourseRegistration.student.departmentId;

        if (!isAdmin && !isHodInDept) throw new AppError('You are not authorized to accept this score.', 403);

        const updatedScore = await prisma.score.update({
            where: { id: score.id },
            data: {
                isAcceptedByHOD: true,
                hodAcceptedAt: new Date(),
                hodWhoAcceptedId: requestingUser.type === 'lecturer' ? requestingUser.id : null,
            },
            select: scorePublicSelection
        });
        return updatedScore;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error accepting score by HOD:", error.message);
        throw new AppError('Could not accept score.', 500);
    }
};

export const getScoreById = async (id, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const scoreIdNum = parseInt(id, 10);
        if (isNaN(scoreIdNum)) throw new AppError('Invalid score ID.', 400);

        const score = await prisma.score.findUnique({
            where: { id: scoreIdNum },
            select: scorePublicSelection
        });
        if (!score) throw new AppError('Score not found.', 404);

        const reg = score.studentCourseRegistration;
        const isAdmin = requestingUser.type === 'admin';
        const isPermittedICT = requestingUser.type === 'ictstaff' && requestingUser.canManageScores;
        const isStudentOwner = requestingUser.type === 'student' && requestingUser.id === reg.student.id;
        let isCourseLecturer = false;
        if (requestingUser.type === 'lecturer') {
            isCourseLecturer = await isLecturerAssigned(requestingUser.id, reg);
        }
        const isHODForDept = requestingUser.type === 'lecturer' &&
            requestingUser.role === LecturerRole.HOD &&
            requestingUser.departmentId === reg.student.departmentId;
        const isExaminerForDept = requestingUser.type === 'lecturer' &&
            requestingUser.role === LecturerRole.EXAMINER &&
            requestingUser.departmentId === reg.student.departmentId;

        if (isAdmin || isPermittedICT || isStudentOwner || isCourseLecturer || isHODForDept || isExaminerForDept) {
            return score;
        }
        throw new AppError('You are not authorized to view this score.', 403);

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching score by ID:", error.message);
        throw new AppError('Could not retrieve score.', 500);
    }
};

export const getAllScores = async (query, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const {
            studentId, courseId, semesterId, seasonId, departmentId, programId, levelId,
            isApprovedByExaminer, isAcceptedByHOD, studentCourseRegistrationIds,
            page = 1, limit = 10
        } = query;
        const where = {};
        const studentCourseRegistrationWhere = {};

        if (requestingUser.type === 'admin' || (requestingUser.type === 'ictstaff' && requestingUser.canManageScores)) {
            if (studentId) studentCourseRegistrationWhere.studentId = parseInt(studentId, 10);
            if (departmentId) studentCourseRegistrationWhere.student = { departmentId: parseInt(departmentId, 10) };
        } else if (requestingUser.type === 'student') {
            studentCourseRegistrationWhere.studentId = requestingUser.id;
        } else if (requestingUser.type === 'lecturer') {
            if (requestingUser.role === LecturerRole.HOD || requestingUser.role === LecturerRole.EXAMINER) {
                if (!requestingUser.departmentId) throw new AppError('Department info missing for HOD/Examiner.', 500);
                studentCourseRegistrationWhere.student = { departmentId: requestingUser.departmentId };
                if (studentId) studentCourseRegistrationWhere.studentId = parseInt(studentId, 10);
            } else { 
                const staffCourses = await prisma.staffCourse.findMany({
                    where: { lecturerId: requestingUser.id },
                    select: { courseId: true, semesterId: true, seasonId: true }
                });
                if (staffCourses.length === 0) return { scores: [], totalPages: 0, currentPage: 1, totalScores: 0 };
                studentCourseRegistrationWhere.OR = staffCourses.map(sc => ({
                    courseId: sc.courseId, semesterId: sc.semesterId, seasonId: sc.seasonId
                }));
            }
        } else {
            throw new AppError('Unauthorized to view scores.', 403);
        }

        if (courseId) studentCourseRegistrationWhere.courseId = parseInt(courseId, 10);
        if (semesterId) studentCourseRegistrationWhere.semesterId = parseInt(semesterId, 10);
        if (seasonId) studentCourseRegistrationWhere.seasonId = parseInt(seasonId, 10);
        if (levelId) studentCourseRegistrationWhere.levelId = parseInt(levelId, 10);
         if (studentCourseRegistrationIds && Array.isArray(studentCourseRegistrationIds)) {
            const pRegIds = studentCourseRegistrationIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
            if (pRegIds.length > 0) {
                studentCourseRegistrationWhere.id = { in: pRegIds };
            }
        }

        if (Object.keys(studentCourseRegistrationWhere).length > 0) {
            where.studentCourseRegistration = studentCourseRegistrationWhere;
        }

        if (isApprovedByExaminer !== undefined) where.isApprovedByExaminer = isApprovedByExaminer === 'true';
        if (isAcceptedByHOD !== undefined) where.isAcceptedByHOD = isAcceptedByHOD === 'true';

        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;

        const scores = await prisma.score.findMany({
            where, select: scorePublicSelection,
            orderBy: { studentCourseRegistration: { student: { regNo: 'asc' } } },
            skip, take: limitNum
        });
         const totalScores = await prisma.score.count({ where });
        return { scores, totalPages: Math.ceil(totalScores / limitNum), currentPage: pageNum, totalItems: totalScores };

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching scores:", error.message);
        throw new AppError('Could not retrieve scores.', 500);
    }
};

export const deleteScore = async (scoreId, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const pScoreId = parseInt(scoreId, 10);
        if (isNaN(pScoreId)) throw new AppError('Invalid score ID.', 400);

        const score = await prisma.score.findUnique({
            where: { id: pScoreId },
            include: { studentCourseRegistration: { include: { student: true, course: true, semester: true, season: true } } }
        });
        if (!score) throw new AppError('Score not found.', 404);

        const isAdmin = requestingUser.type === 'admin';
        const isPermittedICT = requestingUser.type === 'ictstaff' && requestingUser.canManageScores;
        let isAssignedLecturer = false;
        if (requestingUser.type === 'lecturer') {
            isAssignedLecturer = await isLecturerAssigned(requestingUser.id, score.studentCourseRegistration);
        }

        if (!(isAdmin || isPermittedICT || isAssignedLecturer)) {
            throw new AppError('You are not authorized to delete this score.', 403);
        }

        if (score.isAcceptedByHOD && !isAdmin) {
            throw new AppError('Cannot delete score: already accepted by HOD.', 400);
        }
        
        const isHODofStudentDept = requestingUser.type === 'lecturer' && requestingUser.role === LecturerRole.HOD &&
            requestingUser.departmentId === score.studentCourseRegistration.student.departmentId;

        if (score.isApprovedByExaminer && !isAdmin && !isHODofStudentDept) {
            throw new AppError('Cannot delete score: already approved by Examiner.', 400);
        }

        await prisma.$transaction(async (tx) => {
            await tx.score.delete({ where: { id: pScoreId } });
            await tx.studentCourseRegistration.update({
                where: { id: score.studentCourseRegistrationId },
                data: { isScoreRecorded: false }
            });
        });

        return { message: 'Score deleted successfully and registration marked as score not recorded.' };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error deleting score:", error.message);
        throw new AppError('Could not delete score.', 500);
    }
};

export const batchCreateScores = async (scoresData, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        if (!Array.isArray(scoresData) || scoresData.length === 0) {
            return [];
        }

        const isAdmin = requestingUser.type === 'admin';
        const isPermittedICT = requestingUser.type === 'ictstaff' && requestingUser.canManageScores;
        const isLecturer = requestingUser.type === 'lecturer';

        const transactions = [];
        const registrationIdsToUpdate = [];
        const successfulCreations = []; 
        
        const regIds = scoresData.map(d => parseInt(d.studentCourseRegistrationId, 10)).filter(id => !isNaN(id));
        const registrations = await prisma.studentCourseRegistration.findMany({
            where: { id: { in: regIds } },
            include: { semester: true, course: { select: { creditUnit: true } } }
        });
        const regMap = new Map(registrations.map(reg => [reg.id, reg]));

        for (const data of scoresData) {
            const { studentCourseRegistrationId } = data;
            const pRegId = parseInt(studentCourseRegistrationId, 10);
            if (isNaN(pRegId)) continue;

            const registration = regMap.get(pRegId);
            if (!registration) continue; 

            const existingScore = await prisma.score.findUnique({ where: { studentCourseRegistrationId: pRegId } });
            if (existingScore) continue; 

            const isAssignedLecturer = isLecturer && await isLecturerAssigned(requestingUser.id, registration);
            if (!isAdmin && !isPermittedICT && !isAssignedLecturer) {
                throw new AppError('Unauthorized to create scores for one or more courses.', 403);
            }
            if (registration.semester.areLecturerScoreEditsLocked && !isAdmin && !isPermittedICT) {
                throw new AppError('Score entry period is locked for one or more courses.', 400);
            }

            const dataForDb = validateScoreData(data);
            const creditUnit = registration.course.creditUnit || 0;
            dataForDb.cuGp = (dataForDb.point || 0) * creditUnit;
            
            if (isLecturer) {
                dataForDb.submittedByLecturerId = requestingUser.id;
                dataForDb.submittedByICTStaffId = null;
            } else if (isPermittedICT) {
                dataForDb.submittedByICTStaffId = requestingUser.id;
                dataForDb.submittedByLecturerId = null;
            }
            
            dataForDb.submittedAt = new Date();
            dataForDb.studentCourseRegistrationId = pRegId; 

            transactions.push(
                prisma.score.create({ data: dataForDb })
            );

            registrationIdsToUpdate.push(dataForDb.studentCourseRegistrationId);
            successfulCreations.push(dataForDb.studentCourseRegistrationId);
        }

        if (transactions.length === 0) return [];

        await prisma.$transaction(transactions);

        await prisma.studentCourseRegistration.updateMany({
            where: { id: { in: registrationIdsToUpdate } },
            data: { isScoreRecorded: true }
        });
        
        const finalCreatedScores = await prisma.score.findMany({
            where: { studentCourseRegistrationId: { in: successfulCreations } },
            select: scorePublicSelection
        });
        
        return finalCreatedScores;

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error in batchCreateScores:", error.message);
        throw new AppError('Could not process batch creation of scores. Transaction failed.', 500);
    }
};

export const batchUpdateScores = async (scoresData, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        if (!Array.isArray(scoresData) || scoresData.length === 0) {
            throw new AppError('An array of scores is required for batch update.', 400);
        }

        const isAdmin = requestingUser.type === 'admin';
        const isPermittedICT = requestingUser.type === 'ictstaff' && requestingUser.canManageScores;
        const isLecturer = requestingUser.type === 'lecturer';
        
        const transactions = [];
        const updatedScoreIds = [];
        
        const scoreIds = scoresData.map(d => parseInt(d.id, 10)).filter(id => !isNaN(id));
        const existingScoresWithReg = await prisma.score.findMany({
            where: { id: { in: scoreIds } },
            include: { studentCourseRegistration: { include: { semester: true, course: { select: { creditUnit: true } } } } }
        });
        const scoreMap = new Map(existingScoresWithReg.map(score => [score.id, score]));

        for (const data of scoresData) {
            const { id: scoreId, ...updateFields } = data;
            if (!scoreId) continue; 

            const pScoreId = parseInt(scoreId, 10);
            const score = scoreMap.get(pScoreId);
            
            if (!score) continue; 

            const isAssignedLecturer = isLecturer && await isLecturerAssigned(requestingUser.id, score.studentCourseRegistration);
            if (!isAdmin && !isPermittedICT && !isAssignedLecturer) {
                throw new AppError(`Unauthorized to update score ID ${pScoreId}.`, 403);
            }
            if (score.isAcceptedByHOD && !isAdmin) {
                throw new AppError(`Score ID ${pScoreId} is finalized by HOD and cannot be modified.`, 403);
            }
            if (score.studentCourseRegistration.semester.areLecturerScoreEditsLocked && !isAdmin && !isPermittedICT) {
                throw new AppError(`Score editing period is locked for score ID ${pScoreId}.`, 400);
            }

            const dataForDb = validateScoreData(updateFields, score);
            const creditUnit = score.studentCourseRegistration.course.creditUnit || 0;
            dataForDb.cuGp = (dataForDb.point || 0) * creditUnit;

            dataForDb.isApprovedByExaminer = false;
            dataForDb.isAcceptedByHOD = false;
            dataForDb.examinerWhoApprovedId = null;
            dataForDb.hodWhoAcceptedId = null;
            
            if (isLecturer) {
                dataForDb.submittedByLecturerId = requestingUser.id;
                dataForDb.submittedByICTStaffId = null;
            } else if (isPermittedICT) {
                dataForDb.submittedByICTStaffId = requestingUser.id;
                dataForDb.submittedByLecturerId = null;
            }
            dataForDb.submittedAt = new Date();

            transactions.push(
                prisma.score.update({
                    where: { id: pScoreId },
                    data: dataForDb,
                    select: scorePublicSelection
                })
            );
            updatedScoreIds.push(pScoreId);
        }

        await prisma.$transaction(transactions);

        const updatedScores = await prisma.score.findMany({
            where: { id: { in: updatedScoreIds } },
            select: scorePublicSelection
        });

        return updatedScores;

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error in batchUpdateScores:", error.message);
        throw new AppError('Could not process batch update of scores. Transaction failed.', 500);
    }
};

export const batchDeleteScores = async (scoreIds, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        if (!Array.isArray(scoreIds) || scoreIds.length === 0) {
            throw new AppError('An array of score IDs is required for batch delete.', 400);
        }

        const isAdmin = requestingUser.type === 'admin';
        const isPermittedICT = requestingUser.type === 'ictstaff' && requestingUser.canManageScores;
        
        const transactions = [];

        for (const scoreId of scoreIds) {
            const pScoreId = parseInt(scoreId, 10);
            if (isNaN(pScoreId)) {
                throw new AppError(`Invalid score ID ${scoreId} found in batch array.`, 400);
            }

            const score = await prisma.score.findUnique({
                where: { id: pScoreId },
                include: { studentCourseRegistration: { include: { student: true } } }
            });

            if (!score) continue; 

            const isAssignedLecturer = requestingUser.type === 'lecturer' && await isLecturerAssigned(requestingUser.id, score.studentCourseRegistration);
            if (!isAdmin && !isPermittedICT && !isAssignedLecturer) {
                throw new AppError(`Unauthorized to delete score ID ${pScoreId}.`, 403);
            }
            if (score.isAcceptedByHOD && !isAdmin) {
                throw new AppError(`Cannot delete score ID ${pScoreId}: already accepted by HOD.`, 400);
            }

            transactions.push(
                prisma.score.delete({ where: { id: pScoreId } }),
                prisma.studentCourseRegistration.update({
                    where: { id: score.studentCourseRegistrationId },
                    data: { isScoreRecorded: false }
                })
            );
        }

        await prisma.$transaction(transactions);
        return scoreIds.length;

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error in batchDeleteScores:", error.message);
        throw new AppError('Could not process batch deletion of scores. Transaction failed.', 500);
    }
};

export const deapproveScoreByExaminer = async (scoreId, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const pScoreId = parseInt(scoreId, 10);
        if (isNaN(pScoreId)) throw new AppError('Invalid score ID.', 400);

        const score = await prisma.score.findUnique({
            where: { id: pScoreId },
            include: { studentCourseRegistration: { include: { student: true } } }
        });

        if (!score) throw new AppError('Score not found.', 404);
        if (!score.isApprovedByExaminer) throw new AppError('Score is not currently approved by an examiner.', 400);
        
        if (score.isAcceptedByHOD) {
            throw new AppError('Cannot de-approve score. It has already been accepted by the HOD. The HOD must de-accept it first.', 403);
        }

        const isAdmin = requestingUser.type === 'admin';
        const isPermittedICT = requestingUser.type === 'ictstaff' && requestingUser.canManageScores;
        const isHODInDept = requestingUser.type === 'lecturer' &&
            requestingUser.role === LecturerRole.HOD &&
            requestingUser.departmentId === score.studentCourseRegistration.student.departmentId;
        const isExaminerInDept = requestingUser.type === 'lecturer' &&
            requestingUser.role === LecturerRole.EXAMINER &&
            requestingUser.departmentId === score.studentCourseRegistration.student.departmentId;

        if (!isAdmin && !isPermittedICT && !isHODInDept && !isExaminerInDept) {
            throw new AppError('You are not authorized to de-approve this score.', 403);
        }

        const updatedScore = await prisma.score.update({
            where: { id: pScoreId },
            data: {
                isApprovedByExaminer: false,
                examinerApprovedAt: null,
                examinerWhoApprovedId: null,
            },
            select: scorePublicSelection
        });
        return updatedScore;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error de-approving score by examiner:", error.message);
        throw new AppError('Could not de-approve score.', 500);
    }
};

export const deacceptScoreByHOD = async (scoreId, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const pScoreId = parseInt(scoreId, 10);
        if (isNaN(pScoreId)) throw new AppError('Invalid score ID.', 400);

        const score = await prisma.score.findUnique({
            where: { id: pScoreId },
            include: { studentCourseRegistration: { include: { student: true } } }
        });

        if (!score) throw new AppError('Score not found.', 404);
        if (!score.isAcceptedByHOD) throw new AppError('Score is not currently accepted by an HOD.', 400);

        const isAdmin = requestingUser.type === 'admin';
        const isPermittedICT = requestingUser.type === 'ictstaff' && requestingUser.canManageScores;
        const isHODInDept = requestingUser.type === 'lecturer' &&
            requestingUser.role === LecturerRole.HOD &&
            requestingUser.departmentId === score.studentCourseRegistration.student.departmentId;

        if (!isAdmin && !isPermittedICT && !isHODInDept) {
            throw new AppError('You are not authorized to de-accept this score.', 403);
        }

        const updatedScore = await prisma.score.update({
            where: { id: pScoreId },
            data: {
                isAcceptedByHOD: false,
                hodAcceptedAt: null,
                hodWhoAcceptedId: null,
            },
            select: scorePublicSelection
        });
        return updatedScore;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error de-accepting score by HOD:", error.message);
        throw new AppError('Could not de-accept score.', 500);
    }
};