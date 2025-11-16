import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
// NOTE: Assuming this utility function is correctly defined and available
import { calculateGradeAndPoint } from '../utils/grading.utils.js'; 
import { LecturerRole } from '../generated/prisma/index.js';

const scorePublicSelection = {
    id: true,
    firstCA: true,
    secondCA: true,
    examScore: true,
    totalScore: true,
    grade: true,
    point: true,
    cuGp: true, // <--- ADDED NEW FIELD
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
            course: { select: { id: true, code: true, title: true, creditUnit: true } }, // <--- CREDIT UNIT IS CRUCIAL HERE
            semester: { select: { id: true, name: true, type: true } },
            season: { select: { id: true, name: true } },
        }
    },
    submittedByLecturer: { select: { id: true, name: true, staffId: true } },
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
 * It now returns the calculated data, including the new 'cuGp' field.
 * NOTE: The logic has been adjusted to handle the new flow of fetching course credit unit.
 */
function validateScoreData(data, existingScore = {}) {
    const dataForDb = {
        firstCA: data.firstCA !== undefined ? (data.firstCA === null ? null : parseFloat(data.firstCA)) : (existingScore.firstCA ?? null),
        secondCA: data.secondCA !== undefined ? (data.secondCA === null ? null : parseFloat(data.secondCA)) : (existingScore.secondCA ?? null),
        examScore: data.examScore !== undefined ? (data.examScore === null ? null : parseFloat(data.examScore)) : (existingScore.examScore ?? null),
    };

    // Basic validation for scores
    for (const key of ['firstCA', 'secondCA', 'examScore']) {
        if (dataForDb[key] !== null && (isNaN(dataForDb[key]) || dataForDb[key] < 0)) {
            throw new AppError(`Invalid value for ${key}. Must be a non-negative number or null.`, 400);
        }
    }
    // Specific validation based on your system's total breakdown (e.g., CA=30, Exam=70)
    if (dataForDb.firstCA > 30) throw new AppError('First CA cannot exceed 30.', 400);
    if (dataForDb.secondCA > 30) throw new AppError('Second CA cannot exceed 30.', 400);
    if (dataForDb.examScore > 70) throw new AppError('Exam Score cannot exceed 70.', 400);

    dataForDb.totalScore = (dataForDb.firstCA || 0) + (dataForDb.secondCA || 0) + (dataForDb.examScore || 0);
    if (dataForDb.totalScore > 100) dataForDb.totalScore = 100;

    const { grade, point } = calculateGradeAndPoint(dataForDb.totalScore);
    dataForDb.grade = grade;
    dataForDb.point = point;
    
    // NOTE: cuGp is CALCULATED LATER in create/update functions where creditUnit is available
    // dataForDb.cuGp = ... 
    
    return dataForDb;
}


export const createScore = async (scoreData, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const { studentCourseRegistrationId } = scoreData;

        const pRegId = parseInt(studentCourseRegistrationId, 10);
        if (isNaN(pRegId)) throw new AppError('Invalid registration ID.', 400);

        const registration = await prisma.studentCourseRegistration.findUnique({
            where: { id: pRegId },
            include: { semester: true, course: { select: { creditUnit: true } } } // <--- FETCH CREDIT UNIT
        });
        if (!registration) throw new AppError('Student course registration not found.', 404);

        const existingScore = await prisma.score.findUnique({ where: { studentCourseRegistrationId: pRegId } });
        if (existingScore) throw new AppError('A score for this registration already exists. Use update instead.', 409);

        // Authorization checks remain
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
        
        // --- NEW LOGIC: Calculate CU * GP ---
        const creditUnit = registration.course.creditUnit || 0;
        dataForDb.cuGp = (dataForDb.point || 0) * creditUnit;
        // --- END NEW LOGIC ---

        if (requestingUser.type === 'lecturer') {
            dataForDb.submittedByLecturerId = requestingUser.id;
        }
        dataForDb.submittedAt = new Date();
        dataForDb.studentCourseRegistrationId = pRegId; // Set the FK

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

// --- UPDATE SCORE ---
export const updateScore = async (scoreId, scoreData, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const pScoreId = parseInt(scoreId, 10);
        if (isNaN(pScoreId)) throw new AppError('Invalid score ID.', 400);

        const score = await prisma.score.findUnique({
            where: { id: pScoreId },
            include: { studentCourseRegistration: { include: { semester: true, course: { select: { creditUnit: true } } } } } // <--- FETCH CREDIT UNIT
        });
        if (!score) throw new AppError('Score record not found.', 404);

        // Authorization checks remain
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
        
        // --- Score Calculation and Validation ---
        const dataForDb = validateScoreData(scoreData, score);
        
        // --- NEW LOGIC: Calculate CU * GP ---
        const creditUnit = score.studentCourseRegistration.course.creditUnit || 0;
        dataForDb.cuGp = (dataForDb.point || 0) * creditUnit;
        // --- END NEW LOGIC ---
        
        // When score is updated, reset approvals
        dataForDb.isApprovedByExaminer = false;
        dataForDb.isAcceptedByHOD = false;
        dataForDb.examinerWhoApprovedId = null;
        dataForDb.hodWhoAcceptedId = null;
        
        // Only update submittedByLecturerId if the user is a lecturer and not an admin/ICT staff
        if (requestingUser.type === 'lecturer') {
            dataForDb.submittedByLecturerId = requestingUser.id;
            dataForDb.submittedAt = new Date();
        } else if (isAdmin || isPermittedICT) {
            dataForDb.submittedAt = new Date();
        }

        const updatedScore = await prisma.score.update({
            where: { id: score.id },
            data: dataForDb,
            select: scorePublicSelection
        });

        return updatedScore;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error updating score:", error.message, error.stack);
        throw new AppError('Could not update score.', 500);
    }
};


// --- APPROVAL WORKFLOWS & GETTERS (The full logic from previous steps) ---

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
        console.error("Error approving score by examiner:", error.message, error.stack);
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
        console.error("Error accepting score by HOD:", error.message, error.stack);
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
        console.error("Error fetching score by ID:", error.message, error.stack);
        throw new AppError('Could not retrieve score.', 500);
    }
};

export const getAllScores = async (query, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const {
            studentId, courseId, semesterId, seasonId, departmentId, programId, levelId,
            isApprovedByExaminer, isAcceptedByHOD,
            page = 1, limit = 10
        } = query;
        const where = {};
        const studentCourseRegistrationWhere = {};

        if (requestingUser.type === 'admin' || (requestingUser.type === 'ictstaff' && requestingUser.canManageScores)) {
            // Full access with filters
            if (studentId) studentCourseRegistrationWhere.studentId = parseInt(studentId, 10);
            if (departmentId) studentCourseRegistrationWhere.student = { departmentId: parseInt(departmentId, 10) };
            // ... add other filters to studentCourseRegistrationWhere
        } else if (requestingUser.type === 'student') {
            studentCourseRegistrationWhere.studentId = requestingUser.id;
        } else if (requestingUser.type === 'lecturer') {
            if (requestingUser.role === LecturerRole.HOD || requestingUser.role === LecturerRole.EXAMINER) {
                if (!requestingUser.departmentId) throw new AppError('Department info missing for HOD/Examiner.', 500);
                studentCourseRegistrationWhere.student = { departmentId: requestingUser.departmentId };
                if (studentId) studentCourseRegistrationWhere.studentId = parseInt(studentId, 10);
            } else { // Regular lecturer
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
        return { scores, totalPages: Math.ceil(totalScores / limitNum), currentPage: pageNum, totalScores };

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching scores:", error.message, error.stack);
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

        // Authorization
        const isAdmin = requestingUser.type === 'admin';
        const isPermittedICT = requestingUser.type === 'ictstaff' && requestingUser.canManageScores;
        let isAssignedLecturer = false;
        if (requestingUser.type === 'lecturer') {
            isAssignedLecturer = await isLecturerAssigned(requestingUser.id, score.studentCourseRegistration);
        }

        if (!(isAdmin || isPermittedICT || isAssignedLecturer)) {
            throw new AppError('You are not authorized to delete this score.', 403);
        }

        // Business rule: Cannot delete if HOD accepted (unless admin)
        if (score.isAcceptedByHOD && !isAdmin) {
            throw new AppError('Cannot delete score: already accepted by HOD.', 400);
        }
        // Business rule: Cannot delete if Examiner approved (unless admin or HOD of dept)
        const isHODofStudentDept = requestingUser.type === 'lecturer' && requestingUser.role === LecturerRole.HOD &&
            requestingUser.departmentId === score.studentCourseRegistration.student.departmentId;

        if (score.isApprovedByExaminer && !isAdmin && !isHODofStudentDept) {
            throw new AppError('Cannot delete score: already approved by Examiner.', 400);
        }


        await prisma.$transaction(async (tx) => {
            await tx.score.delete({ where: { id: pScoreId } });
            // Reset isScoreRecorded on the registration
            await tx.studentCourseRegistration.update({
                where: { id: score.studentCourseRegistrationId },
                data: { isScoreRecorded: false }
            });
        });

        return { message: 'Score deleted successfully and registration marked as score not recorded.' };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error deleting score:", error.message, error.stack);
        throw new AppError('Could not delete score.', 500);
    }
};


// --- BATCH SCORE OPERATIONS ---
/**
 * Creates multiple score records in a single transaction.
 * @param {Array<Object>} scoresData - Array of score data objects.
 * @param {Object} requestingUser - The user initiating the action.
 * @returns {Promise<Array<Object>>} - The created score records.
 */
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
        
        // --- PRE-FETCH REGISTRATIONS AND COURSES ---
        const regIds = scoresData.map(d => parseInt(d.studentCourseRegistrationId, 10)).filter(id => !isNaN(id));
        const registrations = await prisma.studentCourseRegistration.findMany({
            where: { id: { in: regIds } },
            include: { semester: true, course: { select: { creditUnit: true } } } // FETCH CREDIT UNIT
        });
        const regMap = new Map(registrations.map(reg => [reg.id, reg]));
        // ------------------------------------------


        for (const data of scoresData) {
            const { studentCourseRegistrationId } = data;
            
            const pRegId = parseInt(studentCourseRegistrationId, 10);
            if (isNaN(pRegId)) continue;

            const registration = regMap.get(pRegId);
            if (!registration) continue; // Skip if registration not found (404)

            const existingScore = await prisma.score.findUnique({ where: { studentCourseRegistrationId: pRegId } });
            if (existingScore) continue; // Skip if already exists (should be in UPDATE batch)

            // Authorization checks remain
            const isAssignedLecturer = isLecturer && await isLecturerAssigned(requestingUser.id, registration);
            if (!isAdmin && !isPermittedICT && !isAssignedLecturer) {
                throw new AppError('Unauthorized to create scores for one or more courses.', 403);
            }
            if (registration.semester.areLecturerScoreEditsLocked && !isAdmin && !isPermittedICT) {
                throw new AppError('Score entry period is locked for one or more courses.', 400);
            }

            // Prepare Data
            const dataForDb = validateScoreData(data);
            
            // --- NEW LOGIC: Calculate CU * GP ---
            const creditUnit = registration.course.creditUnit || 0;
            dataForDb.cuGp = (dataForDb.point || 0) * creditUnit;
            // --- END NEW LOGIC ---
            
            if (requestingUser.type === 'lecturer') {
                dataForDb.submittedByLecturerId = requestingUser.id;
            }
            dataForDb.submittedAt = new Date();
            dataForDb.studentCourseRegistrationId = pRegId; 

            // PUSH RAW CREATE PROMISE
            transactions.push(
                prisma.score.create({ data: dataForDb })
            );

            registrationIdsToUpdate.push(dataForDb.studentCourseRegistrationId);
            successfulCreations.push(dataForDb.studentCourseRegistrationId); // Track successful ones
        }

        if (transactions.length === 0) return [];

        await prisma.$transaction(transactions);

        // Final Fetch and Return
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
        console.error("Error in batchCreateScores:", error.message, error.stack);
        throw new AppError('Could not process batch creation of scores. Transaction failed.', 500);
    }
};

/**
 * Updates multiple score records in a single transaction.
 * @param {Array<Object>} scoresData - Array of score data objects including score ID.
 * @param {Object} requestingUser - The user initiating the action.
 * @returns {Promise<Array<Object>>} - The updated score records.
 */
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
        
        // --- PRE-FETCH SCORES AND REGISTRATIONS ---
        const scoreIds = scoresData.map(d => parseInt(d.id, 10)).filter(id => !isNaN(id));
        const existingScoresWithReg = await prisma.score.findMany({
            where: { id: { in: scoreIds } },
            include: { studentCourseRegistration: { include: { semester: true, course: { select: { creditUnit: true } } } } } // FETCH CREDIT UNIT
        });
        const scoreMap = new Map(existingScoresWithReg.map(score => [score.id, score]));
        // ------------------------------------------

        for (const data of scoresData) {
            const { id: scoreId, ...updateFields } = data;
            if (!scoreId) continue; // Skip if ID is missing (should be caught by frontend)

            const pScoreId = parseInt(scoreId, 10);
            const score = scoreMap.get(pScoreId);
            
            if (!score) continue; // Skip if score not found (404)

            // Authorization Checks
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

            // Calculate new score details
            const dataForDb = validateScoreData(updateFields, score);

            // --- NEW LOGIC: Calculate CU * GP ---
            const creditUnit = score.studentCourseRegistration.course.creditUnit || 0;
            dataForDb.cuGp = (dataForDb.point || 0) * creditUnit;
            // --- END NEW LOGIC ---

            // When score is updated, reset approvals
            dataForDb.isApprovedByExaminer = false;
            dataForDb.isAcceptedByHOD = false;
            dataForDb.examinerWhoApprovedId = null;
            dataForDb.hodWhoAcceptedId = null;
            
            // Set submission details
            if (requestingUser.type === 'lecturer') {
                dataForDb.submittedByLecturerId = requestingUser.id;
                dataForDb.submittedAt = new Date();
            } else if (isAdmin || isPermittedICT) {
                dataForDb.submittedAt = new Date();
            }

            // Push the update operation
            transactions.push(
                prisma.score.update({
                    where: { id: pScoreId },
                    data: dataForDb,
                    select: scorePublicSelection
                })
            );
            updatedScoreIds.push(pScoreId);
        }

        // 2. Execute all updates atomically
        await prisma.$transaction(transactions);

        // 3. Fetch the fully updated records for the return value
        const updatedScores = await prisma.score.findMany({
            where: {
                id: { in: updatedScoreIds }
            },
            select: scorePublicSelection
        });

        return updatedScores;

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error in batchUpdateScores:", error.message, error.stack);
        throw new AppError('Could not process batch update of scores. Transaction failed.', 500);
    }
};

/**
 * Deletes multiple score records in a single transaction.
 * @param {Array<number>} scoreIds - Array of score IDs to delete.
 * @param {Object} requestingUser - The user initiating the action.
 * @returns {Promise<number>} - The number of scores deleted.
 */
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

            if (!score) continue; // Skip if already deleted

            // Authorization Checks
            const isAssignedLecturer = requestingUser.type === 'lecturer' && await isLecturerAssigned(requestingUser.id, score.studentCourseRegistration);
            if (!isAdmin && !isPermittedICT && !isAssignedLecturer) {
                throw new AppError(`Unauthorized to delete score ID ${pScoreId}.`, 403);
            }
            if (score.isAcceptedByHOD && !isAdmin) {
                throw new AppError(`Cannot delete score ID ${pScoreId}: already accepted by HOD.`, 400);
            }

            // Push the delete and registration update operations
            transactions.push(
                prisma.score.delete({ where: { id: pScoreId } }),
                prisma.studentCourseRegistration.update({
                    where: { id: score.studentCourseRegistrationId },
                    data: { isScoreRecorded: false }
                })
            );
        }

        // 2. Execute all operations atomically
        await prisma.$transaction(transactions);
        return scoreIds.length;

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error in batchDeleteScores:", error.message, error.stack);
        throw new AppError('Could not process batch deletion of scores. Transaction failed.', 500);
    }
};


/**
 * Reverses an Examiner's approval for a score.
 * Can be done by an Examiner (in the dept), HOD (in the dept), or Admin.
 * Cannot be done if the score is already accepted by the HOD.
 */
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
        
        // CRITICAL WORKFLOW CHECK: Cannot de-approve if HOD has already accepted.
        if (score.isAcceptedByHOD) {
            throw new AppError('Cannot de-approve score. It has already been accepted by the HOD. The HOD must de-accept it first.', 403);
        }

        // Authorization: Admin, permitted ICT, HOD of dept, or Examiner of dept
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
        console.error("Error de-approving score by examiner:", error.message, error.stack);
        throw new AppError('Could not de-approve score.', 500);
    }
};

/**
 * Reverses an HOD's acceptance for a score.
 * Can be done by an HOD (in the dept) or Admin.
 */
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

        // Authorization: Admin, permitted ICT, or HOD of the student's department
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
        console.error("Error de-accepting score by HOD:", error.message, error.stack);
        throw new AppError('Could not de-accept score.', 500);
    }
};