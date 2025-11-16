
import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import { PaymentStatus, LecturerRole } from '../generated/prisma/index.js'; // ADJUST PATH IF NEEDED

export const getCoreCounts = async (requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);

        let studentWhere = { isActive: true, isGraduated: false };
        let lecturerWhere = { isActive: true };
        let courseWhere = { isActive: true };
        // Department count is usually global or faculty-specific for Dean

        if (requestingUser.type === 'lecturer') {
            if (requestingUser.role === LecturerRole.HOD && requestingUser.departmentId) {
                studentWhere.departmentId = requestingUser.departmentId;
                lecturerWhere.departmentId = requestingUser.departmentId;
                courseWhere.departmentId = requestingUser.departmentId; // Courses offered by the department
            } else if (requestingUser.role === LecturerRole.DEAN && requestingUser.department?.facultyId) {
                // Dean sees for their faculty. Assuming department on lecturer has facultyId or we fetch faculty separately.
                // This requires lecturer to have department with faculty info when authenticated.
                // For simplicity, let's assume department on req.user has faculty if Dean.
                // A more robust way is to get all departments for the Dean's faculty.
                const facultyDepartments = await prisma.department.findMany({
                    where: { facultyId: requestingUser.department.facultyId },
                    select: { id: true }
                });
                const departmentIdsInFaculty = facultyDepartments.map(d => d.id);
                if (departmentIdsInFaculty.length > 0) {
                    studentWhere.departmentId = { in: departmentIdsInFaculty };
                    lecturerWhere.departmentId = { in: departmentIdsInFaculty };
                    courseWhere.departmentId = { in: departmentIdsInFaculty };
                } else { // Dean of a faculty with no departments? Return 0s for scoped counts.
                    studentWhere.id = -1; // No match
                    lecturerWhere.id = -1;
                    courseWhere.id = -1;
                }
            } else {
                // Regular lecturer might not have access to these global counts
                throw new AppError("Unauthorized to view these aggregate counts.", 403);
            }
        } else if (requestingUser.type !== 'admin' && !(requestingUser.type === 'ictstaff' && requestingUser.canViewAnalytics)) {
            throw new AppError("Unauthorized to view these aggregate counts.", 403);
        }


        const [
            totalStudents,
            activeCourses,
            totalLecturers,
            totalDepartments
        ] = await prisma.$transaction([
            prisma.student.count({ where: studentWhere }),
            prisma.course.count({ where: courseWhere }),
            prisma.lecturer.count({ where: lecturerWhere }),
            prisma.department.count({}) // Total departments is usually a global count
        ]);

        return {
            totalStudents,
            activeCourses,
            totalLecturers,
            totalDepartments,
            scope: requestingUser.type === 'admin' || (requestingUser.type === 'ictstaff' && requestingUser.canViewAnalytics) ? 'Global' :
                requestingUser.role === LecturerRole.HOD ? `Department: ${requestingUser.department?.name}` :
                    requestingUser.role === LecturerRole.DEAN ? `Faculty (contextual)` : 'Unknown Scope'
        };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching core counts:", error.message, error.stack);
        throw new AppError('Could not retrieve core counts.', 500);
    }
};

export const getFeeComplianceRate = async (query, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const { seasonId } = query; // Mandatory: for which season?
        let departmentId = query.departmentId; // Optional filter

        if (!seasonId) throw new AppError('Season ID is required for fee compliance rate.', 400);
        const pSeasonId = parseInt(seasonId, 10);
        if (isNaN(pSeasonId)) throw new AppError('Invalid Season ID.', 400);

        const studentFilter = { isActive: true, isGraduated: false };

        if (requestingUser.type === 'lecturer' && requestingUser.role === LecturerRole.HOD) {
            if (!requestingUser.departmentId) throw new AppError('HOD department info missing.', 500);
            // HOD can only see compliance for their department
            if (departmentId && parseInt(departmentId, 10) !== requestingUser.departmentId) {
                throw new AppError("HODs can only view fee compliance for their own department.", 403);
            }
            studentFilter.departmentId = requestingUser.departmentId;
        } else if (requestingUser.type === 'admin' || (requestingUser.type === 'ictstaff' && requestingUser.canViewAnalytics)) {
            if (departmentId) studentFilter.departmentId = parseInt(departmentId, 10);
        } else {
            throw new AppError("Unauthorized to view fee compliance rate.", 403);
        }


        // Students who have a fee record for the season
        const studentsWithFees = await prisma.schoolFee.groupBy({
            by: ['studentId'],
            where: {
                seasonId: pSeasonId,
                student: studentFilter // Apply student active/graduated/department filters
            },
            _count: { studentId: true }
        });
        const totalStudentsBilled = studentsWithFees.length;

        if (totalStudentsBilled === 0) return { complianceRate: 0, totalStudentsBilled: 0, studentsPaid: 0, scope: studentFilter.departmentId ? `Department ${studentFilter.departmentId}` : 'Global/Filtered' };

        // Students who have paid their fees for the season
        // This assumes that if ANY SchoolFee record for that student in that season is PAID, they are compliant.
        // Or, if ALL SchoolFee records for that student in that season are PAID. Let's assume ALL.
        const studentsPaidCount = await prisma.student.count({
            where: {
                ...studentFilter, // Apply same student filters
                schoolFees: {
                    every: { // All their fees for the season must be paid or waived
                        seasonId: pSeasonId,
                        OR: [
                            { paymentStatus: PaymentStatus.PAID },
                            { paymentStatus: PaymentStatus.WAIVED }
                        ]
                    },
                    some: { // And they must have at least one fee record for the season
                        seasonId: pSeasonId
                    }
                }
            }
        });

        const complianceRate = totalStudentsBilled > 0 ? (studentsPaidCount / totalStudentsBilled) * 100 : 0;

        return {
            complianceRate: parseFloat(complianceRate.toFixed(2)),
            totalStudentsBilled,
            studentsPaid: studentsPaidCount,
            seasonId: pSeasonId,
            scope: studentFilter.departmentId ? `Department ${studentFilter.departmentId}` : 'Global/Filtered'
        };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching fee compliance rate:", error.message, error.stack);
        throw new AppError('Could not retrieve fee compliance rate.', 500);
    }
};

export const getAverageGPA = async (query, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const { seasonId, semesterId, departmentId, programId, levelId } = query;
        // Season and Semester are usually good for context of GPA

        const whereClause = {
            gpa: { not: null }, // Only consider results with a calculated GPA
            student: { isActive: true, isGraduated: false } // For active, non-graduated students
        };

        if (requestingUser.type === 'lecturer' && requestingUser.role === LecturerRole.HOD) {
            if (!requestingUser.departmentId) throw new AppError('HOD department info missing.', 500);
            if (departmentId && parseInt(departmentId, 10) !== requestingUser.departmentId) {
                throw new AppError("HODs can only view average GPA for their own department.", 403);
            }
            whereClause.departmentId = requestingUser.departmentId;
        } else if (requestingUser.type === 'admin' || (requestingUser.type === 'ictstaff' && requestingUser.canViewAnalytics)) {
            if (departmentId) whereClause.departmentId = parseInt(departmentId, 10);
        } else {
            throw new AppError("Unauthorized to view average GPA.", 403);
        }

        if (seasonId) whereClause.seasonId = parseInt(seasonId, 10);
        if (semesterId) whereClause.semesterId = parseInt(semesterId, 10);
        if (programId) whereClause.programId = parseInt(programId, 10);
        if (levelId) where.levelId = parseInt(levelId, 10);


        const resultAggregation = await prisma.result.aggregate({
            _avg: { gpa: true },
            _count: { id: true },
            where: whereClause,
        });

        return {
            averageGPA: resultAggregation._avg.gpa ? parseFloat(resultAggregation._avg.gpa.toFixed(2)) : 0,
            numberOfResultsConsidered: resultAggregation._count.id,
            filters: { seasonId, semesterId, departmentId: whereClause.departmentId, programId, levelId },
            scope: whereClause.departmentId ? `Department ${whereClause.departmentId}` : 'Global/Filtered'
        };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching average GPA:", error.message, error.stack);
        throw new AppError('Could not retrieve average GPA.', 500);
    }
};

export const getCourseRegistrationCompletionPercentage = async (query, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const { seasonId, semesterId, departmentId, programId, levelId } = query;

        if (!seasonId || !semesterId) {
            throw new AppError('Season ID and Semester ID are required.', 400);
        }
        const pSeasonId = parseInt(seasonId, 10);
        const pSemesterId = parseInt(semesterId, 10);
        if (isNaN(pSeasonId) || isNaN(pSemesterId)) throw new AppError('Invalid Season/Semester ID.', 400);

        const studentWhere = { isActive: true, isGraduated: false };

        if (requestingUser.type === 'lecturer' && requestingUser.role === LecturerRole.HOD) {
            if (!requestingUser.departmentId) throw new AppError('HOD department info missing.', 500);
            if (departmentId && parseInt(departmentId, 10) !== requestingUser.departmentId) {
                throw new AppError("HODs can only view registration stats for their own department.", 403);
            }
            studentWhere.departmentId = requestingUser.departmentId;
        } else if (requestingUser.type === 'admin' || (requestingUser.type === 'ictstaff' && requestingUser.canViewAnalytics)) {
            if (departmentId) studentWhere.departmentId = parseInt(departmentId, 10);
        } else {
            throw new AppError("Unauthorized to view registration completion.", 403);
        }

        if (programId) studentWhere.programId = parseInt(programId, 10);
        if (levelId) studentWhere.levelId = parseInt(levelId, 10);

        const totalEligibleStudents = await prisma.student.count({ where: studentWhere });
        if (totalEligibleStudents === 0) {
            return { registrationPercentage: 0, totalEligibleStudents: 0, studentsRegistered: 0, scope: studentWhere.departmentId ? `Department ${studentWhere.departmentId}` : 'Global/Filtered' };
        }

        // Students who have at least one registration for the target season/semester
        const studentsRegisteredCount = await prisma.student.count({
            where: {
                ...studentWhere,
                registrations: {
                    some: {
                        seasonId: pSeasonId,
                        semesterId: pSemesterId,
                    }
                }
            }
        });

        const registrationPercentage = totalEligibleStudents > 0 ? (studentsRegisteredCount / totalEligibleStudents) * 100 : 0;

        return {
            registrationPercentage: parseFloat(registrationPercentage.toFixed(2)),
            totalEligibleStudents,
            studentsRegistered: studentsRegisteredCount,
            filters: { seasonId, semesterId, departmentId: studentWhere.departmentId, programId, levelId },
            scope: studentWhere.departmentId ? `Department ${studentWhere.departmentId}` : 'Global/Filtered'
        };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching registration completion:", error.message, error.stack);
        throw new AppError('Could not retrieve registration completion.', 500);
    }
};

export const getResultsProcessedPercentage = async (query, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const { seasonId, semesterId, departmentId, programId, levelId } = query;

        if (!seasonId || !semesterId) {
            throw new AppError('Season ID and Semester ID are required.', 400);
        }
        const pSeasonId = parseInt(seasonId, 10);
        const pSemesterId = parseInt(semesterId, 10);
        if (isNaN(pSeasonId) || isNaN(pSemesterId)) throw new AppError('Invalid Season/Semester ID.', 400);

        const registrationWhere = {
            seasonId: pSeasonId,
            semesterId: pSemesterId,
        };

        if (requestingUser.type === 'lecturer' && requestingUser.role === LecturerRole.HOD) {
            if (!requestingUser.departmentId) throw new AppError('HOD department info missing.', 500);
            if (departmentId && parseInt(departmentId, 10) !== requestingUser.departmentId) {
                throw new AppError("HODs can only view results processing for their own department.", 403);
            }
            registrationWhere.student = { departmentId: requestingUser.departmentId };
        } else if (requestingUser.type === 'admin' || (requestingUser.type === 'ictstaff' && requestingUser.canViewAnalytics)) {
            if (departmentId) registrationWhere.student = { ...registrationWhere.student, departmentId: parseInt(departmentId, 10) };
        } else {
            throw new AppError("Unauthorized to view results processing status.", 403);
        }

        if (programId) registrationWhere.student = { ...registrationWhere.student, programId: parseInt(programId, 10) };
        if (levelId) registrationWhere.levelId = parseInt(levelId, 10); // Filter registrations by level

        const totalRegistrations = await prisma.studentCourseRegistration.count({
            where: registrationWhere
        });

        if (totalRegistrations === 0) {
            return { resultsProcessedPercentage: 0, totalCourseRegistrations: 0, registrationsWithFinalScore: 0, scope: registrationWhere.student?.departmentId ? `Department ${registrationWhere.student.departmentId}` : 'Global/Filtered' };
        }

        const registrationsWithFinalScore = await prisma.studentCourseRegistration.count({
            where: {
                ...registrationWhere,
                isScoreRecorded: true,
                score: {
                    isAcceptedByHOD: true, // Assuming HOD acceptance is the final step for "processed"
                    // isApprovedByExaminer: true, // Could also be a condition
                }
            }
        });

        const resultsProcessedPercentage = totalRegistrations > 0 ? (registrationsWithFinalScore / totalRegistrations) * 100 : 0;

        return {
            resultsProcessedPercentage: parseFloat(resultsProcessedPercentage.toFixed(2)),
            totalCourseRegistrations: totalRegistrations,
            registrationsWithFinalScore,
            filters: { seasonId, semesterId, departmentId: registrationWhere.student?.departmentId, programId, levelId },
            scope: registrationWhere.student?.departmentId ? `Department ${registrationWhere.student.departmentId}` : 'Global/Filtered'
        };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching results processed percentage:", error.message, error.stack);
        throw new AppError('Could not retrieve results processed percentage.', 500);
    }
};