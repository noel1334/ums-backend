import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import { ResultRemark, LecturerRole } from '../generated/prisma/index.js';

// --- SELECTIONS ---

// Selection for scores nested inside a result
const nestedScoreSelection = {
    id: true,
    firstCA: true,
    secondCA: true,
    examScore: true,
    totalScore: true,
    grade: true, 
    point: true,
    cuGp: true, // Quality Points (Grade Point * Credit Unit)
    submittedAt: true,
    isApprovedByExaminer: true,
    isAcceptedByHOD: true,
    studentCourseRegistration: {
        select: {
            course: { select: { code: true, title: true, creditUnit: true } },
            semester: { select: { name: true, semesterNumber: true } },
            season: { select: { name: true } }
        }
    }
};

// Selection for the main Result object
const resultPublicSelection = {
    id: true, gpa: true, cgpa: true, cuAttempted: true, cuPassed: true, cuTotal: true,
    remarks: true, isApprovedForStudentRelease: true, studentReleaseApprovedAt: true,
    createdAt: true, updatedAt: true,
    student: { select: { id: true, regNo: true, name: true, departmentId: true, programId: true, currentLevelId: true } },
    semester: { select: { id: true, name: true, type: true, semesterNumber: true } },
    season: { select: { id: true, name: true } },
    department: { select: { id: true, name: true } },
    program: { select: { id: true, name: true } },
    level: { select: { id: true, name: true } },
    studentReleaseApproverAdmin: { select: { id: true, name: true } },
    scores: { select: nestedScoreSelection } 
};

// --- GPA/REMARK HELPERS ---

function calculateGradeAverages(scoresWithCredits) {
    if (!scoresWithCredits || scoresWithCredits.length === 0) {
        return { gpa: 0, totalCuAttempted: 0, totalCuPassed: 0, totalQualityPoints: 0 };
    }
    let totalQualityPoints = 0;
    let totalCuAttempted = 0;
    let totalCuPassed = 0;

    scoresWithCredits.forEach(item => {
        if (item.point !== null && item.creditUnit !== null) {
            totalQualityPoints += item.cuGp; // SUMMING CUGP DIRECTLY
            totalCuAttempted += item.creditUnit;
            if (item.point >= 1.0) { 
                totalCuPassed += item.creditUnit;
            }
        }
    });
    
    const gpa = totalCuAttempted > 0 ? (totalQualityPoints / totalCuAttempted) : 0;
    
    return {
        gpa: parseFloat(gpa.toFixed(2)),
        totalCuAttempted,
        totalCuPassed,
        totalQualityPoints,
    };
}

function determineResultRemark(gpa) {
    if (gpa === null || gpa === undefined) return null;
    if (gpa >= 4.5) return ResultRemark.DISTINCTION;
    if (gpa >= 3.5) return ResultRemark.CREDIT;
    if (gpa >= 2.0) return ResultRemark.PASS;
    if (gpa >= 1.0) return ResultRemark.PROBATION;
    return ResultRemark.FAIL;
}
// --- AUTHORIZATION HELPER for Deletion ---
const canUserDeleteResult = (requestingUser) => {
    // Only Admin and ICT Staff with result management permissions can delete results
    if (requestingUser.type === 'admin') return true;
    if (requestingUser.type === 'ictstaff' && requestingUser.canManageResults) return true;
    
    return false;
};
// --- SERVICE FUNCTIONS ---

export const generateResultsForSemester = async (criteria, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        
        const { seasonId, semesterId, facultyId, departmentId, programId, levelId, studyMode, degreeType } = criteria;
        const pSeasonId = parseInt(seasonId, 10);
        const pSemesterId = parseInt(semesterId, 10);

        if (isNaN(pSeasonId) || isNaN(pSemesterId)) throw new AppError('Invalid Season ID or Semester ID.', 400);

        // --- 1. Authorization and Criteria Setup ---
        const isAdmin = requestingUser.type === 'admin' || (requestingUser.type === 'ictstaff' && requestingUser.canManageResults);
        const isHOD = requestingUser.type === 'lecturer' && requestingUser.role === LecturerRole.HOD;

        if (!isAdmin && !isHOD) {
            throw new AppError('You are not authorized to generate results.', 403);
        }
        
        if (isHOD) {
            if (!requestingUser.departmentId) throw new AppError('HOD department info missing.', 500);
            if (departmentId && parseInt(departmentId, 10) !== requestingUser.departmentId) {
                throw new AppError('HOD can only generate results for their own department.', 403);
            }
            criteria.departmentId = requestingUser.departmentId; 
        }
        
        // --- 2. Fetch Students to Process ---
        const studentWhereClause = {
            isActive: true,
            isGraduated: false,
            ...(criteria.facultyId && { department: { facultyId: parseInt(criteria.facultyId, 10) } }),
            ...(criteria.departmentId && { departmentId: parseInt(criteria.departmentId, 10) }),
            ...(criteria.programId && { programId: parseInt(criteria.programId, 10) }),
            ...(criteria.levelId && { currentLevelId: parseInt(criteria.levelId, 10) }),
            ...(studyMode && { program: { modeOfStudy: studyMode } }),
            ...(degreeType && { program: { degreeType: degreeType } }),
            registrations: {
                some: {
                    semesterId: pSemesterId,
                    seasonId: pSeasonId,
                }
            }
        };

        const studentsToProcess = await prisma.student.findMany({
            where: studentWhereClause,
            select: { 
                id: true, departmentId: true, programId: true, currentLevelId: true, 
                registrations: {
                    include: { 
                        course: { select: { creditUnit: true } }, 
                        semester: { select: { semesterNumber: true, seasonId: true } },
                        season: { select: { id: true } },
                        score: true 
                    }
                }
            }
        });

        if (studentsToProcess.length === 0) {
            throw new AppError('No students with course registrations were found for the selected criteria.', 404);
        }

        // --- 3. Calculate Results for Each Student ---
        const currentSemester = await prisma.semester.findUnique({ where: { id: pSemesterId } });
        const generatedResults = [];
        const isAdminOrPermittedICT = requestingUser.type === 'admin' || 
                                     (requestingUser.type === 'ictstaff' && requestingUser.canManageResults);

        for (const student of studentsToProcess) {
            const result = await prisma.$transaction(async (tx) => {
                const currentSemesterRegistrations = student.registrations.filter(
                    reg => reg.seasonId === pSeasonId && reg.semesterId === pSemesterId
                );

                const finalScoresForSemester = [];
                const scoresToConnect = []; 

                for (const reg of currentSemesterRegistrations) {
                    const isFullyApproved = reg.score && reg.score.isApprovedByExaminer && reg.score.isAcceptedByHOD;
                    
                    if (isFullyApproved) {
                        scoresToConnect.push({ id: reg.score.id });
                        finalScoresForSemester.push({
                            ...reg.score,
                            creditUnit: reg.course.creditUnit,
                            cuGp: reg.score.cuGp
                        });
                    } else if (reg.score && isAdminOrPermittedICT) {
                        scoresToConnect.push({ id: reg.score.id });
                         finalScoresForSemester.push({
                            ...reg.score, 
                            creditUnit: reg.course.creditUnit,
                            cuGp: reg.score.cuGp 
                        });
                        
                    } else if (reg.score) {
                        scoresToConnect.push({ id: reg.score.id });
                         finalScoresForSemester.push({
                            ...reg.score, 
                            totalScore: 0, grade: 'F', point: 0, cuGp: 0, 
                            creditUnit: reg.course.creditUnit,
                        });
                    } else {
                        const failScorePayload = {
                            firstCA: 0, secondCA: 0, examScore: 0,
                            totalScore: 0, grade: 'F', point: 0,
                            cuGp: 0, 
                            isApprovedByExaminer: true, isAcceptedByHOD: true,
                            submittedByLecturerId: null, submittedAt: new Date(),
                            examinerApprovedAt: new Date(), hodAcceptedAt: new Date(),
                        };

                        const autoFailedScore = await tx.score.create({
                            data: { studentCourseRegistrationId: reg.id, ...failScorePayload }
                        });
                        scoresToConnect.push({ id: autoFailedScore.id });
                        
                        finalScoresForSemester.push({
                            ...autoFailedScore,
                            creditUnit: reg.course.creditUnit,
                            cuGp: 0
                        });
                    }
                }

                // --- Correct GPA & CGPA Calculation ---
                const gpaData = calculateGradeAverages(finalScoresForSemester);
                
                const allHistoricalApprovedScores = await tx.score.findMany({
                    where: {
                        isApprovedByExaminer: true, isAcceptedByHOD: true,
                        // --- CRITICAL FIX: The NOT clause targets the fields of the Registration model directly ---
                        studentCourseRegistration: {
                            studentId: student.id,
                            NOT: {
                                seasonId: pSeasonId,
                                semesterId: pSemesterId,
                            },
                        },
                    },
                    include: { studentCourseRegistration: { include: { course: { select: { creditUnit: true } } } } }
                });

                const allScoresForCgpa = [
                    ...finalScoresForSemester.map(s => ({...s, creditUnit: s.creditUnit, cuGp: s.cuGp})), 
                    ...allHistoricalApprovedScores.map(s => ({ 
                        ...s, 
                        creditUnit: s.studentCourseRegistration.course.creditUnit,
                        cuGp: s.cuGp
                    }))
                ];

                const cgpaData = calculateGradeAverages(allScoresForCgpa);
                
                const remarks = determineResultRemark(gpaData.gpa);
                
                const resultPayload = {
                    studentId: student.id, semesterId: pSemesterId, seasonId: pSeasonId,
                    departmentId: student.departmentId, programId: student.programId, levelId: student.currentLevelId,
                    gpa: gpaData.gpa,
                    cgpa: cgpaData.gpa,
                    cuAttempted: gpaData.totalCuAttempted,
                    cuPassed: gpaData.totalCuPassed,
                    cuTotal: cgpaData.totalCuPassed,
                    remarks: remarks,
                };

                const finalResult = await tx.result.upsert({
                    where: { unique_student_semester_season_result: { studentId: student.id, semesterId: pSemesterId, seasonId: pSeasonId } },
                    create: { ...resultPayload, scores: { connect: scoresToConnect } },
                    update: { ...resultPayload, scores: { set: scoresToConnect } },
                    select: resultPublicSelection
                });
                return finalResult;
            });
            generatedResults.push(result);
        }
        return generatedResults;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error generating results:", error.message, error.stack);
        throw new AppError('Could not generate results.', 500);
    }
};

export const getResultById = async (id, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);

        const resultId = parseInt(id, 10);
        if (isNaN(resultId)) throw new AppError('Invalid result ID.', 400);

        // --- Fetch Result with all relations ---
        // resultPublicSelection includes all relations (student, semester, scores, etc.)
        const result = await prisma.result.findUnique({
            where: { id: resultId },
            select: resultPublicSelection
        });
        if (!result) throw new AppError('Result not found.', 404);

        // --- Authorization Checks (Self-contained for this function) ---
        const isAdmin = requestingUser.type === 'admin' || (requestingUser.type === 'ictstaff' && requestingUser.canManageResults);
        const isStudentOwner = requestingUser.type === 'student' && requestingUser.id === result.student.id;
        const isHODForDept = requestingUser.type === 'lecturer' &&
            requestingUser.role === LecturerRole.HOD &&
            result.department && requestingUser.departmentId === result.department.id; // Added null check for department
        const isExaminerForDept = requestingUser.type === 'lecturer' &&
            requestingUser.role === LecturerRole.EXAMINER &&
            result.department && requestingUser.departmentId === result.department.id; // Added null check for department
        
        // Student can only see results approved for release
        if (requestingUser.type === 'student' && !result.isApprovedForStudentRelease) {
            throw new AppError('Result not yet published or approved for release.', 403);
        }

        if (!(isAdmin || isStudentOwner || isHODForDept || isExaminerForDept)) {
            throw new AppError('You are not authorized to view this result.', 403);
        }
        
        // --- POST-PROCESSING/TRANSFORMATION FIX ---
        
        // 1. Map the nested scores into a flat, UI-ready array
        const courseScores = result.scores.map(score => {
            const course = score.studentCourseRegistration.course;
            const totalCA = (score.firstCA || 0) + (score.secondCA || 0);
            const weightedPoint = score.cuGp; // Use the pre-calculated CUGP

            return {
                courseCode: course.code,
                courseTitle: course.title,
                credit: course.creditUnit,
                CA: totalCA,
                exam: score.examScore || 0,
                total: score.totalScore || totalCA + (score.examScore || 0),
                grade: score.grade,
                gradePoint: score.point,
                weightedPoint: parseFloat(weightedPoint.toFixed(2)),
                status: score.point && score.point >= 1.0 ? 'PASS' : 'FAIL',
            };
        });

        // 2. Separate the scores relation from the rest of the result object
        const { scores, ...restOfResult } = result;

        // 3. Return the transformed object
        return {
            ...restOfResult, 
            courseScores: courseScores
        };

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching result by ID:", error.message, error.stack);
        throw new AppError('Could not retrieve result.', 500);
    }
};

export const getAllResults = async (query, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        
        const { studentId, seasonId, semesterId, departmentId, programId, levelId, isApprovedForStudentRelease, page = 1, limit = 200 } = query; // Increased default limit for broadsheet
        
        const where = {};
        const isAdmin = requestingUser.type === 'admin' || (requestingUser.type === 'ictstaff' && requestingUser.canManageResults);
        const isLecturer = requestingUser.type === 'lecturer';

        if (isAdmin) {
            // No base restrictions for admin
        } else if (requestingUser.type === 'student') {
            where.studentId = requestingUser.id;
            where.isApprovedForStudentRelease = true;
        } else if (isLecturer) {
            if (!requestingUser.departmentId) throw new AppError('Department info missing for lecturer.', 500);
            where.departmentId = requestingUser.departmentId;
        } else {
            throw new AppError('You are not authorized to view this list of results.', 403);
        }

        // Apply Dynamic Filters
        if (departmentId && isAdmin) where.departmentId = parseInt(departmentId, 10);
        if (programId) where.programId = parseInt(programId, 10);
        if (levelId) where.levelId = parseInt(levelId, 10);
        if (seasonId) where.seasonId = parseInt(seasonId, 10);
        if (semesterId) where.semesterId = parseInt(semesterId, 10);
        if (isApprovedForStudentRelease !== undefined && isAdmin) {
            where.isApprovedForStudentRelease = isApprovedForStudentRelease === 'true';
        }

        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;

        console.log(`[Backend Service] Fetching results with final query:`, where);

        const rawResults = await prisma.result.findMany({
            where, select: resultPublicSelection,
            orderBy: [{ seasonId: 'desc' }, { semesterId: 'desc' }, { student: { regNo: 'asc' } }],
            skip, take: limitNum
        });
        const totalResults = await prisma.result.count({ where });

        // --- NEW TRANSFORMATION LOGIC (THE FIX) ---
        // Map over the raw results and apply the same transformation as getResultById
        const transformedResults = rawResults.map(result => {
            const courseScores = result.scores.map(score => {
                const course = score.studentCourseRegistration.course;
                const totalCA = (score.firstCA || 0) + (score.secondCA || 0);
                return {
                    courseCode: course.code,
                    courseTitle: course.title,
                    credit: course.creditUnit,
                    CA: totalCA,
                    exam: score.examScore || 0,
                    total: score.totalScore || totalCA + (score.examScore || 0),
                    grade: score.grade,
                    gradePoint: score.point,
                    weightedPoint: parseFloat(score.cuGp.toFixed(2)),
                    status: score.point && score.point >= 1.0 ? 'PASS' : 'FAIL',
                };
            });
            
            // Remove the original nested 'scores' relation
            const { scores, ...restOfResult } = result;

            // Return the result object with the clean, flat 'courseScores' array
            return {
                ...restOfResult,
                courseScores
            };
        });
        // --- END OF TRANSFORMATION LOGIC ---

        console.log(`[Backend Service] Found and transformed ${totalResults} total results.`);

        // Return the transformed results
        return { 
            results: transformedResults, 
            totalPages: Math.ceil(totalResults / limitNum), 
            currentPage: pageNum, 
            totalResults 
        };

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching results:", error.message, error.stack);
        throw new AppError('Could not retrieve results.', 500);
    }
};

export const approveResultsForRelease = async (resultIds, adminId) => { // Admin action
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        if (!Array.isArray(resultIds) || resultIds.length === 0) {
            throw new AppError('No result IDs provided for approval.', 400);
        }
        const pResultIds = resultIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
        if (pResultIds.length === 0) throw new AppError('Invalid result IDs provided.', 400);


        const updatedCount = await prisma.result.updateMany({
            where: {
                id: { in: pResultIds },
                isApprovedForStudentRelease: false // Only approve those not yet approved
            },
            data: {
                isApprovedForStudentRelease: true,
                studentReleaseApprovedAt: new Date(),
                studentReleaseApprovedByAdminId: parseInt(adminId, 10)
            }
        });
        return { message: `${updatedCount.count} results approved for release.` };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error approving results:", error.message, error.stack);
        throw new AppError('Could not approve results for release.', 500);
    }
};



/**
 * Fetches a list of all result records for a given student.
 * For students, it only returns released results. For staff, it returns all results.
 */
export const getStudentResultsMinimal = async (studentId, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        
        const pStudentId = parseInt(studentId, 10);
        if (isNaN(pStudentId)) throw new AppError('Invalid Student ID.', 400);

        // --- DYNAMIC WHERE CLAUSE ---
        const whereClause = {
            studentId: pStudentId,
        };

        // Only filter for released results if the user is a 'student'.
        // Admins, lecturers, etc., will see ALL results for that student.
        if (requestingUser && requestingUser.type === 'student') {
            whereClause.isApprovedForStudentRelease = true;
        }

        const results = await prisma.result.findMany({
            where: whereClause, // Use the dynamic where clause
            select: {
                id: true,
                seasonId: true,
                semesterId: true,
                season: { select: { name: true } },
                semester: { select: { name: true } },
            },
            orderBy: [
                { seasonId: 'desc' }, 
                { semester: { semesterNumber: 'desc' } }
            ]
        });

        // Map to the required frontend structure
        return results.map(r => ({
            id: r.id,
            seasonId: r.seasonId,
            semesterId: r.semesterId,
            seasonName: r.season.name,
            semesterName: r.semester.name,
        }));

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("[Result Service] Error fetching student result history:", error.message, error.stack);
        throw new AppError('Could not retrieve student result history.', 500);
    }
};

/**
 * Deletes a single result record by ID.
 *
 * @param {string} resultId - The ID of the result record to delete.
 * @param {object} requestingUser - The user attempting the deletion.
 * @returns {Promise<object>} A success message.
 * @throws {AppError} For authorization, not found, or constraint errors.
 */
export const deleteResult = async (resultId, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);

        // --- 1. Authorization ---
        if (!canUserDeleteResult(requestingUser)) {
            throw new AppError('You are not authorized to delete results.', 403);
        }

        // --- 2. Input Validation ---
        const pResultId = parseInt(resultId, 10);
        if (isNaN(pResultId)) throw new AppError('Invalid result ID format.', 400);

        // --- 3. Check Existence and Status ---
        const resultToDelete = await prisma.result.findUnique({
            where: { id: pResultId },
            select: { isApprovedForStudentRelease: true, student: { select: { regNo: true } } }
        });

        if (!resultToDelete) throw new AppError('Result record not found for deletion.', 404);

        if (resultToDelete.isApprovedForStudentRelease) {
            throw new AppError('Cannot delete a result that has already been approved for student release. Consider revoking approval first.', 400);
        }

        // --- 4. Perform Deletion in a Transaction (for safety) ---
        // Note: Prisma's `onDelete: SetNull` for `resultId` on `Score` model
        // means associated scores will remain, but their `resultId` will be null.
        await prisma.$transaction(async (tx) => {
            // First, disconnect the scores from this result (not strictly necessary due to SetNull,
            // but explicitly ensures the `connect` doesn't interfere, if `set: []` was used to clear)
            // Simpler: rely on onDelete: SetNull for Scores.

            await tx.result.delete({ where: { id: pResultId } });
        });
        
        return { message: `Result record for student ${resultToDelete.student.regNo} (ID: ${pResultId}) successfully deleted.` };

    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2003') { // Foreign key constraint violation (shouldn't happen with SetNull on Scores)
            throw new AppError('Cannot delete result due to unexpected existing dependent records.', 400);
        }
        console.error("Error deleting result:", error.message, error.stack);
        throw new AppError('Could not delete result record.', 500);
    }
};

/**
 * Deletes multiple result records by an array of IDs.
 *
 * @param {number[]} resultIds - An array of result IDs to delete.
 * @param {object} requestingUser - The user attempting the deletion.
 * @returns {Promise<object>} A summary of the deletion operation.
 * @throws {AppError} For authorization or input errors.
 */
export const deleteManyResults = async (resultIds, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);

        // --- 1. Authorization ---
        if (!canUserDeleteResult(requestingUser)) {
            throw new AppError('You are not authorized to delete results.', 403);
        }

        // --- 2. Input Validation ---
        if (!Array.isArray(resultIds) || resultIds.length === 0) {
            throw new AppError('No result IDs provided for batch deletion.', 400);
        }

        const pResultIds = resultIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
        if (pResultIds.length === 0) {
            throw new AppError('Invalid result IDs provided for batch deletion.', 400);
        }
        // Ensure no empty IDs were sent if original array had invalid items
        if (pResultIds.length !== resultIds.length) {
            console.warn(`[Result Service] Some invalid IDs were filtered during batch delete: Original count ${resultIds.length}, Valid count ${pResultIds.length}`);
        }

        // --- 3. Check for Approved Results in the Batch ---
        const approvedResultsInBatch = await prisma.result.findMany({
            where: {
                id: { in: pResultIds },
                isApprovedForStudentRelease: true
            },
            select: { id: true, student: { select: { regNo: true } } }
        });

        if (approvedResultsInBatch.length > 0) {
            const approvedIds = approvedResultsInBatch.map(r => r.id);
            const approvedRegNos = approvedResultsInBatch.map(r => r.student.regNo);
            throw new AppError(
                `Cannot delete batch: ${approvedResultsInBatch.length} results are approved for student release. ` +
                `IDs: [${approvedIds.join(', ')}] (Students: ${approvedRegNos.join(', ')}) ` +
                `Please revoke approval first.`, 400
            );
        }

        // --- 4. Perform Batch Deletion ---
        const deleteOperation = await prisma.result.deleteMany({
            where: {
                id: { in: pResultIds },
                isApprovedForStudentRelease: false // Double-check against approved ones
            }
        });
        
        return { 
            message: `${deleteOperation.count} result records successfully deleted.`,
            deletedCount: deleteOperation.count
        };

    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2003') {
            throw new AppError('Cannot delete some results in batch due to unexpected existing dependent records.', 400);
        }
        console.error("Error deleting many results:", error.message, error.stack);
        throw new AppError('Could not delete multiple result records.', 500);
    }
};

// =================================================================================
// --- NEW SERVICE FUNCTION: Toggle Result Release Status by Criteria ---
/**
 * Toggles the 'isApprovedForStudentRelease' status for results based on provided criteria.
 *
 * @param {object} criteria - Object containing filtering criteria (e.g., { seasonId: 1, departmentId: 2 }).
 *                            Can include seasonId, semesterId, facultyId, departmentId, programId, levelId.
 * @param {boolean} releaseStatus - `true` to approve for release, `false` to de-approve.
 * @param {number} adminId - The ID of the admin performing the action.
 * @returns {Promise<{message: string, updatedCount: number}>} - A message and the count of updated results.
 * @throws {AppError} If criteria are invalid, no results found, or Prisma client is unavailable.
 */
export const toggleResultsReleaseStatusService = async (criteria, releaseStatus, adminId) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);

        const whereClause = {};

        // Parse and add direct criteria
        if (criteria.seasonId) {
            const pSeasonId = parseInt(criteria.seasonId, 10);
            if (isNaN(pSeasonId)) throw new AppError('Invalid Season ID format.', 400);
            whereClause.seasonId = pSeasonId;
        }
        if (criteria.semesterId) {
            const pSemesterId = parseInt(criteria.semesterId, 10);
            if (isNaN(pSemesterId)) throw new AppError('Invalid Semester ID format.', 400);
            whereClause.semesterId = pSemesterId;
        }
        if (criteria.departmentId) {
            const pDepartmentId = parseInt(criteria.departmentId, 10);
            if (isNaN(pDepartmentId)) throw new AppError('Invalid Department ID format.', 400);
            whereClause.departmentId = pDepartmentId;
        }
        if (criteria.programId) {
            const pProgramId = parseInt(criteria.programId, 10);
            if (isNaN(pProgramId)) throw new AppError('Invalid Program ID format.', 400);
            whereClause.programId = pProgramId;
        }
        if (criteria.levelId) {
            const pLevelId = parseInt(criteria.levelId, 10);
            if (isNaN(pLevelId)) throw new AppError('Invalid Level ID format.', 400);
            whereClause.levelId = pLevelId;
        }

        // Handle facultyId, which requires an extra query
        if (criteria.facultyId) {
            const pFacultyId = parseInt(criteria.facultyId, 10);
            if (isNaN(pFacultyId)) throw new AppError('Invalid Faculty ID format.', 400);

            const departmentsInFaculty = await prisma.department.findMany({
                where: { facultyId: pFacultyId },
                select: { id: true }
            });

            if (departmentsInFaculty.length === 0) {
                throw new AppError('No departments found for the specified faculty.', 404);
            }

            const departmentIds = departmentsInFaculty.map(dept => dept.id);
            whereClause.departmentId = { in: departmentIds };
        }

        // Ensure at least one filtering criterion is provided
        if (Object.keys(whereClause).length === 0) {
            throw new AppError('At least one valid criterion (season, semester, faculty, department, program, or level) must be provided to toggle results.', 400);
        }

        // Construct the data payload for update
        const updateData = {
            isApprovedForStudentRelease: releaseStatus,
            updatedAt: new Date(), // Always update the updatedAt timestamp
        };

        if (releaseStatus) {
            updateData.studentReleaseApprovedAt = new Date();
            updateData.studentReleaseApprovedByAdminId = adminId;
        } else {
            updateData.studentReleaseApprovedAt = null;
            updateData.studentReleaseApprovedByAdminId = null;
        }

        const updatedResults = await prisma.result.updateMany({
            where: whereClause,
            data: updateData,
        });

        const actionMessage = releaseStatus ? 'approved for student release' : 'de-approved for student release';
        return {
            message: `${updatedResults.count} results successfully ${actionMessage}.`,
            updatedCount: updatedResults.count,
        };

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error toggling results release status:", error.message, error.stack);
        throw new AppError('Could not toggle results release status.', 500);
    }
};

export const batchToggleSpecificResultsReleaseService = async (resultIds, releaseStatus, adminId) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);

        const pResultIds = resultIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));

        if (pResultIds.length === 0) {
            throw new AppError('No valid result IDs provided for batch operation.', 400);
        }

        const updateData = {
            isApprovedForStudentRelease: releaseStatus,
            updatedAt: new Date(),
        };

        if (releaseStatus) {
            updateData.studentReleaseApprovedAt = new Date();
            updateData.studentReleaseApprovedByAdminId = parseInt(adminId, 10);
        } else {
            updateData.studentReleaseApprovedAt = null;
            updateData.studentReleaseApprovedByAdminId = null;
        }

        const updatedResults = await prisma.result.updateMany({
            where: {
                id: { in: pResultIds },
            },
            data: updateData,
        });

        const actionMessage = releaseStatus ? 'approved for student release' : 'de-approved for student release';
        return {
            message: `${updatedResults.count} results successfully ${actionMessage}.`,
            updatedCount: updatedResults.count,
        };

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error batch toggling specific results release status:", error.message, error.stack);
        throw new AppError('Could not batch toggle specific results release status.', 500);
    }
};