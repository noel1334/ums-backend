// src/services/academicProgression.service.js
import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import { GradeLetter } from '../generated/prisma/index.js'; // Ensure this path is correct

// --- Helper Functions ---
const getLevelNumericValue = (levelName) => {
    if (!levelName) {
        throw new AppError("Level name is undefined or null, cannot extract numeric value.", 500);
    }
    const match = levelName.match(/^(\d+)\s*Level$/i);
    if (match && match[1]) {
        return parseInt(match[1], 10);
    }
    throw new AppError(`Invalid level name format: '${levelName}'. Expected 'XXX Level'. Please check Level data.`, 500);
};

async function canStudentGraduate(studentId, programId, studentCurrentLevel, prismaClient) {
    // ... (Keep the full implementation of canStudentGraduate from the previous correct version)
    // This function checks academic records for graduation eligibility.
    console.log(`[canStudentGraduate] Checking graduation eligibility for Student ID: ${studentId}, Program ID: ${programId}, Current Level: ${studentCurrentLevel.name}`);

    const allSystemLevels = await prismaClient.level.findMany({
        orderBy: { name: 'asc' }
    });

    const currentLevelNumeric = getLevelNumericValue(studentCurrentLevel.name);
    const relevantLevelIds = allSystemLevels
        .filter(l => {
            try {
                return getLevelNumericValue(l.name) <= currentLevelNumeric;
            } catch (e) {
                console.warn(`[canStudentGraduate] Could not parse level name '${l.name}' during filtering. Skipping.`);
                return false;
            }
        })
        .map(l => l.id);

    if (relevantLevelIds.length === 0) {
        console.warn(`[canStudentGraduate] No relevant levels found (up to ${studentCurrentLevel.name}) for program ${programId}. Cannot determine required courses.`);
        return false;
    }

    const requiredProgramCourses = await prismaClient.programCourse.findMany({
        where: {
            programId: programId,
            levelId: { in: relevantLevelIds },
            isElective: false,
            isActive: true
        },
        select: { courseId: true, course: { select: { code: true, title: true } } }
    });

    if (requiredProgramCourses.length === 0) {
        console.warn(`[canStudentGraduate] No CORE program courses found for Student ID: ${studentId}. Policy: Assuming CAN graduate if no core courses defined.`);
        return true;
    }

    const allRegistrationsForStudent = await prismaClient.studentCourseRegistration.findMany({
        where: {
            studentId: studentId,
            courseId: { in: requiredProgramCourses.map(pc => pc.courseId) },
        },
        include: {
            score: { select: { grade: true } },
            semester: { include: { season: true } },
            course: { select: { code: true } }
        },
        orderBy: [
            { courseId: 'asc' },
            { semester: { season: { startDate: 'desc' } } },
            { semester: { semesterNumber: 'desc' } },
            { registeredAt: 'desc' }
        ]
    });

    const latestScoresByCourse = new Map();
    for (const reg of allRegistrationsForStudent) {
        if (!latestScoresByCourse.has(reg.courseId)) {
            latestScoresByCourse.set(reg.courseId, (reg.score && reg.score.grade !== null && reg.score.grade !== undefined) ? reg.score : { grade: null });
        }
    }

    const failingGrades = [GradeLetter.F, GradeLetter.I];
    for (const progCourse of requiredProgramCourses) {
        const latestScoreData = latestScoresByCourse.get(progCourse.courseId);
        if (!latestScoreData || latestScoreData.grade === null) {
            console.log(`[canStudentGraduate] Student ID: ${studentId} - No score/grade for latest attempt of required course: ${progCourse.course.code}. Cannot graduate.`);
            return false;
        }
        if (failingGrades.includes(latestScoreData.grade)) {
            console.log(`[canStudentGraduate] Student ID: ${studentId} - Failed required course (latest attempt): ${progCourse.course.code} with grade ${latestScoreData.grade}. Cannot graduate.`);
            return false;
        }
    }
    console.log(`[canStudentGraduate] Student ID: ${studentId} passed all required core courses (latest attempts).`);
    return true;
}
// --- Main Service Function ---
export const progressStudentsToNextLevel = async (progressionData) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const { targetSeasonId, scope, scopeId } = progressionData;

        // Validations
        if (!targetSeasonId) throw new AppError('Target Season ID is required.', 400);
        const parsedTargetSeasonId = parseInt(targetSeasonId, 10);
        if (isNaN(parsedTargetSeasonId)) throw new AppError('Invalid Target Season ID format.', 400);
        if (!scope || !['ALL', 'FACULTY', 'DEPARTMENT', 'PROGRAM'].includes(scope)) throw new AppError('Invalid scope.', 400);
        if (scope !== 'ALL' && (scopeId === undefined || String(scopeId).trim() === '')) throw new AppError(`Scope ID required for ${scope}.`, 400);

        const targetSeason = await prisma.season.findUnique({ where: { id: parsedTargetSeasonId } });
        if (!targetSeason) throw new AppError(`Target Season ${parsedTargetSeasonId} not found.`, 404);
        if (!targetSeason.isActive) console.warn(`[AcademicProgressionService] Warning: Progressing to non-active target season ${targetSeason.name}.`);

        const targetSemester = await prisma.semester.findFirst({
            where: { seasonId: parsedTargetSeasonId, type: 'FIRST' },
            orderBy: { semesterNumber: 'asc' }
        });
        if (!targetSemester) throw new AppError(`First semester for target season ${targetSeason.name} not found.`, 400);

        const studentWhereClause = {
            isActive: true,
            isGraduated: false,
            program: { duration: { gt: 0 } }
            // currentLevelId: { not: null } // <<<< THIS LINE WAS REMOVED / SHOULD BE REMOVED
        };

        if (scopeId !== undefined && String(scopeId).trim() !== '') {
            const parsedScopeId = parseInt(scopeId, 10);
            if (isNaN(parsedScopeId)) throw new AppError(`Invalid Scope ID '${scopeId}'.`, 400);
            if (scope === 'FACULTY') studentWhereClause.department = { facultyId: parsedScopeId };
            else if (scope === 'DEPARTMENT') studentWhereClause.departmentId = parsedScopeId;
            else if (scope === 'PROGRAM') studentWhereClause.programId = parsedScopeId;
        }

        console.log("[AcademicProgressionService] Fetching students with where clause:", JSON.stringify(studentWhereClause, null, 2));
        const studentsToProgress = await prisma.student.findMany({
            where: studentWhereClause,
            include: { currentLevel: true, program: true }, // Ensure this uses 'currentLevel' as per your schema
        });

        if (studentsToProgress.length === 0) return { message: 'No students found for progression.', progressedCount: 0, studentsConsidered: 0, failedToProgress: [] };
        console.log(`[AcademicProgressionService] Found ${studentsToProgress.length} students to consider.`);

        const allLevels = await prisma.level.findMany({ orderBy: { name: 'asc' } });
        if (allLevels.length === 0) throw new AppError('No levels defined.', 500);

        let progressedCount = 0;
        const failedToProgress = [];
        const studentUpdateOperations = [];

        for (const student of studentsToProgress) {
            if (!student.currentLevel || !student.program) { // Check using the include alias 'currentLevel'
                failedToProgress.push({ studentId: student.id, regNo: student.regNo, reason: "Missing current level or program." });
                continue;
            }

            const currentLevelNumeric = getLevelNumericValue(student.currentLevel.name);
            const currentYearOfStudy = currentLevelNumeric / 100;

            if (currentYearOfStudy >= student.program.duration) {
                const isEligibleForGraduation = await canStudentGraduate(student.id, student.programId, student.currentLevel, prisma);
                if (isEligibleForGraduation) {
                    studentUpdateOperations.push(prisma.student.update({
                        where: { id: student.id },
                        data: {
                            isGraduated: true, isActive: false,
                            currentSeasonId: parsedTargetSeasonId, currentSemesterId: targetSemester.id,
                            graduationSeasonId: parsedTargetSeasonId, graduationSemesterId: targetSemester.id,
                        }
                    }));
                    progressedCount++;
                } else {
                    studentUpdateOperations.push(prisma.student.update({
                        where: { id: student.id },
                        data: { currentSeasonId: parsedTargetSeasonId, currentSemesterId: targetSemester.id, isActive: true, isGraduated: false }
                    }));
                    failedToProgress.push({ studentId: student.id, regNo: student.regNo, reason: `Final year, but not eligible for graduation. Remains ${student.currentLevel.name}.` });
                }
                continue;
            }

            const nextLevelNumeric = currentLevelNumeric + 100;
            const nextLevelName = `${nextLevelNumeric} Level`;
            const nextLevelRecord = allLevels.find(l => l.name === nextLevelName);

            if (!nextLevelRecord) {
                failedToProgress.push({ studentId: student.id, regNo: student.regNo, reason: `Next level '${nextLevelName}' not found.` });
                continue;
            }

            studentUpdateOperations.push(prisma.student.update({
                where: { id: student.id },
                data: {
                    currentLevelId: nextLevelRecord.id, // This updates the student's current level
                    currentSeasonId: parsedTargetSeasonId, currentSemesterId: targetSemester.id,
                    isGraduated: false, isActive: true,
                    graduationSeasonId: null, graduationSemesterId: null,
                }
            }));
            progressedCount++;
        }

        if (studentUpdateOperations.length > 0) {
            await prisma.$transaction(studentUpdateOperations);
            console.log("[AcademicProgressionService] Transaction completed.");
        }

        return {
            message: `Student progression to season '${targetSeason.name}' processed.`,
            progressedCount,
            studentsConsidered: studentsToProgress.length,
            failedToProgress,
        };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("[AcademicProgressionService] Raw error:", error.message, error.stack);
        throw new AppError('Student progression failed due to an internal error.', 500);
    }
};