// src/services/result.service.js

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
        const generatedResults = [];

        for (const student of studentsToProcess) {
            const result = await prisma.$transaction(async (tx) => {
                const currentSemesterRegistrations = student.registrations.filter(
                    reg => reg.seasonId === pSeasonId && reg.semesterId === pSemesterId
                );

                const finalScoresForSemester = [];
                const scoresToConnect = []; 

                for (const reg of currentSemesterRegistrations) {
                    // STRICT CHECK: Only consider scores that are both approved by the Examiner and accepted by HOD
                    const isFullyApproved = reg.score && reg.score.isApprovedByExaminer && reg.score.isAcceptedByHOD;
                    
                    if (isFullyApproved) {
                        scoresToConnect.push({ id: reg.score.id });
                        finalScoresForSemester.push({
                            ...reg.score,
                            creditUnit: reg.course.creditUnit,
                            cuGp: reg.score.cuGp
                        });
                    }
                }

                // If a student has no fully approved and accepted scores, skip generating a result record entirely
                if (finalScoresForSemester.length === 0) {
                    return null;
                }

                // --- Correct GPA & CGPA Calculation using only approved scores ---
                const gpaData = calculateGradeAverages(finalScoresForSemester);
                
                const allHistoricalApprovedScores = await tx.score.findMany({
                    where: {
                        isApprovedByExaminer: true, 
                        isAcceptedByHOD: true,
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

            if (result) {
                generatedResults.push(result);
            }
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

        const result = await prisma.result.findUnique({
            where: { id: resultId },
            select: resultPublicSelection
        });
        if (!result) throw new AppError('Result not found.', 404);

        const isAdmin = requestingUser.type === 'admin' || (requestingUser.type === 'ictstaff' && requestingUser.canManageResults);
        const isStudentOwner = requestingUser.type === 'student' && requestingUser.id === result.student.id;
        const isHODForDept = requestingUser.type === 'lecturer' &&
            requestingUser.role === LecturerRole.HOD &&
            result.department && requestingUser.departmentId === result.department.id; 
        const isExaminerForDept = requestingUser.type === 'lecturer' &&
            requestingUser.role === LecturerRole.EXAMINER &&
            result.department && requestingUser.departmentId === result.department.id; 
        
        if (requestingUser.type === 'student' && !result.isApprovedForStudentRelease) {
            throw new AppError('Result not yet published or approved for release.', 403);
        }

        if (!(isAdmin || isStudentOwner || isHODForDept || isExaminerForDept)) {
            throw new AppError('You are not authorized to view this result.', 403);
        }
        
        const courseScores = result.scores.map(score => {
            const course = score.studentCourseRegistration.course;
            const totalCA = (score.firstCA || 0) + (score.secondCA || 0);
            const weightedPoint = score.cuGp; 

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

        const { scores, ...restOfResult } = result;

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
        
        const { studentId, seasonId, semesterId, departmentId, programId, levelId, isApprovedForStudentRelease, page = 1, limit = 200 } = query; 
        
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

        const rawResults = await prisma.result.findMany({
            where, select: resultPublicSelection,
            orderBy: [{ seasonId: 'desc' }, { semesterId: 'desc' }, { student: { regNo: 'asc' } }],
            skip, take: limitNum
        });
        const totalResults = await prisma.result.count({ where });

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
            
            const { scores, ...restOfResult } = result;

            return {
                ...restOfResult,
                courseScores
            };
        });

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

export const approveResultsForRelease = async (resultIds, adminId) => {
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
                isApprovedForStudentRelease: false 
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

export const getStudentResultsMinimal = async (studentId, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        
        const pStudentId = parseInt(studentId, 10);
        if (isNaN(pStudentId)) throw new AppError('Invalid Student ID.', 400);

        const whereClause = {
            studentId: pStudentId,
        };

        if (requestingUser && requestingUser.type === 'student') {
            whereClause.isApprovedForStudentRelease = true;
        }

        const results = await prisma.result.findMany({
            where: whereClause, 
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

export const deleteResult = async (resultId, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);

        if (!canUserDeleteResult(requestingUser)) {
            throw new AppError('You are not authorized to delete results.', 403);
        }

        const pResultId = parseInt(resultId, 10);
        if (isNaN(pResultId)) throw new AppError('Invalid result ID format.', 400);

        const resultToDelete = await prisma.result.findUnique({
            where: { id: pResultId },
            select: { isApprovedForStudentRelease: true, student: { select: { regNo: true } } }
        });

        if (!resultToDelete) throw new AppError('Result record not found for deletion.', 404);

        if (resultToDelete.isApprovedForStudentRelease) {
            throw new AppError('Cannot delete a result that has already been approved for student release. Consider revoking approval first.', 400);
        }

        await prisma.$transaction(async (tx) => {
            await tx.result.delete({ where: { id: pResultId } });
        });
        
        return { message: `Result record for student ${resultToDelete.student.regNo} (ID: ${pResultId}) successfully deleted.` };

    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2003') { 
            throw new AppError('Cannot delete result due to unexpected existing dependent records.', 400);
        }
        console.error("Error deleting result:", error.message, error.stack);
        throw new AppError('Could not delete result record.', 500);
    }
};

export const deleteManyResults = async (resultIds, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);

        if (!canUserDeleteResult(requestingUser)) {
            throw new AppError('You are not authorized to delete results.', 403);
        }

        if (!Array.isArray(resultIds) || resultIds.length === 0) {
            throw new AppError('No result IDs provided for batch deletion.', 400);
        }

        const pResultIds = resultIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
        if (pResultIds.length === 0) {
            throw new AppError('Invalid result IDs provided for batch deletion.', 400);
        }
        if (pResultIds.length !== resultIds.length) {
            console.warn(`[Result Service] Some invalid IDs were filtered during batch delete: Original count ${resultIds.length}, Valid count ${pResultIds.length}`);
        }

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

        const deleteOperation = await prisma.result.deleteMany({
            where: {
                id: { in: pResultIds },
                isApprovedForStudentRelease: false 
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

export const toggleResultsReleaseStatusService = async (criteria, releaseStatus, adminId) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);

        const whereClause = {};

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

        if (Object.keys(whereClause).length === 0) {
            throw new AppError('At least one valid criterion (season, semester, faculty, department, program, or level) must be provided to toggle results.', 400);
        }

        const updateData = {
            isApprovedForStudentRelease: releaseStatus,
            updatedAt: new Date(), 
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