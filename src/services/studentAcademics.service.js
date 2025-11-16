// src/services/studentAcademics.service.js

import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import { GradeLetter, SemesterType, LecturerRole } from '../generated/prisma/index.js';

// --- Helper for getRegistrableCoursesForStudent (Comprehensive version) ---
const courseDetailsForRegistrationSelection = {
    id: true,
    code: true,
    title: true,
    creditUnit: true,
    courseType: true,
    isActive: true,
    department: { select: { id: true, name: true } },
    preferredSemesterType: true,
};

const getPreferredSemesterTypeFromCourse = (course) => {
    return course.preferredSemesterType;
};

// --- Service Function: getRegistrableCoursesForStudent ---
export const getRegistrableCoursesForStudent = async (studentId, targetSeasonId, targetSemesterId) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);

        const pStudentId = parseInt(studentId, 10);
        const pTargetSeasonId = parseInt(targetSeasonId, 10);
        const pTargetSemesterId = parseInt(targetSemesterId, 10);

        if (isNaN(pStudentId) || isNaN(pTargetSeasonId) || isNaN(pTargetSemesterId)) {
            throw new AppError('Invalid ID format for student, season, or semester.', 400);
        }

        const student = await prisma.student.findUnique({
            where: { id: pStudentId },
            include: {
                currentLevel: true, // <-- FIXED: Changed from 'level' to 'currentLevel'
                program: true,
                currentSemester: true,
                registrations: {
                    where: { isScoreRecorded: true },
                    include: {
                        score: true,
                        course: { select: { id: true } }
                    }
                }
            }
        });

        if (!student) throw new AppError('Student not found.', 404);
        if (!student.currentLevel?.id || !student.programId || !student.departmentId) { // Accessing id from currentLevel
            throw new AppError('Student academic profile (level, program, or department) is incomplete.', 400);
        }
        
        const targetSemester = await prisma.semester.findUnique({
            where: { id: pTargetSemesterId },
            include: { season: true }
        });

        if (!targetSemester) throw new AppError('Target semester not found.', 404);
        if (targetSemester.seasonId !== pTargetSeasonId) {
            throw new AppError('Target semester does not belong to the target season.', 400);
        }
        if (!targetSemester.isActive) {
            throw new AppError('Course registration is not open for the target semester (semester inactive).', 400);
        }

        // --- 0. Get IDs of courses the student has already passed ---
        const passedCourseIds = new Set();
        student.registrations.forEach(reg => {
            if (reg.score) {
                const isPassed = reg.score.point !== null && reg.score.point >= 1.0 &&
                    ![GradeLetter.F, GradeLetter.E].includes(reg.score.grade);
                if (isPassed) {
                    passedCourseIds.add(reg.course.id);
                }
            }
        });

        // --- 1. Get courses for the student's current program and level for the target semester type ---
        const programCoursesForCurrentLevel = await prisma.programCourse.findMany({
            where: {
                programId: student.programId,
                levelId: student.currentLevel.id, // Accessing id from currentLevel
                isActive: true,
                course: {
                    isActive: true,
                    OR: [
                        { preferredSemesterType: targetSemester.type },
                        { preferredSemesterType: null }
                    ]
                }
            },
            include: {
                course: { select: courseDetailsForRegistrationSelection }
            }
        });

        let potentialCourses = programCoursesForCurrentLevel
            .filter(pc => !passedCourseIds.has(pc.course.id))
            .map(pc => ({
                ...pc.course,
                isElective: pc.isElective,
                programCourseId: pc.id,
                offeringReason: `Current Program Offering for ${student.currentLevel.name}` // Accessing name from currentLevel
            }));

        // --- 2. Get student's failed courses (carryovers) ---
        const studentFailedRegistrations = await prisma.studentCourseRegistration.findMany({
            where: {
                studentId: pStudentId,
                isScoreRecorded: true,
                score: {
                    OR: [
                        { grade: GradeLetter.F },
                        { grade: GradeLetter.E },
                    ]
                },
                course: { isActive: true },
                NOT: {
                    semesterId: pTargetSemesterId,
                    seasonId: pTargetSeasonId
                }
            },
            include: {
                course: { select: courseDetailsForRegistrationSelection },
                semester: { include: { season: true } }
            }
        });

        const failedCoursesToCarryOver = [];
        for (const reg of studentFailedRegistrations) {
            const course = reg.course;
            const coursePreferredSemesterType = getPreferredSemesterTypeFromCourse(course);
            const shouldOfferInTargetSemester = coursePreferredSemesterType === null || coursePreferredSemesterType === targetSemester.type;

            if (shouldOfferInTargetSemester && !passedCourseIds.has(course.id)) {
                if (!potentialCourses.find(pc => pc.id === course.id)) {
                    failedCoursesToCarryOver.push({
                        ...course,
                        isElective: false,
                        programCourseId: null,
                        offeringReason: `Carryover from ${reg.semester.name} (${reg.semester.season.name})`
                    });
                }
            }
        }

        potentialCourses.push(...failedCoursesToCarryOver);

        // --- 3. Remove duplicates based on course ID, prioritizing current offerings ---
        const uniqueCourseMap = new Map();
        potentialCourses.forEach(course => {
            if (!uniqueCourseMap.has(course.id)) {
                uniqueCourseMap.set(course.id, course);
            } else {
                const existing = uniqueCourseMap.get(course.id);
                if (course.offeringReason.startsWith("Current Program Offering") && existing.offeringReason.startsWith("Carryover")) {
                    uniqueCourseMap.set(course.id, course);
                }
            }
        });
        const finalPotentialCourses = Array.from(uniqueCourseMap.values());


        // --- 4. Filter out courses student is ALREADY registered for in the target semester/season ---
        const currentRegistrationsInTarget = await prisma.studentCourseRegistration.findMany({
            where: {
                studentId: pStudentId,
                semesterId: pTargetSemesterId,
                seasonId: pTargetSeasonId,
            },
            select: { courseId: true }
        });
        const currentlyRegisteredCourseIds = new Set(currentRegistrationsInTarget.map(r => r.courseId));

        let availableToRegister = finalPotentialCourses.filter(
            course => !currentlyRegisteredCourseIds.has(course.id)
        );

        // --- 5. Prerequisite Checking (Simplified example) ---
        const coursesWithPrerequisiteStatus = [];
        for (const course of availableToRegister) {
            const prerequisites = await prisma.coursePrerequisite.findMany({
                where: { courseId: course.id, prerequisite: { isActive: true } },
                include: { prerequisite: { select: { id: true, code: true, title: true } } }
            });

            let prerequisitesMet = true;
            const unmetPrerequisites = [];
            if (prerequisites.length > 0) {
                for (const prereqLink of prerequisites) {
                    if (!passedCourseIds.has(prereqLink.prerequisiteId)) {
                        prerequisitesMet = false;
                        unmetPrerequisites.push({ code: prereqLink.prerequisite.code, title: prereqLink.prerequisite.title });
                    }
                }
            }
            coursesWithPrerequisiteStatus.push({
                ...course,
                prerequisitesMet,
                unmetPrerequisites: prerequisitesMet ? [] : unmetPrerequisites,
                prerequisiteList: prerequisites.map(p => ({ id: p.prerequisiteId, code: p.prerequisite.code, title: p.prerequisite.title }))
            });
        }
        availableToRegister = coursesWithPrerequisiteStatus;

        return {
            student: { id: student.id, name: student.name, regNo: student.regNo, level: student.currentLevel.name, program: student.program.name }, // Accessing name from currentLevel
            targetSeason: { id: pTargetSeasonId, name: targetSemester.season.name },
            targetSemester: { id: pTargetSemesterId, name: targetSemester.name, type: targetSemester.type },
            availableCourses: availableToRegister,
        };

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("[StudentAcademicsService] Error fetching registrable courses:", error.message, error.stack);
        throw new AppError('Could not retrieve registrable courses.', 500);
    }
};

// --- Service Function: getStudentCurriculumCoursesForPeriod ---
export const getStudentCurriculumCoursesForPeriod = async (studentId, targetSeasonId, targetSemesterId, optionalLevelId = null) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);

        const pStudentId = parseInt(studentId, 10);
        const pTargetSeasonId = parseInt(targetSeasonId, 10);
        const pTargetSemesterId = parseInt(targetSemesterId, 10);

        if (isNaN(pStudentId) || isNaN(pTargetSeasonId) || isNaN(pTargetSemesterId)) {
            throw new AppError('Invalid ID format for student, season, or semester.', 400);
        }

        const student = await prisma.student.findUnique({
            where: { id: pStudentId },
            select: {
                id: true,
                programId: true,
                currentLevelId: true,
                registrations: {
                    where: { seasonId: pTargetSeasonId, semesterId: pTargetSemesterId },
                    select: { courseId: true }
                }
            }
        });

        if (!student) {
            throw new AppError('Student not found.', 404);
        }

        const targetSemester = await prisma.semester.findUnique({
            where: { id: pTargetSemesterId, seasonId: pTargetSeasonId },
            select: { type: true, name: true, season: { select: { name: true } } }
        });

        if (!targetSemester) {
            throw new AppError('Target semester not found for the given season.', 404);
        }

        const targetLevelId = optionalLevelId ? parseInt(optionalLevelId, 10) : student.currentLevelId;
        if (isNaN(targetLevelId)) {
             throw new AppError('Invalid or undeterminable target level ID.', 400);
        }
        const targetLevel = await prisma.level.findUnique({ where: { id: targetLevelId }, select: { id: true, name: true } });
        if (!targetLevel) {
            throw new AppError(`Level ID ${targetLevelId} not found.`, 404);
        }

        const programCourses = await prisma.programCourse.findMany({
            where: {
                programId: student.programId,
                levelId: targetLevelId,
                isActive: true,
                course: {
                    isActive: true,
                    OR: [
                        { preferredSemesterType: targetSemester.type },
                        { preferredSemesterType: null },
                    ]
                }
            },
            select: {
                course: {
                    select: {
                        id: true,
                        code: true,
                        title: true,
                        creditUnit: true,
                        courseType: true,
                        preferredSemesterType: true,
                    }
                },
                isElective: true
            }
        });

        const registeredCourseIds = new Set(student.registrations.map(reg => reg.courseId));
        
        const coursesInCurriculum = programCourses
            .filter(pc => !registeredCourseIds.has(pc.course.id))
            .map(pc => ({
                id: pc.course.id,
                code: pc.course.code,
                title: pc.course.title,
                creditUnit: pc.course.creditUnit,
                isElective: pc.isElective,
                courseType: pc.course.courseType,
                preferredSemesterType: pc.course.preferredSemesterType,
            }));

        const unitRequirements = await prisma.programCourseUnitRequirement.findUnique({
            where: {
                programId_levelId_semesterType: {
                    programId: student.programId,
                    levelId: targetLevelId,
                    semesterType: targetSemester.type
                }
            },
            select: { minimumCreditUnits: true, maximumCreditUnits: true }
        });

        return {
            studentId: student.id,
            programId: student.programId,
            level: { id: targetLevel.id, name: targetLevel.name },
            season: { id: pTargetSeasonId, name: targetSemester.season.name },
            semester: { id: pTargetSemesterId, name: targetSemester.name, type: targetSemester.type },
            courses: coursesInCurriculum,
            unitRequirements: unitRequirements || null,
        };

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("[StudentAcademicsService] Error getting student's curriculum courses for period:", error.message, error.stack);
        throw new AppError('Could not retrieve curriculum courses.', 500);
    }
};

export const getRegistrableCoursesForAdmin = async (studentIdentifier, targetSeasonId, targetSemesterId, requestingUser, filters = {}) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);

        // --- 1. Authorization ---
        const isAdmin = requestingUser.type === 'admin';
        const isPermittedICT = requestingUser.type === 'ictstaff' && requestingUser.canManageCourseRegistration;
        const isHODorExaminer = requestingUser.type === 'lecturer' &&
                                (requestingUser.role === LecturerRole.HOD || requestingUser.role === LecturerRole.EXAMINER);

        if (!isAdmin && !isPermittedICT && !isHODorExaminer) {
            throw new AppError('You are not authorized to view registrable courses for other students.', 403);
        }

        // --- 2. Validate & Find Student (with fix for numeric ID) ---
        if (!studentIdentifier) {
            throw new AppError('Student identifier is required.', 400);
        }

        let studentLookupWhere = {};
        const isNumericIdentifier = !isNaN(studentIdentifier);

        if (isNumericIdentifier) {
            studentLookupWhere = { id: parseInt(studentIdentifier, 10) };
        } else {
            studentLookupWhere = {
                OR: [
                    { regNo: studentIdentifier },
                    { jambRegNo: studentIdentifier },
                    { email: studentIdentifier }
                ]
            };
        }

        const student = await prisma.student.findFirst({
            where: studentLookupWhere,
            include: {
                currentLevel: true,
                program: true,
                department: true,
                registrations: {
                    where: { isScoreRecorded: true },
                    include: {
                        score: true,
                        course: { select: { id: true } }
                    }
                }
            }
        });

        if (!student) {
            throw new AppError(`Student with identifier '${studentIdentifier}' not found.`, 404);
        }
        if (!student.isActive) throw new AppError(`Student '${student.name}' is not active.`, 400);
        if (!student.currentLevel?.id || !student.programId || !student.departmentId) {
            throw new AppError('Student academic profile is incomplete.', 400);
        }

        // --- 3. Finer-grained Authorization ---
        if (isHODorExaminer && requestingUser.departmentId !== student.departmentId) {
            throw new AppError('You are not authorized to view students outside your department.', 403);
        }

        // --- 4. Validate Academic Period & Filters ---
        const pTargetSeasonId = parseInt(targetSeasonId, 10);
        const pTargetSemesterId = parseInt(targetSemesterId, 10);
        
        const targetSemester = await prisma.semester.findUnique({
            where: { id: pTargetSemesterId },
            include: { season: true }
        });

        if (!targetSemester) throw new AppError('Target semester not found.', 404);
        if (targetSemester.seasonId !== pTargetSeasonId) {
            throw new AppError('Target semester does not belong to the target season.', 400);
        }

        // --- 5. Core Logic to Determine All Possible Courses ---
        const passedCourseIds = new Set(
            student.registrations
                .filter(reg => reg.score && reg.score.point >= 1.0 && ![GradeLetter.F, GradeLetter.E].includes(reg.score.grade))
                .map(reg => reg.course.id)
        );

        const programCoursesForCurrentLevel = await prisma.programCourse.findMany({
            where: {
                programId: student.programId,
                levelId: student.currentLevel.id,
                isActive: true,
                course: { isActive: true, OR: [{ preferredSemesterType: targetSemester.type }, { preferredSemesterType: null }] }
            },
            include: { course: { select: courseDetailsForRegistrationSelection } }
        });

        let potentialCourses = programCoursesForCurrentLevel
            .filter(pc => !passedCourseIds.has(pc.course.id))
            .map(pc => ({
                ...pc.course,
                isElective: pc.isElective,
                programCourseId: pc.id,
                offeringReason: `Current Program Offering for ${student.currentLevel.name}`
            }));

        const studentFailedRegistrations = await prisma.studentCourseRegistration.findMany({
            where: {
                studentId: student.id,
                isScoreRecorded: true,
                score: { OR: [{ grade: GradeLetter.F }, { grade: GradeLetter.E }] },
                course: { isActive: true },
                NOT: { semesterId: pTargetSemesterId, seasonId: pTargetSeasonId }
            },
            include: { course: { select: courseDetailsForRegistrationSelection }, semester: { include: { season: true } } }
        });

        const failedCoursesToCarryOver = studentFailedRegistrations
            .filter(reg => {
                const coursePref = getPreferredSemesterTypeFromCourse(reg.course);
                return (coursePref === null || coursePref === targetSemester.type) && !passedCourseIds.has(reg.course.id);
            })
            .filter(reg => !potentialCourses.some(pc => pc.id === reg.course.id))
            .map(reg => ({
                ...reg.course,
                isElective: false,
                programCourseId: null,
                offeringReason: `Carryover from ${reg.semester.name} (${reg.semester.season.name})`
            }));

        potentialCourses.push(...failedCoursesToCarryOver);

        const uniqueCourseMap = new Map();
        potentialCourses.forEach(course => {
            if (!uniqueCourseMap.has(course.id)) uniqueCourseMap.set(course.id, course);
        });
        const finalPotentialCourses = Array.from(uniqueCourseMap.values());
        
        // --- THIS IS THE MAIN FIX ---
        
        // First, get the IDs of courses the student has already registered in this specific period.
        const currentRegistrationsInTarget = await prisma.studentCourseRegistration.findMany({
            where: {
                studentId: student.id,
                semesterId: pTargetSemesterId,
                seasonId: pTargetSeasonId,
            },
            select: { courseId: true }
        });
        const currentlyRegisteredCourseIds = new Set(currentRegistrationsInTarget.map(r => r.courseId));

        // Second, instead of filtering, MAP over the full list of potential courses.
        // For each course, add a new property `isRegistered`.
        const allCoursesWithStatus = finalPotentialCourses.map(course => ({
            ...course,
            isRegistered: currentlyRegisteredCourseIds.has(course.id) // This will be true or false
        }));

        // --- END OF THE MAIN FIX ---

        // Now, continue with prerequisite checks on the FULL list of courses.
        const coursesWithPrerequisiteStatus = [];
        for (const course of allCoursesWithStatus) { // Use the full list here
            const prerequisites = await prisma.coursePrerequisite.findMany({
                where: { courseId: course.id, prerequisite: { isActive: true } },
                include: { prerequisite: { select: { id: true, code: true, title: true } } }
            });

            let prerequisitesMet = true;
            const unmetPrerequisites = [];
            if (prerequisites.length > 0) {
                for (const prereqLink of prerequisites) {
                    if (!passedCourseIds.has(prereqLink.prerequisiteId)) {
                        prerequisitesMet = false;
                        unmetPrerequisites.push({ code: prereqLink.prerequisite.code, title: prereqLink.prerequisite.title });
                    }
                }
            }
            coursesWithPrerequisiteStatus.push({
                ...course, // This already contains the `isRegistered` flag
                prerequisitesMet,
                unmetPrerequisites,
                prerequisiteList: prerequisites.map(p => ({ id: p.prerequisiteId, code: p.prerequisite.code, title: p.prerequisite.title }))
            });
        }
        
        // Finally, the list to be returned contains ALL courses, each correctly flagged.
        const finalAvailableCourses = coursesWithPrerequisiteStatus;

        return {
            student: {
                id: student.id,
                name: student.name,
                regNo: student.regNo,
                jambRegNo: student.jambRegNo,
                email: student.email,
                level: student.currentLevel.name,
                program: student.program.name,
                department: student.department.name,
                departmentId: student.department.id,
                programId: student.program.id,
                levelId: student.currentLevel.id,
            },
            targetSeason: { id: pTargetSeasonId, name: targetSemester.season.name },
            targetSemester: { id: pTargetSemesterId, name: targetSemester.name, type: targetSemester.type },
            availableCourses: finalAvailableCourses, // This now returns the complete list
        };

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("[StudentAcademicsService] Error fetching registrable courses for admin:", error.message, error.stack);
        throw new AppError('Could not retrieve registrable courses for student.', 500);
    }
};
