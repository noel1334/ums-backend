// src/services/studentCourseRegistration.service.js

import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import { LecturerRole, GradeLetter, SemesterType, CourseType } from '../generated/prisma/index.js';

// Reusable selection for common public registration details
const registrationPublicSelection = {
    id: true, registeredAt: true, isScoreRecorded: true,
    student: {
        select: {
            id: true,
            regNo: true,
            name: true,
            departmentId: true,
            programId: true,
            currentLevelId: true, 
            department: { select: { name: true } },
            program: { select: { name: true } }, 
        }
    },
    course: {
        select: {
            id: true,
            code: true,
            title: true,
            creditUnit: true,
            preferredSemesterType: true
        }
    },
    semester: { select: {
        id: true,
        name: true,
        type: true,
        areStudentEditsLocked: true,
        semesterNumber: true,
        seasonId: true,
        isActive: true
    } },
    level: { select: { id: true, name: true, value: true } },
    season: { select: { id: true, name: true } },
    score: { select: { id: true, totalScore: true, grade: true } }
};


// Grades considered "passing" for prerequisite checks
const passingGrades = [GradeLetter.A, GradeLetter.B, GradeLetter.C, GradeLetter.D, GradeLetter.E, GradeLetter.P];


// --- Helper function to validate a single course for registration/update ---
async function validateCourseForRegistration(tx, studentId, courseId, semesterId, levelId, seasonId, currentSemester, currentLevel, studentProgramId, currentSeason, isAddingNewCourse = false, currentProposedCourses = []) {
    const pCourseId = parseInt(courseId, 10);
    if (isNaN(pCourseId)) throw new AppError(`Invalid course ID format: ${courseId}.`, 400);

    const course = await tx.course.findUnique({ where: { id: pCourseId } });
    if (!course) throw new AppError(`Course ID ${pCourseId} not found.`, 404);

    const programCourseLink = await tx.programCourse.findUnique({
        where: { programCourseLevelUnique: { programId: studentProgramId, courseId: pCourseId, levelId: levelId } }
    });
    if (!programCourseLink) {
        throw new AppError(`Course '${course.title}' (Code: ${course.code}) is not offered for program at Level ${currentLevel.name}.`, 400);
    }

    // Credit Unit Limits Check (only applies when adding new courses)
    if (isAddingNewCourse) {
        const unitRequirement = await tx.programCourseUnitRequirement.findUnique({
            where: {
                programId_levelId_semesterType: {
                    programId: studentProgramId,
                    levelId: levelId,
                    semesterType: currentSemester.type,
                },
                isActive: true,
            },
        });

        if (!unitRequirement) {
            throw new AppError(`Credit unit limits are not configured for this program at Level ${currentLevel.name} for ${currentSemester.type} Semester. Please contact academic affairs.`, 400);
        }

        const currentTotalUnitsInProposedSet = currentProposedCourses.reduce((sum, c) => sum + (c.course?.creditUnit || 0), 0); 
        const potentialTotalUnits = currentTotalUnitsInProposedSet + course.creditUnit;

        if (potentialTotalUnits > unitRequirement.maximumCreditUnits) {
            throw new AppError(
                `Cannot register course '${course.code}'. Total credit units (${potentialTotalUnits}) would exceed the maximum allowed (${unitRequirement.maximumCreditUnits} units) for this period.`,
                400
            );
        }
    }

    // Prerequisite Check (only applies when adding new courses)
    if (isAddingNewCourse) {
        const coursePrerequisites = await tx.coursePrerequisite.findMany({
            where: { courseId: pCourseId },
            select: {
                prerequisite: {
                    select: { id: true, code: true, title: true }
                }
            }
        });

        for (const prerequisite of coursePrerequisites) {
            const passedPrerequisite = await tx.studentCourseRegistration.findFirst({
                where: {
                    studentId: studentId,
                    courseId: prerequisite.prerequisite.id,
                    score: { is: { grade: { in: passingGrades } } }, 
                    AND: [
                        {
                            seasonId: { lt: currentSeason.id } 
                        },
                        {
                            seasonId: currentSeason.id,
                            semester: { semesterNumber: { lt: currentSemester.semesterNumber } }
                        }
                    ]
                },
                select: { id: true }
            });

            if (!passedPrerequisite) {
                throw new AppError(
                    `Prerequisite not met: Student must have a passing grade in '${prerequisite.prerequisite.title}' (Code: ${prerequisite.prerequisite.code}) from a prior academic period to register for '${course.title}'.`,
                    400
                );
            }
        }
    }

    return course;
}


// --- Service Function: registerStudentForCourse ---
export const registerStudentForCourse = async (registrationData, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const { studentId, courseId, semesterId, levelId, seasonId } = registrationData;

        if (!studentId || !courseId || !semesterId || !levelId || !seasonId) {
            throw new AppError('Student, Course, Semester, Level, and Season IDs are required.', 400);
        }
        const pStudentId = parseInt(studentId, 10);
        const pCourseId = parseInt(courseId, 10);
        const pSemesterId = parseInt(semesterId, 10);
        const pLevelId = parseInt(levelId, 10);
        const pSeasonId = parseInt(seasonId, 10);

        if (isNaN(pStudentId) || isNaN(pCourseId) || isNaN(pSemesterId) || isNaN(pLevelId) || isNaN(pSeasonId)) {
            throw new AppError('Invalid ID format for one or more parameters.', 400);
        }

        const isAdmin = requestingUser.type === 'admin';
        const isPermittedICT = requestingUser.type === 'ictstaff' && requestingUser.canManageCourseRegistration;
        const isSelfStudent = requestingUser.type === 'student' && requestingUser.id === pStudentId;
        const isLecturer = requestingUser.type === 'lecturer';

        if (!isAdmin && !isPermittedICT && !isSelfStudent && !isLecturer) { 
             throw new AppError('You are not authorized to register courses.', 403);
        }

        const [student, currentSemester, currentLevel, currentSeason] = await Promise.all([
            prisma.student.findUnique({ where: { id: pStudentId }, select: { id: true, isActive: true, programId: true, departmentId: true } }), 
            prisma.semester.findUnique({ where: { id: pSemesterId }, select: { id: true, isActive: true, areStudentEditsLocked: true, type: true, semesterNumber: true, seasonId: true } }),
            prisma.level.findUnique({ where: { id: pLevelId }, select: { id: true, name: true } }),
            prisma.season.findUnique({ where: { id: pSeasonId }, select: { id: true, name: true } })
        ]);

        if (!student) throw new AppError(`Student ID ${pStudentId} not found.`, 404);
        if (!student.isActive) throw new AppError('Student is not active.', 400);
        if (!currentSemester) throw new AppError(`Semester ID ${pSemesterId} not found.`, 404);
        if (!currentLevel) throw new AppError(`Level ID ${pLevelId} not found.`, 404);
        if (!currentSeason) throw new AppError(`Season ID ${pSeasonId} not found.`, 404);

        const isAdministrativeUser = isAdmin || isPermittedICT;
        if (!currentSemester.isActive && !isAdministrativeUser) {
            throw new AppError('Course registration is not open for this semester (semester inactive).', 400);
        }
        
        if (currentSemester.areStudentEditsLocked && !isAdmin && !isPermittedICT) {
             if (requestingUser.type === 'student') {
                throw new AppError('Course registration/modification period for students is currently locked for this semester.', 400);
             } else if (isLecturer) {
                throw new AppError('Course registration/modification period is currently locked for this semester. Only Admin/ICT can register.', 403);
             }
        }
        
        const schoolFeeRecord = await prisma.schoolFee.findFirst({
            where: {
                studentId: pStudentId,
                seasonId: pSeasonId,
            },
            select: {
                paymentStatus: true
            }
        });

        if (!schoolFeeRecord || schoolFeeRecord.paymentStatus !== 'PAID') {
            if (isSelfStudent) {
                throw new AppError(`Course registration is blocked. You have an outstanding school fee for the ${currentSeason.name} session. Please complete your payment.`, 403);
            } else {
                throw new AppError(`Cannot register courses for this student. They have an outstanding school fee for the ${currentSeason.name} session.`, 403);
            }
        }

        if (isLecturer && !isAdmin && !isPermittedICT) { 
            const isHODForStudentDept = requestingUser.role === LecturerRole.HOD && requestingUser.departmentId === student.departmentId;
            const isExaminerForCourse = requestingUser.role === LecturerRole.EXAMINER && await prisma.staffCourse.findFirst({
                where: { lecturerId: requestingUser.id, courseId: pCourseId, semesterId: pSemesterId, seasonId: pSeasonId }
            });
            if (!isHODForStudentDept && !isExaminerForCourse) {
                throw new AppError('As a Lecturer, you are not authorized to register courses for this student or course.', 403);
            }
        }

        const existingRegistration = await prisma.studentCourseRegistration.findUnique({
            where: { unique_student_course_semester_season_registration: { studentId: pStudentId, courseId: pCourseId, semesterId: pSemesterId, seasonId: pSeasonId } }
        });
        if (existingRegistration) {
            throw new AppError('Student is already registered for this course in this semester and season.', 409);
        }

        const existingRegistrationsForPeriod = await prisma.studentCourseRegistration.findMany({
            where: { studentId: pStudentId, semesterId: pSemesterId, seasonId: pSeasonId },
            select: { course: { select: { creditUnit: true } }, courseId: true, id: true }
        });

        const course = await validateCourseForRegistration(prisma, pStudentId, pCourseId, pSemesterId, pLevelId, pSeasonId, currentSemester, currentLevel, student.programId, currentSeason, true, existingRegistrationsForPeriod);

        const newRegistration = await prisma.studentCourseRegistration.create({
            data: {
                studentId: pStudentId,
                courseId: pCourseId,
                semesterId: pSemesterId,
                levelId: pLevelId,
                seasonId: pSeasonId,
            },
            select: registrationPublicSelection
        });
        
        return newRegistration;

    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2002') {
            throw new AppError('Student is already registered for this course in this semester and season.', 409);
        }
        console.error("[StudentCourseRegistration Service] Error registering student for course:", error.message, error.stack);
        throw new AppError('Could not register student for course due to an internal error.', 500);
    }
};

// --- Service Function: updateStudentCourseRegistration ---
export const updateStudentCourseRegistration = async (id, updateData, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const regId = parseInt(id, 10);
        if (isNaN(regId)) throw new AppError('Invalid registration ID.', 400);

        const registration = await prisma.studentCourseRegistration.findUnique({
            where: { id: regId },
            select: { 
                id: true,
                isScoreRecorded: true,
                semester: { select: { id: true, type: true, areStudentEditsLocked: true, seasonId: true, semesterNumber: true, isActive: true } },
                student: { select: { programId: true, id: true, currentLevelId: true, departmentId: true } },
                course: { select: { id: true, creditUnit: true, code: true, title: true } },
                level: { select: { id: true, name: true, value: true } },
                season: { select: { id: true, name: true } },
                score: { select: { id: true } }
            }
        });
        if (!registration) throw new AppError('Registration not found.', 404);
        if (registration.score) {
            throw new AppError('Cannot update registration after score has been recorded.', 400);
        }

        const isAdmin = requestingUser.type === 'admin';
        const isPermittedICT = requestingUser.type === 'ictstaff' && requestingUser.canManageCourseRegistration;
        const isSelfStudent = requestingUser.type === 'student' && requestingUser.id === registration.student.id;
        const isLecturer = requestingUser.type === 'lecturer';

        if (registration.semester.areStudentEditsLocked && !isAdmin && !isPermittedICT) {
             if (requestingUser.type === 'student') {
                throw new AppError('Course registration/modification period for students is locked for this semester.', 400);
            }
            if (isLecturer) { 
                throw new AppError('Course registration/modification period is locked for this semester. Only Admin/ICT can update.', 403);
            }
        }
        
        if (isLecturer && !isAdmin && !isPermittedICT) {
            const isHODForStudentDept = requestingUser.role === LecturerRole.HOD && requestingUser.departmentId === registration.student.departmentId;
            const isExaminerForCourse = requestingUser.role === LecturerRole.EXAMINER && await prisma.staffCourse.findFirst({
                where: { lecturerId: requestingUser.id, courseId: registration.course.id, semesterId: registration.semester.id, seasonId: registration.season.id }
            });
            if (!isHODForStudentDept && !isExaminerForCourse) {
                throw new AppError('As a Lecturer, you are not authorized to update this course registration.', 403);
            }
        }
        if (isSelfStudent) { 
             throw new AppError('Students cannot directly update individual course registrations here. Please use the Add/Drop feature if available for this period.', 403);
        }


        const dataForDb = {};
        const { courseId } = updateData;

        if (courseId !== undefined && courseId !== null && parseInt(courseId, 10) !== registration.course.id) {
            const pCourseId = parseInt(courseId, 10);
            if (isNaN(pCourseId)) throw new AppError('Invalid course ID for update.', 400);

            const [currentSemester, currentLevel, currentSeason] = await Promise.all([
                prisma.semester.findUnique({ where: { id: registration.semester.id }, select: { id: true, isActive: true, areStudentEditsLocked: true, type: true, semesterNumber: true, seasonId: true } }),
                prisma.level.findUnique({ where: { id: registration.level.id }, select: { id: true, name: true } }),
                prisma.season.findUnique({ where: { id: registration.season.id }, select: { id: true, name: true } })
            ]);
            if (!currentSemester || !currentLevel || !currentSeason) throw new AppError('Associated academic period data missing for registration update.', 500);

            const existingRegistrationsForPeriod = await prisma.studentCourseRegistration.findMany({
                where: { studentId: registration.student.id, semesterId: registration.semester.id, seasonId: registration.season.id, id: { not: regId } },
                select: { course: { select: { creditUnit: true } }, courseId: true, id: true }
            });
            const newCourseData = await prisma.course.findUnique({ where: { id: pCourseId }, select: { id: true, creditUnit: true, code: true, title: true }});
            if (!newCourseData) throw new AppError(`New Course ID ${pCourseId} not found.`, 404);
            
            const virtualExistingRegs = [...existingRegistrationsForPeriod, { id: 0, courseId: newCourseData.id, course: newCourseData }]; 
            
            await validateCourseForRegistration(prisma, registration.student.id, pCourseId, registration.semester.id, registration.level.id, registration.season.id, currentSemester, currentLevel, registration.student.programId, currentSeason, true, virtualExistingRegs);

            const existingConflict = await prisma.studentCourseRegistration.findFirst({
                where: {
                    studentId: registration.student.id,
                    courseId: pCourseId,
                    semesterId: registration.semester.id,
                    seasonId: registration.season.id,
                    id: { not: regId } 
                }
            });
            if (existingConflict) throw new AppError('Student is already registered for the new target course in this semester/season.', 409);

            dataForDb.courseId = pCourseId; 
        }

        if (Object.keys(dataForDb).length === 0) {
            throw new AppError('No valid fields provided for update.', 400);
        }

        const updatedRegistration = await prisma.studentCourseRegistration.update({
            where: { id: regId },
            data: dataForDb,
            select: registrationPublicSelection
        });
        return updatedRegistration;
    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2002') {
            throw new AppError('Update failed: This course registration combination would violate a unique constraint.', 409);
        }
        console.error("[StudentCourseRegistration Service] Error updating registration:", error.message, error.stack);
        throw new AppError('Could not update registration due to an internal error.', 500);
    }
};


// --- Service Function: deleteStudentCourseRegistration ---
export const deleteStudentCourseRegistration = async (id, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const regId = parseInt(id, 10);
        if (isNaN(regId)) throw new AppError('Invalid registration ID.', 400);

        const registration = await prisma.studentCourseRegistration.findUnique({
            where: { id: regId },
            select: { 
                id: true,
                isScoreRecorded: true,
                semester: { select: { id: true, type: true, areStudentEditsLocked: true, seasonId: true, semesterNumber: true } },
                student: { select: { id: true, programId: true, currentLevelId: true, departmentId: true } }, 
                course: { select: { id: true, creditUnit: true, code: true, title: true } },
                level: { select: { id: true, name: true } },
                season: { select: { id: true } },
                score: { select: { id: true } }
            }
        });
        if (!registration) throw new AppError('Course registration not found.', 404);

        if (registration.score) {
            throw new AppError(`Cannot delete course '${registration.course.code}'. A score has already been recorded.`, 400);
        }
        if (registration.semester.areStudentEditsLocked && !(requestingUser.type === 'admin' || (requestingUser.type === 'ictstaff' && requestingUser.canManageCourseRegistration))) {
            throw new AppError(`Cannot delete course '${registration.course.code}'. Registration period is locked for this semester.`, 400);
        }

        const isAdmin = requestingUser.type === 'admin';
        const isPermittedICT = requestingUser.type === 'ictstaff' && requestingUser.canManageCourseRegistration;
        const isSelfStudent = requestingUser.type === 'student' && requestingUser.id === registration.student.id;
        const isLecturer = requestingUser.type === 'lecturer';

        if (!isAdmin && !isPermittedICT && !isSelfStudent && !isLecturer) { 
            throw new AppError('You are not authorized to delete this course registration.', 403);
        }

        if (isLecturer && !isAdmin && !isPermittedICT) { 
             const isHODForStudentDept = requestingUser.role === LecturerRole.HOD && requestingUser.departmentId === registration.student.departmentId;
             const isExaminerForCourse = requestingUser.role === LecturerRole.EXAMINER && await prisma.staffCourse.findFirst({
                 where: { lecturerId: requestingUser.id, courseId: registration.course.id, semesterId: registration.semester.id, seasonId: registration.season.id }
             });
             if (!isHODForStudentDept && !isExaminerForCourse) {
                 throw new AppError('As a Lecturer, you are not authorized to delete this course registration.', 403);
             }
        }

        if (isSelfStudent) {
            const unitRequirement = await prisma.programCourseUnitRequirement.findUnique({
                where: {
                    programId_levelId_semesterType: {
                        programId: registration.student.programId,
                        levelId: registration.level.id,
                        semesterType: registration.semester.type,
                    },
                    isActive: true,
                },
            });

            if (unitRequirement) {
                const existingRegistrationsForPeriod = await prisma.studentCourseRegistration.findMany({
                    where: {
                        studentId: registration.student.id,
                        semesterId: registration.semester.id,
                        seasonId: registration.season.id,
                        id: { not: regId } 
                    },
                    select: {
                        course: { select: { creditUnit: true } }
                    }
                });
                const remainingUnits = existingRegistrationsForPeriod.reduce((sum, reg) => sum + reg.course.creditUnit, 0);

                if (remainingUnits < unitRequirement.minimumCreditUnits) {
                    throw new AppError(
                        `Cannot drop course '${registration.course.code}'. Remaining credit units (${remainingUnits}) would fall below the minimum allowed (${unitRequirement.minimumCreditUnits} units) for your program, Level ${registration.level.name}, ${registration.semester.type} Semester.`,
                        400
                    );
                }
            }
        }

        await prisma.studentCourseRegistration.delete({ where: { id: regId } });
        return { message: `Course '${registration.course.code}' registration deleted successfully.` };
    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2003') {
            throw new AppError('Cannot delete registration due to existing dependencies (e.g., associated scores or results).', 400);
        }
        console.error("[StudentCourseRegistration Service] Error deleting registration:", error.message, error.stack);
        throw new AppError('Could not delete registration due to an internal error.', 500);
    }
};

// --- Service Function: deleteMultipleStudentCourseRegistrations ---
export const deleteMultipleStudentCourseRegistrations = async (registrationIds, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        if (!Array.isArray(registrationIds) || registrationIds.length === 0) {
            throw new AppError('No registration IDs provided for bulk deletion.', 400);
        }

        const parsedIds = registrationIds.map(id => parseInt(id, 10));
        if (parsedIds.some(isNaN)) {
            throw new AppError('Invalid ID format in the provided list of registration IDs.', 400);
        }

        const isAdmin = requestingUser.type === 'admin';
        const isPermittedICT = requestingUser.type === 'ictstaff' && requestingUser.canManageCourseRegistration;
        const isStudent = requestingUser.type === 'student';
        const isLecturer = requestingUser.type === 'lecturer';
        
        if (!isAdmin && !isPermittedICT && !isStudent && !isLecturer) { 
            throw new AppError('You are not authorized to delete multiple course registrations.', 403);
        }

        // --- INCREASED BATCH TRANSACTION TIMEOUT ---
        return await prisma.$transaction(async (tx) => {
            const registrationsToDelete = await tx.studentCourseRegistration.findMany({
                where: { id: { in: parsedIds } },
                select: { 
                    id: true,
                    isScoreRecorded: true,
                    semester: { select: { id: true, type: true, areStudentEditsLocked: true, seasonId: true, semesterNumber: true } },
                    student: { select: { id: true, programId: true, currentLevelId: true, departmentId: true } }, 
                    course: { select: { id: true, creditUnit: true, code: true, title: true } },
                    level: { select: { id: true, name: true } },
                    season: { select: { id: true } },
                    score: { select: { id: true } }
                }
            });

            if (registrationsToDelete.length !== parsedIds.length) {
                throw new AppError('One or more selected registrations were not found or you are not authorized to delete them.', 404);
            }

            const firstReg = registrationsToDelete[0];
            const currentSemesterId = firstReg.semester.id;
            const currentSeasonId = firstReg.season.id;
            const studentProgramId = firstReg.student.programId;
            const studentLevelId = firstReg.level.id;
            const semesterType = firstReg.semester.type;
            const affectedStudentId = firstReg.student.id;


            for (const reg of registrationsToDelete) {
                if (reg.score) {
                    throw new AppError(`Cannot delete course '${reg.course.code}' (ID: ${reg.id}). A score has already been recorded.`, 400);
                }
                if (reg.semester.areStudentEditsLocked && !(isAdmin || isPermittedICT)) {
                    throw new AppError(`Cannot delete course '${reg.course.code}' (ID: ${reg.id}). Registration period is locked for this semester.`, 400);
                }
                
                if (reg.semester.id !== currentSemesterId || reg.season.id !== currentSeasonId || reg.student.id !== affectedStudentId) {
                     throw new AppError('Bulk deletion is only allowed for registrations belonging to the same student and academic period.', 400);
                }

                if (isStudent && reg.student.id !== requestingUser.id) {
                    throw new AppError(`Authorization error: Cannot delete registrations not belonging to your account.`, 403);
                }
                if (isLecturer && !isAdmin && !isPermittedICT) { 
                    const isHODForStudentDept = requestingUser.role === LecturerRole.HOD && requestingUser.departmentId === reg.student.departmentId;
                    const isExaminerForCourse = requestingUser.role === LecturerRole.EXAMINER && await tx.staffCourse.findFirst({
                        where: { lecturerId: requestingUser.id, courseId: reg.course.id, semesterId: reg.semester.id, seasonId: reg.season.id }
                    });
                    if (!isHODForStudentDept && !isExaminerForCourse) {
                        throw new AppError(`As a Lecturer, you are not authorized to delete course '${reg.course.code}'.`, 403);
                    }
                }
            }

            const deleteResult = await tx.studentCourseRegistration.deleteMany({
                where: { id: { in: parsedIds } }
            });

            return { message: `Successfully deleted ${deleteResult.count} course registrations.` };
        }, { timeout: 30000 });

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("[StudentCourseRegistration Service] Error deleting multiple registrations:", error.message, error.stack);
        throw new AppError('Could not delete selected registrations due to an internal error.', 500);
    }
};

// --- Service Function: getStudentRegisteredCourses ---
export const getStudentRegisteredCourses = async (studentId, query) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);

        const pStudentId = parseInt(studentId, 10);
        if (isNaN(pStudentId)) {
            throw new AppError('Invalid student ID format.', 400);
        }

        const { seasonId, semesterId, page = "1", limit = "10" } = query;

        const where = { studentId: pStudentId };

        if (seasonId) {
            const pSeasonId = parseInt(String(seasonId), 10);
            if (!isNaN(pSeasonId)) where.seasonId = pSeasonId;
            else throw new AppError('Invalid season ID format.', 400);
        }

        if (semesterId) {
            const pSemesterId = parseInt(String(semesterId), 10);
            if (!isNaN(pSemesterId)) where.semesterId = pSemesterId;
            else throw new AppError('Invalid semester ID format.', 400);
        }

        let pageNum = parseInt(page, 10);
        let limitNum = parseInt(limit, 10);
        if (isNaN(pageNum) || pageNum < 1) pageNum = 1;
        if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) limitNum = 10;
        const skip = (pageNum - 1) * limitNum;

        const [registrations, totalItems] = await prisma.$transaction([
            prisma.studentCourseRegistration.findMany({
                where,
                select: registrationPublicSelection,
                orderBy: { registeredAt: 'desc' },
                skip,
                take: limitNum,
            }),
            prisma.studentCourseRegistration.count({ where }),
        ]);

        const uniqueSeasons = new Map();
        const uniqueSemesters = new Map();
        const uniqueLevels = new Map();

        registrations.forEach(reg => {
            if (reg.season) uniqueSeasons.set(reg.season.id, { id: reg.season.id, name: reg.season.name });
            if (reg.semester) uniqueSemesters.set(reg.semester.id, { id: reg.semester.id, name: reg.semester.name });
            if (reg.level) uniqueLevels.set(reg.level.id, { id: reg.level.id, name: reg.level.name });
        });

        const filterOptions = {
            seasons: Array.from(uniqueSeasons.values()).sort((a, b) => a.name.localeCompare(b.name)),
            semesters: Array.from(uniqueSemesters.values()).sort((a, b) => a.name.localeCompare(b.name)),
            levels: Array.from(uniqueLevels.values()).sort((a, b) => a.name.localeCompare(b.name)),
        };

        return {
            items: registrations,
            totalPages: Math.ceil(totalItems / limitNum),
            currentPage: pageNum,
            limit: limitNum,
            totalItems,
            filterOptions,
        };

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("[StudentCourseRegistration Service] Error fetching student's registered courses:", error.message, error.stack);
        throw new AppError("Could not retrieve student's registered courses.", 500);
    }
};

// --- Service Function: getStudentCourseRegistrationById ---
export const getStudentCourseRegistrationById = async (id, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const regId = parseInt(id, 10);
        if (isNaN(regId)) throw new AppError('Invalid registration ID.', 400);

        const registration = await prisma.studentCourseRegistration.findUnique({
            where: { id: regId },
            select: { 
                ...registrationPublicSelection,
                student: {
                    select: {
                        id: true, regNo: true, name: true, departmentId: true,
                        programId: true, currentLevelId: true,
                    }
                }
            }
        });
        if (!registration) throw new AppError('Course registration not found.', 404);

        const isAdmin = requestingUser.type === 'admin';
        const isPermittedICT = requestingUser.type === 'ictstaff' && requestingUser.canManageCourseRegistration;
        const isSelf = requestingUser.type === 'student' && requestingUser.id === registration.student.id;
        const isLecturer = requestingUser.type === 'lecturer';
        
        if (isLecturer) {
            const isHODForStudentDept = requestingUser.role === LecturerRole.HOD && requestingUser.departmentId === registration.student.departmentId;
            const isExaminerForCourse = requestingUser.role === LecturerRole.EXAMINER && await prisma.staffCourse.findFirst({
                where: { lecturerId: requestingUser.id, courseId: registration.course.id, semesterId: registration.semester.id, seasonId: registration.season.id }
            });
            if (isHODForStudentDept || isExaminerForCourse) {
                return registration;
            }
        }
        
        if (isAdmin || isPermittedICT || isSelf) { 
            return registration;
        }
        throw new AppError('You are not authorized to view this course registration.', 403);
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("[StudentCourseRegistration Service] Error fetching registration by ID:", error.message, error.stack);
        throw new AppError('Could not retrieve registration.', 500);
    }
};

// --- Service Function: getAllStudentCourseRegistrations ---
export const getAllStudentCourseRegistrations = async (query, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const {
            studentId: queryStudentId,
            courseId, semesterId, seasonId, levelId,
            departmentId: queryDeptId,
            programId,
            search,
            page = 1, limit = 100 
        } = query;

        const where = {};
        const filters = [];

        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;
        
        const isStudent = requestingUser.type === 'student';

        if (queryStudentId) {
            const parsedStudentId = parseInt(queryStudentId, 10);
            if (!isNaN(parsedStudentId)) {
                filters.push({ studentId: parsedStudentId });
            }
        } else if (isStudent) {
            filters.push({ studentId: requestingUser.id });
        } else if (requestingUser.type === 'lecturer' && requestingUser.role === 'HOD') {
            filters.push({ student: { departmentId: requestingUser.departmentId } });
        }

        if (seasonId) filters.push({ seasonId: parseInt(seasonId, 10) });
        if (semesterId) filters.push({ semesterId: parseInt(semesterId, 10) });
        if (levelId) filters.push({ levelId: parseInt(levelId, 10) });
        if (courseId) filters.push({ courseId: parseInt(courseId, 10) });

        if (!queryStudentId && queryDeptId) filters.push({ student: { departmentId: parseInt(queryDeptId, 10) } });
        if (!queryStudentId && programId) filters.push({ student: { programId: parseInt(programId, 10) } });
        
        if (search) {
            filters.push({
                OR: [
                    { student: { name: { contains: search, mode: 'insensitive' } } },
                    { student: { regNo: { contains: search, mode: 'insensitive' } } },
                ]
            });
        }

        if (filters.length > 0) {
            where.AND = filters;
        }

        const [items, totalItems] = await prisma.$transaction([
            prisma.studentCourseRegistration.findMany({
                where,
                select: {
                    id: true, registeredAt: true, isScoreRecorded: true,
                    student: {
                        select: {
                            id: true,
                            regNo: true,
                            name: true,
                            departmentId: true,
                            programId: true, 
                            currentLevelId: true,
                            department: { select: { name: true } },
                            program: { select: { id: true, name: true } },
                        }
                    },
                    course: {
                        select: {
                            id: true,
                            code: true,
                            title: true,
                            creditUnit: true,
                            preferredSemesterType: true
                        }
                    },
                    semester: { select: {
                        id: true,
                        name: true,
                        type: true,
                        areStudentEditsLocked: true,
                        semesterNumber: true,
                        seasonId: true,
                        isActive: true
                    } },
                    level: { select: { id: true, name: true, value: true } }, 
                    season: { select: { id: true, name: true } },
                    score: { select: { id: true, totalScore: true, grade: true } }
                },
                orderBy: { course: { code: 'asc' } }, 
                skip,
                take: limitNum
            }),
            prisma.studentCourseRegistration.count({ where })
        ]);

        const enhancedItems = await Promise.all(items.map(async (reg) => {
            let courseType = 'CORE'; 

            const programCourse = await prisma.programCourse.findFirst({
                where: {
                    programId: reg.student.program.id, 
                    levelId: reg.level.id,             
                    courseId: reg.course.id,           
                },
                select: {
                    isElective: true,
                },
            });

            if (programCourse?.isElective) {
                courseType = 'ELECTIVE';
            }

            return {
                ...reg,
                course: {
                    ...reg.course,
                    courseType: courseType, 
                },
            };
        }));

        return {
            items: enhancedItems, 
            totalPages: Math.ceil(totalItems / limitNum),
            currentPage: pageNum,
            totalItems
        };

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("[StudentCourseRegistration Service] Error fetching registrations:", error);
        throw new AppError('Could not retrieve registrations.', 500);
    }
};

// --- Service Function: getCourseRegistrationCompletionCount ---
export const getCourseRegistrationCompletionCount = async (query) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const { seasonId, semesterId, departmentId, programId, levelId } = query;

        const whereClause = {};
        if (!seasonId) throw new AppError('Season ID is required to get registration counts.', 400);
        whereClause.seasonId = parseInt(seasonId, 10);
        if (isNaN(whereClause.seasonId)) throw new AppError('Invalid Season ID.', 400);

        if (semesterId) {
            whereClause.semesterId = parseInt(semesterId, 10);
            if (isNaN(whereClause.semesterId)) throw new AppError('Invalid Semester ID.', 400);
        }
        const studentWhere = {};
        if (departmentId) studentWhere.departmentId = parseInt(departmentId, 10);
        if (programId) studentWhere.programId = parseInt(programId, 10);
        if (levelId) studentWhere.currentLevelId = parseInt(levelId, 10); 

        if (Object.keys(studentWhere).length > 0) {
            whereClause.student = studentWhere;
        }


        const distinctStudentsRegistered = await prisma.studentCourseRegistration.groupBy({
            by: ['studentId'],
            where: whereClause,
            _count: {
                studentId: true,
            }
        });

        return {
            seasonId: whereClause.seasonId,
            semesterId: whereClause.semesterId || null,
            departmentId: departmentId ? parseInt(departmentId, 10) : null,
            programId: programId ? parseInt(programId, 10) : null,
            levelId: levelId ? parseInt(levelId, 10) : null,
            totalStudentsRegistered: distinctStudentsRegistered.length
        };

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("[StudentCourseRegistration Service] Error getting registration completion count:", error.message, error.stack);
        throw new AppError('Could not get registration completion count.', 500);
    }
};

// --- Service Function: updateMyRegistrationsForPeriod ---
export const updateMyRegistrationsForPeriod = async (studentId, seasonId, semesterId, levelId, desiredCourses, requestingUser) => {
    if (!prisma) throw new AppError('Prisma client is not available.', 500);
    const pStudentId = parseInt(studentId, 10);
    const pSeasonId = parseInt(seasonId, 10);
    const pSemesterId = parseInt(semesterId, 10);
    const pLevelId = parseInt(levelId, 10);

    if (isNaN(pStudentId) || isNaN(pSeasonId) || isNaN(pSemesterId) || isNaN(pLevelId)) {
        throw new AppError('Invalid ID format for student, season, semester, or level.', 400);
    }
    if (!Array.isArray(desiredCourses)) {
        throw new AppError('Desired courses must be an array.', 400);
    }

    const isAdmin = requestingUser.type === 'admin';
    const isPermittedICT = requestingUser.type === 'ictstaff' && requestingUser.canManageCourseRegistration;
    const isSelfStudent = requestingUser.type === 'student' && requestingUser.id === pStudentId;

    if (!isAdmin && !isPermittedICT && !isSelfStudent) {
        throw new AppError('You are not authorized to modify these course registrations.', 403);
    }

    // --- INCREASING TIMEOUT LIMIT ---
    return await prisma.$transaction(async (tx) => {
        const [student, currentSemester, currentLevel, currentSeason] = await Promise.all([
            tx.student.findUnique({ where: { id: pStudentId }, select: { id: true, isActive: true, programId: true } }),
            tx.semester.findUnique({ where: { id: pSemesterId }, select: { id: true, isActive: true, areStudentEditsLocked: true, type: true, semesterNumber: true, seasonId: true } }),
            tx.level.findUnique({ where: { id: pLevelId }, select: { id: true, name: true } }),
            tx.season.findUnique({ where: { id: pSeasonId }, select: { id: true, name: true } })
        ]);

        if (!student) throw new AppError(`Student ID ${pStudentId} not found.`, 404);
        if (!student.isActive) throw new AppError('Student is not active.', 400);
        if (!currentSemester) throw new AppError(`Semester ID ${pSemesterId} not found.`, 404);
        if (!currentLevel) throw new AppError(`Level ID ${pLevelId} not found.`, 404);
        if (!currentSeason) throw new AppError(`Season ID ${pSeasonId} not found.`, 404);

        const isAdministrativeUser = isAdmin || isPermittedICT;
        if (!currentSemester.isActive && !isAdministrativeUser) {
            throw new AppError('Course registration period is not open for this semester (semester inactive).', 400);
        }
        
        if (currentSemester.areStudentEditsLocked && !isAdmin && !isPermittedICT) { 
            throw new AppError('Course registration/modification period is currently locked for this semester.', 400);
        }

        const currentRegistrations = await tx.studentCourseRegistration.findMany({
            where: {
                studentId: pStudentId,
                seasonId: pSeasonId,
                semesterId: pSemesterId,
            },
            include: {
                course: { select: { id: true, creditUnit: true, code: true, title: true } },
                score: { select: { id: true } },
                semester: { select: { areStudentEditsLocked: true } }
            }
        });
        const currentRegisteredCourseIds = new Set(currentRegistrations.map(reg => reg.course.id));
        const desiredCourseIdsSet = new Set(desiredCourses.map(dc => parseInt(dc.courseId, 10)));


        const registrationsToCreate = [];
        const registrationsToDeleteIds = [];
        const finalDesiredCoursesWithDetails = [];

        for (const desiredCourse of desiredCourses) {
            const courseIdNum = parseInt(desiredCourse.courseId, 10);
            if (isNaN(courseIdNum)) {
                throw new AppError(`Invalid course ID format in desired courses array: ${desiredCourse.courseId}.`, 400);
            }

            if (!currentRegisteredCourseIds.has(courseIdNum)) {
                const courseDetails = await validateCourseForRegistration(tx, pStudentId, courseIdNum, pSemesterId, pLevelId, pSeasonId, currentSemester, currentLevel, student.programId, currentSeason, true, finalDesiredCoursesWithDetails);
                registrationsToCreate.push({
                    studentId: pStudentId,
                    courseId: courseIdNum,
                    semesterId: pSemesterId,
                    levelId: pLevelId,
                    seasonId: pSeasonId,
                });
                finalDesiredCoursesWithDetails.push({ courseId: courseDetails.id, course: { creditUnit: courseDetails.creditUnit } });
            } else {
                const existingReg = currentRegistrations.find(reg => reg.course.id === courseIdNum);
                if (existingReg) {
                    finalDesiredCoursesWithDetails.push({ courseId: existingReg.course.id, course: { creditUnit: existingReg.course.creditUnit } });
                } else {
                    throw new AppError(`Desired course ID ${courseIdNum} is marked as registered but not found in current registrations.`, 500);
                }
            }
        }

        for (const currentReg of currentRegistrations) {
            if (!desiredCourseIdsSet.has(currentReg.course.id)) {
                if (currentReg.score) {
                    throw new AppError(`Cannot remove course '${currentReg.course.code}'. A score has already been recorded.`, 400);
                }
                registrationsToDeleteIds.push(currentReg.id);
            }
        }

        let changesMade = 0;

        if (registrationsToDeleteIds.length > 0) {
            await tx.studentCourseRegistration.deleteMany({
                where: { id: { in: registrationsToDeleteIds } }
            });
            changesMade += registrationsToDeleteIds.length;
        }

        if (registrationsToCreate.length > 0) {
            await tx.studentCourseRegistration.createMany({
                data: registrationsToCreate
            });
            changesMade += registrationsToCreate.length;
        }

        const unitRequirement = await tx.programCourseUnitRequirement.findUnique({
            where: {
                programId_levelId_semesterType: {
                    programId: student.programId,
                    levelId: pLevelId,
                    semesterType: currentSemester.type,
                },
                isActive: true,
            },
        });

        if (unitRequirement) {
            const finalTotalUnits = finalDesiredCoursesWithDetails.reduce((sum, c) => sum + c.course.creditUnit, 0);
            if (finalTotalUnits < unitRequirement.minimumCreditUnits) {
                throw new AppError(
                    `Cannot update registrations. Final total credit units (${finalTotalUnits}) would fall below the minimum allowed (${unitRequirement.minimumCreditUnits} units) for your program, Level ${currentLevel.name}, ${currentSemester.type} Semester.`,
                    400
                );
            }
        }

        if (changesMade === 0) {
            return { message: 'No changes made to course registrations.', addedCount: 0, removedCount: 0 };
        }

        return {
            message: `Course registrations updated successfully. Added ${registrationsToCreate.length} courses, removed ${registrationsToDeleteIds.length} courses.`,
            addedCount: registrationsToCreate.length,
            removedCount: registrationsToDeleteIds.length
        };
    }, { timeout: 30000 }); // Custom timeout
};

// --- Service Function: updateStudentRegistrationsForPeriodByStaff ---
export const updateStudentRegistrationsForPeriodByStaff = async (targetStudentId, seasonId, semesterId, levelId, desiredCourses, requestingUser) => {
    if (!prisma) throw new AppError('Prisma client is not available.', 500);
    const pTargetStudentId = parseInt(targetStudentId, 10);
    const pSeasonId = parseInt(seasonId, 10);
    const pSemesterId = parseInt(semesterId, 10);
    const pLevelId = parseInt(levelId, 10);

    if (isNaN(pTargetStudentId) || isNaN(pSeasonId) || isNaN(pSemesterId) || isNaN(pLevelId)) {
        throw new AppError('Invalid ID format for target student, season, semester, or level.', 400);
    }
    if (!Array.isArray(desiredCourses)) {
        throw new AppError('Desired courses must be an array.', 400);
    }

    const isAdmin = requestingUser.type === 'admin';
    const isPermittedICT = requestingUser.type === 'ictstaff' && requestingUser.canManageCourseRegistration;
    const isLecturer = requestingUser.type === 'lecturer';

    if (!isAdmin && !isPermittedICT && !isLecturer) { 
        throw new AppError('You are not authorized to modify course registrations for other students.', 403);
    }

    // --- INCREASING TIMEOUT LIMIT ---
    return await prisma.$transaction(async (tx) => {
        const [student, currentSemester, currentLevel, currentSeason] = await Promise.all([
            tx.student.findUnique({ where: { id: pTargetStudentId }, select: { id: true, isActive: true, programId: true, departmentId: true } }), 
            tx.semester.findUnique({ where: { id: pSemesterId }, select: { id: true, isActive: true, areStudentEditsLocked: true, type: true, semesterNumber: true, seasonId: true } }),
            tx.level.findUnique({ where: { id: pLevelId }, select: { id: true, name: true } }),
            tx.season.findUnique({ where: { id: pSeasonId }, select: { id: true, name: true } })
        ]);

        if (!student) throw new AppError(`Student ID ${pTargetStudentId} not found.`, 404);
        if (!student.isActive) throw new AppError('Student is not active.', 400);
        if (!currentSemester) throw new AppError(`Semester ID ${pSemesterId} not found.`, 404);
        if (!currentLevel) throw new AppError(`Level ID ${pLevelId} not found.`, 404);
        if (!currentSeason) throw new AppError(`Season ID ${pSeasonId} not found.`, 404);

        const isAdministrativeUser = isAdmin || isPermittedICT;
        if (!currentSemester.isActive && !isAdministrativeUser) {
             throw new AppError('Course registration period is not open for this semester (semester inactive).', 400);
        }
        
        if (currentSemester.areStudentEditsLocked && !isAdmin && !isPermittedICT) {
             throw new AppError('Course registration/modification period is currently locked for this semester. Only Admin/ICT can modify.', 403);
        }

        if (isLecturer && !isAdmin && !isPermittedICT) {
            const isHODForStudentDept = requestingUser.role === LecturerRole.HOD && requestingUser.departmentId === student.departmentId;
            const hasAuthForCourses = await Promise.all(desiredCourses.map(async (dc) => {
                const courseIdNum = parseInt(dc.courseId, 10);
                if (isNaN(courseIdNum)) return false; 
                return !!(await tx.staffCourse.findFirst({
                    where: { lecturerId: requestingUser.id, courseId: courseIdNum, semesterId: pSemesterId, seasonId: pSeasonId }
                }));
            }));
            const isExaminerForRelevantCourse = hasAuthForCourses.some(auth => auth); 

            if (!isHODForStudentDept && !isExaminerForRelevantCourse) { 
                throw new AppError('As a Lecturer, you are not authorized to modify registrations for this student or these courses.', 403);
            }
        }

        const currentRegistrations = await tx.studentCourseRegistration.findMany({
            where: {
                studentId: pTargetStudentId,
                seasonId: pSeasonId,
                semesterId: pSemesterId,
            },
            include: {
                course: { select: { id: true, creditUnit: true, code: true, title: true } },
                score: { select: { id: true } },
                semester: { select: { areStudentEditsLocked: true } }
            }
        });
        const currentRegisteredCourseIds = new Set(currentRegistrations.map(reg => reg.course.id));
        const desiredCourseIdsSet = new Set(desiredCourses.map(dc => parseInt(dc.courseId, 10)));


        const registrationsToCreate = [];
        const registrationsToDeleteIds = [];
        const finalDesiredCoursesWithDetails = [];

        for (const desiredCourse of desiredCourses) {
            const courseIdNum = parseInt(desiredCourse.courseId, 10);
            if (isNaN(courseIdNum)) {
                throw new AppError(`Invalid course ID format in desired courses array: ${desiredCourse.courseId}.`, 400);
            }

            if (!currentRegisteredCourseIds.has(courseIdNum)) {
                const courseDetails = await validateCourseForRegistration(tx, pTargetStudentId, courseIdNum, pSemesterId, pLevelId, pSeasonId, currentSemester, currentLevel, student.programId, currentSeason, true, finalDesiredCoursesWithDetails);
                registrationsToCreate.push({
                    studentId: pTargetStudentId,
                    courseId: courseIdNum,
                    semesterId: pSemesterId,
                    levelId: pLevelId,
                    seasonId: pSeasonId,
                });
                finalDesiredCoursesWithDetails.push({ courseId: courseDetails.id, course: { creditUnit: courseDetails.creditUnit } });
            } else {
                const existingReg = currentRegistrations.find(reg => reg.course.id === courseIdNum);
                if (existingReg) {
                    finalDesiredCoursesWithDetails.push({ courseId: existingReg.course.id, course: { creditUnit: existingReg.course.creditUnit } });
                } else {
                    throw new AppError(`Desired course ID ${courseIdNum} is marked as registered but not found in current registrations.`, 500);
                }
            }
        }

        for (const currentReg of currentRegistrations) {
            if (!desiredCourseIdsSet.has(currentReg.course.id)) {
                if (currentReg.score) {
                    throw new AppError(`Cannot remove course '${currentReg.course.code}'. A score has already been recorded.`, 400);
                }
                registrationsToDeleteIds.push(currentReg.id);
            }
        }

        let changesMade = 0;

        if (registrationsToDeleteIds.length > 0) {
            await tx.studentCourseRegistration.deleteMany({
                where: { id: { in: registrationsToDeleteIds } }
            });
            changesMade += registrationsToDeleteIds.length;
        }

        if (registrationsToCreate.length > 0) {
            await tx.studentCourseRegistration.createMany({
                data: registrationsToCreate
            });
            changesMade += registrationsToCreate.length;
        }

        const unitRequirement = await tx.programCourseUnitRequirement.findUnique({
            where: {
                programId_levelId_semesterType: {
                    programId: student.programId,
                    levelId: pLevelId,
                    semesterType: currentSemester.type,
                },
                isActive: true,
            },
        });

        if (unitRequirement) {
            const finalTotalUnits = finalDesiredCoursesWithDetails.reduce((sum, c) => sum + c.course.creditUnit, 0);
            if (finalTotalUnits < unitRequirement.minimumCreditUnits) {
                throw new AppError(
                    `Cannot update registrations. Final total credit units (${finalTotalUnits}) would fall below the minimum allowed (${unitRequirement.minimumCreditUnits} units) for student's program, Level ${currentLevel.name}, ${currentSemester.type} Semester.`,
                    400
                );
            }
        }

        if (changesMade === 0) {
            return { message: 'No changes made to course registrations.', addedCount: 0, removedCount: 0 };
        }

        return {
            message: `Course registrations updated successfully. Added ${registrationsToCreate.length} courses, removed ${registrationsToDeleteIds.length} courses.`,
            addedCount: registrationsToCreate.length,
            removedCount: registrationsToDeleteIds.length
        };
    }, { timeout: 30000 }); // Custom timeout
};


// --- Service Function: getRegisteredStudents ---
export const getRegisteredStudents = async (filters, query) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);

        const { courseId, semesterId, seasonId } = filters;
        if (!courseId || !semesterId || !seasonId) {
            throw new AppError('Course ID, Semester ID, and Season ID are all required for filtering.', 400);
        }

        const pCourseId = parseInt(courseId, 10);
        const pSemesterId = parseInt(semesterId, 10);
        const pSeasonId = parseInt(seasonId, 10);

        if (isNaN(pCourseId) || isNaN(pSemesterId) || isNaN(pSeasonId)) {
            throw new AppError('Invalid ID format for course, semester, or season.', 400);
        }

        const { page = 1, limit = 20, studentName, studentRegNo } = query;
        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;

        const whereClause = {
            courseId: pCourseId,
            semesterId: pSemesterId,
            seasonId: pSeasonId,
        };

        if (studentName) {
            whereClause.student = {
                ...whereClause.student,
                name: { contains: studentName, mode: 'insensitive' }
            };
        }
        if (studentRegNo) {
            whereClause.student = {
                ...whereClause.student,
                regNo: { contains: studentRegNo, mode: 'insensitive' }
            };
        }

        const registrations = await prisma.studentCourseRegistration.findMany({
            where: whereClause,
            select: {
                student: {
                    select: {
                        id: true,
                        regNo: true,
                        jambRegNo: true,
                        name: true,
                        email: true,
                        profileImg: true,
                        currentLevel: { select: { name: true, value: true } },
                        program: { select: { name: true, programCode: true } },
                    }
                }
            },
            orderBy: {
                student: { name: 'asc' }
            },
            skip,
            take: limitNum
        });

        const students = registrations.map(reg => reg.student);

        const totalStudents = await prisma.studentCourseRegistration.count({ where: whereClause });

        return {
            students,
            totalPages: Math.ceil(totalStudents / limitNum),
            currentPage: pageNum,
            totalStudents,
        };

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching registered students:", error.message, error.stack);
        throw new AppError('Could not retrieve the list of registered students.', 500);
    }
};