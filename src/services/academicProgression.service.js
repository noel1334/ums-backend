import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import { GradeLetter, DegreeType } from '../generated/prisma/index.js'; // Ensure DegreeType is imported

// Helper function to check graduation eligibility
async function canStudentGraduate(studentId, programId, studentAdmittedSeasonId, programDegreeType, programDuration, prismaClient) {
    console.log(`[canStudentGraduate] Checking graduation eligibility for Student ID: ${studentId}, Program ID: ${programId}, Admitted Season ID: ${studentAdmittedSeasonId}, DegreeType: ${programDegreeType}, Program Duration: ${programDuration}`);

    if (programDuration === 0) {
        console.warn(`[canStudentGraduate] Program ID: ${programId} has duration 0. Assuming graduation eligibility is not applicable via this path.`);
        return { eligible: true, reason: "Program has duration 0 (no formal progression/graduation check needed)." };
    }

    const finalLevelValueForProgram = programDuration * 100;

    // Fetch the admission season object to filter registrations correctly
    const admissionSeason = await prismaClient.season.findUnique({
        where: { id: studentAdmittedSeasonId },
        select: { startDate: true }
    });

    if (!admissionSeason?.startDate) {
        console.warn(`[canStudentGraduate] Admission season start date not found for student ID: ${studentId}, Admitted Season ID: ${studentAdmittedSeasonId}. Cannot accurately filter registered courses.`);
        return { eligible: false, reason: "Admission season start date missing or invalid ID provided." };
    }

    // Get all levels relevant to the student's program (from starting level up to final program level)
    const allSystemLevelsForDegreeType = await prismaClient.level.findMany({
        where: { degreeType: programDegreeType },
        orderBy: { value: 'asc' }
    });

    const relevantLevelsInProgram = allSystemLevelsForDegreeType
        .filter(l => l.value >= 100 && l.value <= finalLevelValueForProgram) // Assuming levels start from 100
        .map(l => l.id);

    if (relevantLevelsInProgram.length === 0) {
        console.warn(`[canStudentGraduate] No relevant levels found for program ${programId} and DegreeType ${programDegreeType} within its duration. Cannot determine required courses.`);
        return { eligible: false, reason: "No relevant levels defined for the program's duration." };
    }

    // Fetch ALL program courses (core and electives) for the student's program across all relevant levels
    const allProgramCoursesInCurriculum = await prismaClient.programCourse.findMany({
        where: {
            programId: programId,
            levelId: { in: relevantLevelsInProgram },
            isActive: true
        },
        select: {
            courseId: true,
            isElective: true,
            course: { select: { code: true, title: true, creditUnit: true } }
        }
    });

    if (allProgramCoursesInCurriculum.length === 0) {
        console.warn(`[canStudentGraduate] No program courses defined for Student ID: ${studentId}, Program ID: ${programId}. Policy: Assuming CAN graduate if no curriculum defined.`);
        return { eligible: true, reason: "No curriculum defined for the program, assuming graduation." };
    }

    // Fetch ALL course registrations for the student from their admission season onwards
    // Filter registrations to only include courses defined in the program's curriculum
    const studentRegistrations = await prismaClient.studentCourseRegistration.findMany({
        where: {
            studentId: studentId,
            season: {
                startDate: { gte: admissionSeason.startDate } // Registered from admission season onwards
            },
            courseId: { in: allProgramCoursesInCurriculum.map(pc => pc.courseId) } // Only consider curriculum courses
        },
        include: {
            course: { select: { code: true, title: true, creditUnit: true } },
            score: { select: { grade: true, cuGp: true, totalScore: true } },
            semester: { select: { type: true, semesterNumber: true } },
            season: { select: { name: true, startDate: true } }
        },
        orderBy: [
            { season: { startDate: 'desc' } }, // Prioritize latest season for the same course (important for re-sits)
            { semester: { semesterNumber: 'desc' } }, // Then latest semester
            { registeredAt: 'desc' }, // Then latest registration date
        ]
    });

    const passedCourses = new Set(); // Stores course IDs for courses that have been passed
    const failingGrades = [GradeLetter.F, GradeLetter.I]; // F = Fail, I = Incomplete

    // Group registrations by courseId and find the latest passing grade
    // We want to ensure that for each required course, there is at least one passing attempt.
    const latestAttemptsPerCourse = new Map(); // Map<courseId, latestRegObject>

    for (const reg of studentRegistrations) {
        if (!latestAttemptsPerCourse.has(reg.courseId) || reg.season.startDate > latestAttemptsPerCourse.get(reg.courseId).season.startDate) {
            latestAttemptsPerCourse.set(reg.courseId, reg);
        } else if (reg.season.startDate.getTime() === latestAttemptsPerCourse.get(reg.courseId).season.startDate.getTime() &&
                   reg.semester.semesterNumber > latestAttemptsPerCourse.get(reg.courseId).semester.semesterNumber) {
            latestAttemptsPerCourse.set(reg.courseId, reg);
        }
    }


    // Now, iterate through all curriculum courses and verify passing status
    for (const progCourse of allProgramCoursesInCurriculum) {
        const courseId = progCourse.courseId;
        const attemptsForCourse = studentRegistrations.filter(r => r.courseId === courseId);

        let hasPassed = false;
        for (const attempt of attemptsForCourse) {
            if (attempt.score && attempt.score.grade && !failingGrades.includes(attempt.score.grade)) {
                hasPassed = true;
                break; // Found a passing grade for this course
            }
        }

        if (!hasPassed) {
            // If it's a core course and no passing attempt, student fails
            if (!progCourse.isElective) {
                console.log(`[canStudentGraduate] Student ID: ${studentId} - Failed to pass required CORE course: ${progCourse.course.code}.`);
                return { eligible: false, reason: `Failed to pass required core course: ${progCourse.course.code}.` };
            }
            // If it's an elective and no passing attempt, we'd need to check if enough other electives were passed.
            // For now, let's assume all registered courses in curriculum must be passed.
            const latestAttempt = latestAttemptsPerCourse.get(courseId);
            const courseCode = latestAttempt?.course.code || progCourse.course.code || 'Unknown Course';
            const latestGrade = latestAttempt?.score?.grade || 'N/A';

            console.log(`[canStudentGraduate] Student ID: ${studentId} - Failed to pass curriculum course: ${courseCode} (latest grade: ${latestGrade}).`);
            return { eligible: false, reason: `Failed to pass curriculum course: ${courseCode}.` };
        }
    }
    console.log(`[canStudentGraduate] Student ID: ${studentId} passed all required curriculum courses (core + registered electives).`);

    // Additional checks (e.g., total credit units, CGPA minimum) can be integrated here.
    // This requires fetching Result records for the student.
    // The previous implementation for these was commented out, but if enabled, ensure it's here.

    // Example for CGPA check (if Result records are up-to-date)
    /*
    const studentResults = await prismaClient.result.findMany({
        where: { studentId: studentId, season: { startDate: { gte: admissionSeason.startDate } } },
        orderBy: { season: { startDate: 'desc' } },
        take: 1
    });
    const finalCgpa = studentResults[0]?.cgpa;
    const MIN_CGPA = 2.5; // Example minimum CGPA
    if (finalCgpa === undefined || finalCgpa === null || finalCgpa < MIN_CGPA) {
        console.log(`[canStudentGraduate] Student ID: ${studentId} - CGPA of ${finalCgpa || 'N/A'} is below required minimum of ${MIN_CGPA}.`);
        return { eligible: false, reason: `CGPA (${finalCgpa || 'N/A'}) is below minimum requirement of ${MIN_CGPA}.` };
    }
    */

    return { eligible: true, reason: "All academic requirements met." };
}


// Main Service Function for Academic Progression
export const progressStudentsToNextLevel = async (progressionData) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const { targetSeasonId, scope, scopeId, specificDegreeType, targetSemesterId } = progressionData;

        // Validations
        if (!targetSeasonId) throw new AppError('Target Season ID is required.', 400);
        const parsedTargetSeasonId = parseInt(targetSeasonId, 10);
        if (isNaN(parsedTargetSeasonId)) throw new AppError('Invalid Target Season ID format.', 400);
        if (!scope || !['ALL', 'FACULTY', 'DEPARTMENT', 'PROGRAM'].includes(scope)) throw new AppError('Invalid scope.', 400);
        if (scope !== 'ALL' && (scopeId === undefined || String(scopeId).trim() === '')) throw new AppError(`Scope ID required for ${scope}.`, 400);
        if (specificDegreeType && !Object.values(DegreeType).includes(specificDegreeType)) {
            throw new AppError(`Invalid specificDegreeType provided: ${specificDegreeType}.`, 400);
        }

        let actualTargetSemester = null;
        if (targetSemesterId !== undefined) {
            actualTargetSemester = await prisma.semester.findUnique({
                where: { id: targetSemesterId, seasonId: parsedTargetSeasonId }
            });
            if (!actualTargetSemester) {
                throw new AppError(`Target Semester ID ${targetSemesterId} not found or does not belong to Season ID ${parsedTargetSeasonId}.`, 404);
            }
            console.log(`[AcademicProgressionService] Using specified target semester: ${actualTargetSemester.name}`);
        } else {
            actualTargetSemester = await prisma.semester.findFirst({
                where: { seasonId: parsedTargetSeasonId, type: 'FIRST' },
                orderBy: { semesterNumber: 'asc' }
            });
            if (!actualTargetSemester) {
                throw new AppError(`First semester for target season ${parsedTargetSeasonId} not found. Cannot proceed with progression.`, 400);
            }
            console.log(`[AcademicProgressionService] Defaulting to first semester of target season: ${actualTargetSemester.name}`);
        }


        const targetSeason = await prisma.season.findUnique({ where: { id: parsedTargetSeasonId } });
        if (!targetSeason) throw new AppError(`Target Season ${parsedTargetSeasonId} not found.`, 404);
        if (!targetSeason.isActive) console.warn(`[AcademicProgressionService] Warning: Progressing to non-active target season ${targetSeason.name}.`);

        const studentWhereClause = {
            isActive: true,
            isGraduated: false,
            program: { duration: { gt: 0 } },
        };

        if (specificDegreeType) {
            studentWhereClause.program.degreeType = specificDegreeType;
        }

        if (scopeId !== undefined && String(scopeId).trim() !== '') {
            const parsedScopeId = parseInt(scopeId, 10);
            if (isNaN(parsedScopeId)) throw new AppError(`Invalid Scope ID '${scopeId}'.`, 400);
            if (scope === 'FACULTY') studentWhereClause.department = { facultyId: parsedScopeId };
            else if (scope === 'DEPARTMENT') studentWhereClause.departmentId = parsedScopeId;
            else if (scope === 'PROGRAM') studentWhereClause.programId = parsedScopeId;
        }

        console.log("[AcademicProgressionService] Fetching students for progression with where clause:", JSON.stringify(studentWhereClause, null, 2));
        const studentsToProgress = await prisma.student.findMany({
            where: studentWhereClause,
            include: { currentLevel: true, program: true, admissionSeason: true }, // FIX: Include admissionSeason
        });

        if (studentsToProgress.length === 0) return { message: 'No students found for progression.', progressedCount: 0, studentsConsidered: 0, failedToProgress: [] };
        console.log(`[AcademicProgressionService] Found ${studentsToProgress.length} students to consider.`);

        let progressedCount = 0;
        const failedToProgress = [];
        const studentUpdateOperations = [];

        for (const student of studentsToProgress) {
            if (!student.currentLevel || !student.program || !student.admissionSeason) { // FIX: Check student.admissionSeason
                failedToProgress.push({ studentId: student.id, regNo: student.regNo, reason: "Missing program, current level, or admission season data. Data integrity issue." });
                continue;
            }

            const currentLevelValue = student.currentLevel.value;
            const programDuration = student.program.duration;
            const maxLevelValueForProgram = programDuration * 100; // e.g., 500 for a 5-year program

            if (currentLevelValue >= maxLevelValueForProgram) {
                console.log(`[AcademicProgressionService] Student ${student.regNo} is at or beyond their program's maximum level (${currentLevelValue} vs ${maxLevelValueForProgram}). Checking for graduation.`);
                const { eligible, reason } = await canStudentGraduate( // FIX: Destructure result from canStudentGraduate
                    student.id,
                    student.programId,
                    student.admissionSeasonId, // FIX: Corrected argument to pass ID
                    student.program.degreeType,
                    programDuration,
                    prisma
                );

                if (eligible) {
                    studentUpdateOperations.push(prisma.student.update({
                        where: { id: student.id },
                        data: {
                            isGraduated: true,
                            isActive: false, // Mark as inactive once graduated
                            currentSeasonId: parsedTargetSeasonId,
                            currentSemesterId: actualTargetSemester.id, // Use actualTargetSemester.id
                            graduationSeasonId: parsedTargetSeasonId,
                            graduationSemesterId: actualTargetSemester.id, // Use actualTargetSemester.id
                        }
                    }));
                    progressedCount++;
                    console.log(`[AcademicProgressionService] Student ${student.regNo} graduated.`);
                } else {
                    studentUpdateOperations.push(prisma.student.update({
                        where: { id: student.id },
                        data: {
                            currentSeasonId: parsedTargetSeasonId,
                            currentSemesterId: actualTargetSemester.id, // Use actualTargetSemester.id
                            isActive: true,
                            isGraduated: false,
                            graduationSeasonId: null,
                            graduationSemesterId: null,
                        }
                    }));
                    failedToProgress.push({ studentId: student.id, regNo: student.regNo, reason: `Final year, but not eligible for graduation. Remains ${student.currentLevel.name} (${currentLevelValue}).` });
                    console.log(`[AcademicProgressionService] Student ${student.regNo} in final year, but not eligible to graduate. Retained current level.`);
                }
                continue;
            }

            let nextLevelFound = null;

            switch (student.program.degreeType) {
                case DegreeType.UNDERGRADUATE:
                case DegreeType.ND:
                case DegreeType.HND:
                case DegreeType.NCE:
                    const expectedNextLevelValue = currentLevelValue + 100;

                    if (expectedNextLevelValue > maxLevelValueForProgram) {
                        failedToProgress.push({
                            studentId: student.id,
                            regNo: student.regNo,
                            reason: `Program duration limit reached. Student ${student.regNo} (Current: ${currentLevelValue}, Max Program Level: ${maxLevelValueForProgram}) cannot progress further. Should be handled by graduation check.`
                        });
                        continue;
                    }

                    nextLevelFound = await prisma.level.findFirst({
                        where: { value: expectedNextLevelValue, degreeType: student.program.degreeType },
                    });

                    if (!nextLevelFound) {
                        failedToProgress.push({
                            studentId: student.id,
                            regNo: student.regNo,
                            reason: `Expected next level (${expectedNextLevelValue}) not found in database for DegreeType ${student.program.degreeType}. Please ensure all levels for this degree type (e.g., 100-500) are created.`
                        });
                        continue;
                    }
                    break;
                case DegreeType.MASTERS:
                case DegreeType.PHD:
                case DegreeType.POSTGRADUATE_DIPLOMA:
                case DegreeType.CERTIFICATE:
                case DegreeType.DIPLOMA:
                case DegreeType.ASSOCIATE:
                case DegreeType.PROFESSIONAL_DOCTORATE:
                    nextLevelFound = await prisma.level.findFirst({
                        where: {
                            degreeType: student.program.degreeType,
                            value: { gt: currentLevelValue }
                        },
                        orderBy: { value: 'asc' }, // Get the immediately next one
                    });

                    if (!nextLevelFound) {
                        failedToProgress.push({ studentId: student.id, regNo: student.regNo, reason: `No further academic levels defined for ${student.program.degreeType} beyond ${student.currentLevel.name} (${currentLevelValue}). Manual review or graduation check needed.` });
                        continue;
                    }
                    break;
                default:
                    failedToProgress.push({ studentId: student.id, regNo: student.regNo, reason: `Unsupported DegreeType for progression: ${student.program.degreeType}.` });
                    continue;
            }

            if (!nextLevelFound) {
                failedToProgress.push({ studentId: student.id, regNo: student.regNo, reason: `Internal: Next level record could not be determined for ${student.program.degreeType} from current level ${currentLevelValue}.` });
                continue;
            }

            studentUpdateOperations.push(prisma.student.update({
                where: { id: student.id },
                data: {
                    currentLevelId: nextLevelFound.id, // Update the student's current level
                    currentSeasonId: parsedTargetSeasonId,
                    currentSemesterId: actualTargetSemester.id, // Use actualTargetSemester.id
                    isGraduated: false,
                    isActive: true,
                    graduationSeasonId: null,
                    graduationSemesterId: null,
                }
            }));
            progressedCount++;
            console.log(`[AcademicProgressionService] Student ${student.regNo} progressed from ${student.currentLevel.name} to ${nextLevelFound.name}.`);
        }

        if (studentUpdateOperations.length > 0) {
            await prisma.$transaction(studentUpdateOperations);
            console.log("[AcademicProgressionService] Transaction completed for student progression updates.");
        }

        return {
            message: `Student progression to season '${targetSeason.name}' processed.`,
            progressedCount,
            studentsConsidered: studentsToProgress.length,
            failedToProgress,
        };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("[AcademicProgressionService] Student progression failed:", error.message, error.stack);
        throw new AppError('Student progression failed due to an internal error.', 500);
    }
};


// Existing batchUpdateStudentsAcademicContext function (no changes needed for this scenario)
export const batchUpdateStudentsAcademicContext = async (batchUpdateData) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);

        const { targetSeasonId, degreeTypeUpdates, scope, scopeId } = batchUpdateData;

        // --- 1. Validate Input Data and Fetch References ---
        const parsedTargetSeasonId = parseInt(targetSeasonId, 10);
        if (isNaN(parsedTargetSeasonId)) {
            throw new AppError('Invalid Target Season ID format.', 400);
        }

        const targetSeason = await prisma.season.findUnique({ where: { id: parsedTargetSeasonId } });
        if (!targetSeason) {
            throw new AppError(`Target Season with ID ${parsedTargetSeasonId} not found.`, 404);
        }

        const allSemestersInSeason = await prisma.semester.findMany({ where: { seasonId: parsedTargetSeasonId } });
        const allLevels = await prisma.level.findMany(); // Fetch all levels to validate against

        const validDegreeTypes = Object.values(DegreeType);

        for (const update of degreeTypeUpdates) {
            if (!validDegreeTypes.includes(update.degreeType)) {
                throw new AppError(`Invalid DegreeType provided: ${update.degreeType}`, 400);
            }
            if (update.newSemesterId !== null && update.newSemesterId !== undefined && isNaN(parseInt(update.newSemesterId))) {
                 throw new AppError(`Invalid newSemesterId format for ${update.degreeType}. Must be a number or null/undefined.`, 400);
            }
            if (update.newLevelId !== null && update.newLevelId !== undefined) {
                const parsedNewLevelId = parseInt(update.newLevelId, 10);
                if (isNaN(parsedNewLevelId)) {
                    throw new AppError(`Invalid newLevelId format for ${update.degreeType}. Must be a number or null/undefined.`, 400);
                }
                const levelExists = allLevels.some(l => l.id === parsedNewLevelId && l.degreeType === update.degreeType);
                if (!levelExists) {
                    throw new AppError(`Level ID ${update.newLevelId} not found or does not match DegreeType ${update.degreeType}.`, 404);
                }
            }
        }


        // --- 2. Build Base Student Query ---
        const studentWhereClause = {
            isActive: true,
            isGraduated: false,
            // currentLevelId is non-nullable, so no `not: null` needed.
            // program.degreeType is non-nullable, so no `not: null` needed.
        };

        if (scopeId !== undefined) {
            const parsedScopeId = parseInt(scopeId, 10);
            if (isNaN(parsedScopeId)) {
                throw new AppError(`Invalid Scope ID '${scopeId}'.`, 400);
            }
            if (scope === 'FACULTY') {
                studentWhereClause.department = { facultyId: parsedScopeId };
            } else if (scope === 'DEPARTMENT') {
                studentWhereClause.departmentId = parsedScopeId;
            } else if (scope === 'PROGRAM') {
                studentWhereClause.programId = parsedScopeId;
            }
        }

        console.log("[AcademicProgressionService] Fetching students for batch update with where clause:", JSON.stringify(studentWhereClause, null, 2));

        const studentsConsidered = await prisma.student.findMany({
            where: studentWhereClause,
            select: {
                id: true,
                regNo: true,
                program: {
                    select: { degreeType: true }
                }
            }
        });

        if (studentsConsidered.length === 0) {
            return {
                message: `No students found for batch update matching the criteria (scope: ${scope}, scopeId: ${scopeId || 'N/A'}).`,
                updatedCount: 0,
                studentsConsidered: 0,
                failedToUpdate: [],
                updatesApplied: [],
            };
        }

        console.log(`[AcademicProgressionService] Found ${studentsConsidered.length} students to consider for batch update.`);

        const updateOperations = [];
        const updatesAppliedLog = [];
        const failedToUpdate = [];
        let updatedCount = 0;

        // --- 3. Apply Updates based on DegreeType ---
        for (const updateConfig of degreeTypeUpdates) {
            const { degreeType, newSemesterId, newLevelId } = updateConfig;

            const studentsForThisDegreeType = studentsConsidered.filter(
                s => s.program?.degreeType === degreeType
            );

            if (studentsForThisDegreeType.length === 0) {
                updatesAppliedLog.push({
                    degreeType: degreeType,
                    status: 'No students found for this degree type in the selected scope.',
                    count: 0
                });
                continue;
            }

            const studentIdsToUpdate = studentsForThisDegreeType.map(s => s.id);

            const dataToUpdate = {
                currentSeasonId: parsedTargetSeasonId,
            };

            if (newSemesterId !== undefined) {
                dataToUpdate.currentSemesterId = newSemesterId;
            }
            if (newLevelId !== undefined) {
                dataToUpdate.currentLevelId = newLevelId;
            }

            if (Object.keys(dataToUpdate).length > 1 || (Object.keys(dataToUpdate).length === 1 && dataToUpdate.currentSeasonId !== undefined)) {
                updateOperations.push(
                    prisma.student.updateMany({
                        where: { id: { in: studentIdsToUpdate } },
                        data: dataToUpdate,
                    })
                );
                updatesAppliedLog.push({
                    degreeType: degreeType,
                    newSemesterId: newSemesterId,
                    newLevelId: newLevelId,
                    count: studentIdsToUpdate.length,
                    status: 'Scheduled for update',
                    fields: Object.keys(dataToUpdate).join(', ')
                });
                updatedCount += studentIdsToUpdate.length;
            } else {
                 updatesAppliedLog.push({
                    degreeType: degreeType,
                    status: 'No specific changes requested for currentSemester or currentLevel.',
                    count: 0
                });
            }
        }

        if (updateOperations.length > 0) {
            await prisma.$transaction(updateOperations);
            console.log("[AcademicProgressionService] Batch update transaction completed.");
        }

        return {
            message: `Batch update for students' academic context processed.`,
            updatedCount: updatedCount,
            studentsConsidered: studentsConsidered.length,
            failedToUpdate: failedToUpdate,
            updatesApplied: updatesAppliedLog,
        };

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("[AcademicProgressionService] Batch update students academic context failed:", error.message, error.stack);
        throw new AppError('Batch update failed due to an internal server error.', 500);
    }
};

export const batchGraduateStudents = async (graduationData) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);

        const { targetSeasonId, targetSemesterId, scope, scopeId, specificDegreeType } = graduationData;

        // --- 1. Validate Input Data and Fetch References ---
        const parsedTargetSeasonId = parseInt(targetSeasonId, 10);
        if (isNaN(parsedTargetSeasonId)) {
            throw new AppError('Invalid Target Season ID format.', 400);
        }

        const targetSeason = await prisma.season.findUnique({ where: { id: parsedTargetSeasonId } });
        if (!targetSeason) {
            throw new AppError(`Target Season with ID ${parsedTargetSeasonId} not found.`, 404);
        }

        let actualGraduationSemester = null;
        if (targetSemesterId !== undefined) {
            actualGraduationSemester = await prisma.semester.findUnique({
                where: { id: targetSemesterId, seasonId: parsedTargetSeasonId }
            });
            if (!actualGraduationSemester) {
                throw new AppError(`Target Semester ID ${targetSemesterId} not found or does not belong to Season ID ${parsedTargetSeasonId}.`, 404);
            }
            console.log(`[AcademicProgressionService] Using specified graduation semester: ${actualGraduationSemester.name}`);
        } else {
            // Default to FIRST semester of the target season if not specified
            actualGraduationSemester = await prisma.semester.findFirst({
                where: { seasonId: parsedTargetSeasonId, type: 'FIRST' },
                orderBy: { semesterNumber: 'asc' }
            });
            if (!actualGraduationSemester) {
                throw new AppError(`First semester for target season ${targetSeason.name} not found. Cannot proceed with graduation.`, 400);
            }
            console.log(`[AcademicProgressionService] Defaulting to first semester of target season for graduation: ${actualGraduationSemester.name}`);
        }

        if (!scope || !['ALL', 'FACULTY', 'DEPARTMENT', 'PROGRAM'].includes(scope)) {
            throw new AppError('Invalid scope provided. Must be ALL, FACULTY, DEPARTMENT, or PROGRAM.', 400);
        }

        if (specificDegreeType && !Object.values(DegreeType).includes(specificDegreeType)) {
            throw new AppError(`Invalid specificDegreeType provided: ${specificDegreeType}.`, 400);
        }

        // --- 2. Build Base Student Query ---
        const studentWhereClause = {
            isActive: true,
            isGraduated: false, // Only consider students not yet graduated
            program: {
                duration: { gt: 0 } // Only consider programs with a defined duration
            },
        };

        if (specificDegreeType) {
            studentWhereClause.program.degreeType = specificDegreeType;
        }

        if (scopeId !== undefined && String(scopeId).trim() !== '') {
            const parsedScopeId = parseInt(scopeId, 10);
            if (isNaN(parsedScopeId)) {
                throw new AppError(`Invalid Scope ID '${scopeId}'.`, 400);
            }
            if (scope === 'FACULTY') {
                studentWhereClause.department = { facultyId: parsedScopeId };
            } else if (scope === 'DEPARTMENT') {
                studentWhereClause.departmentId = parsedScopeId;
            } else if (scope === 'PROGRAM') {
                studentWhereClause.programId = parsedScopeId;
            }
        }

        console.log("[AcademicProgressionService] Fetching students for batch graduation with where clause:", JSON.stringify(studentWhereClause, null, 2));

        // Fetch students with necessary relations for graduation check
        const studentsToConsider = await prisma.student.findMany({
            where: studentWhereClause,
            include: {
                program: true,
                currentLevel: true,
                admissionSeason: true, // IMPORTANT: Ensure admissionSeason is included for canStudentGraduate
            }
        });

        if (studentsToConsider.length === 0) {
            return {
                message: `No eligible students found for batch graduation matching the criteria (scope: ${scope}, specificDegreeType: ${specificDegreeType || 'ALL'}).`,
                graduatedCount: 0,
                studentsConsidered: 0,
                failedToGraduate: [],
            };
        }
        console.log(`[AcademicProgressionService] Found ${studentsToConsider.length} students to consider for batch graduation.`);

        const graduateOperations = [];
        const graduatedStudentsLog = [];
        const failedToGraduate = [];

        // --- 3. Evaluate and Apply Graduation Status ---
        for (const student of studentsToConsider) {
            if (!student.program || !student.currentLevel || !student.admissionSeason) {
                failedToGraduate.push({
                    studentId: student.id,
                    regNo: student.regNo,
                    reason: "Missing program, current level, or admission season data. Data integrity issue."
                });
                continue;
            }

            const programDuration = student.program.duration;
            const currentLevelValue = student.currentLevel.value;
            const maxLevelValueForProgram = programDuration * 100;

            // Pre-check: Student must be at or beyond their program's expected final level
            if (currentLevelValue < maxLevelValueForProgram) {
                failedToGraduate.push({
                    studentId: student.id,
                    regNo: student.regNo,
                    reason: `Student is not yet at the final academic level for their program (Current: ${currentLevelValue}, Expected Final: ${maxLevelValueForProgram}).`
                });
                continue;
            }

            const { eligible, reason } = await canStudentGraduate(
                student.id,
                student.programId,
                student.admissionSeasonId, // Correctly pass admissionSeasonId
                student.program.degreeType,
                programDuration,
                prisma
            );

            if (eligible) {
                graduateOperations.push(prisma.student.update({
                    where: { id: student.id },
                    data: {
                        isGraduated: true,
                        isActive: false, // Inactivate graduated students
                        currentSeasonId: parsedTargetSeasonId, // Update current context to graduation context
                        currentSemesterId: actualGraduationSemester.id,
                        graduationSeasonId: parsedTargetSeasonId, // Set graduation context
                        graduationSemesterId: actualGraduationSemester.id,
                    }
                }));
                graduatedStudentsLog.push({
                    studentId: student.id,
                    regNo: student.regNo,
                    message: `Successfully marked as graduated (Reason: ${reason}).`
                });
            } else {
                failedToGraduate.push({ studentId: student.id, regNo: student.regNo, reason });
            }
        }

        if (graduateOperations.length > 0) {
            await prisma.$transaction(graduateOperations);
            console.log("[AcademicProgressionService] Batch graduation transaction completed.");
        }

        return {
            message: `Batch graduation process completed for season '${targetSeason.name}'.`,
            graduatedCount: graduatedStudentsLog.length,
            studentsConsidered: studentsToConsider.length,
            failedToGraduate: failedToGraduate,
        };

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("[AcademicProgressionService] Batch graduate students failed:", error.message, error.stack);
        throw new AppError('Batch graduation failed due to an internal server error.', 500);
    }
};