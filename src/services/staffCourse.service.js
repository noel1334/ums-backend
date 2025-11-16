
import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import { LecturerRole } from '../generated/prisma/index.js'; // ADJUST PATH IF NEEDED


const staffCoursePublicSelection = {
    id: true, createdAt: true, updatedAt: true,
    lecturer: { select: { id: true, name: true, staffId: true, department: { select: { id: true, name: true } } } },
    course: { select: { id: true, code: true, title: true, departmentId: true } },
    semester: { select: { id: true, name: true, type: true } },
    season: { select: { id: true, name: true } }
};


export const assignCourseToLecturer = async (assignmentData, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const { lecturerId, courseId, semesterId, seasonId } = assignmentData;

        if (!lecturerId || !courseId || !semesterId || !seasonId) {
            throw new AppError('Lecturer, Course, Semester, and Season IDs are required.', 400);
        }
        const pLecturerId = parseInt(lecturerId, 10);
        const pCourseId = parseInt(courseId, 10);
        const pSemesterId = parseInt(semesterId, 10);
        const pSeasonId = parseInt(seasonId, 10);

        if (isNaN(pLecturerId) || isNaN(pCourseId) || isNaN(pSemesterId) || isNaN(pSeasonId)) {
            throw new AppError('Invalid ID format for assignment.', 400);
        }

        const [lecturer, course, semester, season] = await Promise.all([
            prisma.lecturer.findUnique({ where: { id: pLecturerId } }),
            prisma.course.findUnique({ where: { id: pCourseId } }),
            prisma.semester.findUnique({ where: { id: pSemesterId } }),
            prisma.season.findUnique({ where: { id: pSeasonId } })
        ]);

        if (!lecturer) throw new AppError(`Lecturer ID ${pLecturerId} not found.`, 404);
        if (!course) throw new AppError(`Course ID ${pCourseId} not found.`, 404);
        if (!semester) throw new AppError(`Semester ID ${pSemesterId} not found.`, 404);
        if (!season) throw new AppError(`Season ID ${pSeasonId} not found.`, 404);

        // Authorization
        if (requestingUser.type !== 'admin') {
            if (requestingUser.type === 'lecturer' && requestingUser.role === LecturerRole.HOD) {
                if (lecturer.departmentId !== requestingUser.departmentId) {
                    throw new AppError("HOD can only assign courses to lecturers in their own department.", 403);
                }
                // Optional: Check if the course belongs to the HOD's department too
                if (course.departmentId !== requestingUser.departmentId) {
                    // This might be too restrictive if HODs assign general/faculty courses. Adjust if needed.
                    // console.warn(`HOD (Dept ${requestingUser.departmentId}) assigning course (Dept ${course.departmentId}) from different department.`);
                }
            } else {
                throw new AppError('You are not authorized to assign courses.', 403);
            }
        }

        const newAssignment = await prisma.staffCourse.create({
            data: { lecturerId: pLecturerId, courseId: pCourseId, semesterId: pSemesterId, seasonId: pSeasonId },
            select: staffCoursePublicSelection
        });
        return newAssignment;
    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2002') {
            throw new AppError('This lecturer is already assigned to this course for the specified semester and season.', 409);
        }
        console.error("Error assigning course:", error.message, error.stack);
        throw new AppError('Could not assign course.', 500);
    }
};

export const getStaffCourseAssignmentById = async (id) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const assignmentId = parseInt(id, 10);
        if (isNaN(assignmentId)) throw new AppError('Invalid assignment ID format', 400);

        const assignment = await prisma.staffCourse.findUnique({
            where: { id: assignmentId },
            select: staffCoursePublicSelection
        });
        if (!assignment) throw new AppError('Staff course assignment not found.', 404);
        return assignment;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching assignment by ID:", error.message, error.stack);
        throw new AppError('Could not retrieve assignment.', 500);
    }
};

export const getAllStaffCourseAssignments = async (query, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const { lecturerId, courseId, semesterId, seasonId, departmentId, page = 1, limit = 10 } = query;
        const where = {};

        if (requestingUser.type === 'admin') {
            if (lecturerId) where.lecturerId = parseInt(lecturerId, 10);
            if (departmentId) where.lecturer = { departmentId: parseInt(departmentId, 10) }; // Filter by lecturer's department
        } else if (requestingUser.type === 'lecturer' && requestingUser.role === LecturerRole.HOD) {
            if (!requestingUser.departmentId) throw new AppError('HOD department info missing.', 500);
            where.lecturer = { departmentId: requestingUser.departmentId };
            if (lecturerId && parseInt(lecturerId, 10) !== requestingUser.id) { // HOD can filter by specific lecturer in their dept
                where.lecturerId = parseInt(lecturerId, 10);
            } else if (lecturerId && parseInt(lecturerId, 10) === requestingUser.id) { // HOD looking at their own
                where.lecturerId = requestingUser.id;
            }
            // If lecturerId is not provided by HOD, they see all for their department.
        } else if (requestingUser.type === 'lecturer') { // Regular lecturer
            where.lecturerId = requestingUser.id;
        } else {
            throw new AppError('You are not authorized to view these assignments.', 403);
        }

        if (courseId) where.courseId = parseInt(courseId, 10);
        if (semesterId) where.semesterId = parseInt(semesterId, 10);
        if (seasonId) where.seasonId = parseInt(seasonId, 10);

        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;

        const assignments = await prisma.staffCourse.findMany({
            where,
            select: staffCoursePublicSelection,
            orderBy: { createdAt: 'desc' },
            skip, take: limitNum
        });
        const totalAssignments = await prisma.staffCourse.count({ where });
        return { assignments, totalPages: Math.ceil(totalAssignments / limitNum), currentPage: pageNum, totalAssignments };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching assignments:", error.message, error.stack);
        throw new AppError('Could not retrieve assignments.', 500);
    }
};

export const getLecturerAssignedCourses = async (lecturerId, seasonId, semesterId) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);

        const pLecturerId = parseInt(lecturerId, 10);
        const pSeasonId = parseInt(seasonId, 10);
        const pSemesterId = parseInt(semesterId, 10);

        if (isNaN(pLecturerId) || isNaN(pSeasonId) || isNaN(pSemesterId)) {
            throw new AppError('Invalid ID format for lecturer, season, or semester.', 400);
        }

        const assignedCourses = await prisma.staffCourse.findMany({
            where: {
                lecturerId: pLecturerId,
                seasonId: pSeasonId,
                semesterId: pSemesterId,
            },
            select: staffCoursePublicSelection,
            orderBy: { course: { title: 'asc' } }, // Order by course title
        });

        // No need for explicit authorization here; the route will ensure only the lecturer's own ID is passed,
        // or an admin/HOD specifically querying for another lecturer will use a different endpoint.

        return {
            assignedCourses,
            totalAssignedCourses: assignedCourses.length,
        };

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching lecturer's assigned courses:", error.message, error.stack);
        throw new AppError('Could not retrieve assigned courses for lecturer.', 500);
    }
};
export const updateStaffCourseAssignment = async (id, updateData, requestingUser) => {
    // Updates to StaffCourse are tricky. Usually, if core IDs (lecturer, course, sem, season) change,
    // it implies a new assignment. This function might be limited or not used often.
    // For this example, let's assume it's not for changing the core IDs.
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const assignmentId = parseInt(id, 10);
        if (isNaN(assignmentId)) throw new AppError('Invalid assignment ID format', 400);

        const existingAssignment = await prisma.staffCourse.findUnique({
            where: { id: assignmentId },
            include: { lecturer: true } // For HOD department check
        });
        if (!existingAssignment) throw new AppError('Assignment not found.', 404);

        // Authorization (Admin or HOD of the assigned lecturer's department)
        if (requestingUser.type !== 'admin') {
            if (requestingUser.type === 'lecturer' && requestingUser.role === LecturerRole.HOD) {
                if (existingAssignment.lecturer.departmentId !== requestingUser.departmentId) {
                    throw new AppError("HOD can only update assignments for lecturers in their department.", 403);
                }
            } else {
                throw new AppError('You are not authorized to update this assignment.', 403);
            }
        }

        // What can be updated? For now, let's assume no fields are typically updated here.
        // If StaffCourse had, e.g., a 'notes' field:
        // const dataToUpdate = {};
        // if (updateData.notes) dataToUpdate.notes = updateData.notes;
        // if (Object.keys(dataToUpdate).length === 0) throw new AppError('No updatable fields provided.', 400);
        // const updatedAssignment = await prisma.staffCourse.update({
        //     where: { id: assignmentId }, data: dataToUpdate, select: staffCoursePublicSelection
        // });
        // return updatedAssignment;
        throw new AppError('Updating core details of an assignment is not supported. Delete and re-assign if needed.', 400);

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error updating assignment:", error.message, error.stack);
        throw new AppError('Could not update assignment.', 500);
    }
};

export const removeCourseAssignment = async (id, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const assignmentId = parseInt(id, 10);
        if (isNaN(assignmentId)) throw new AppError('Invalid assignment ID format', 400);

        const assignment = await prisma.staffCourse.findUnique({
            where: { id: assignmentId },
            include: { lecturer: true }
        });
        if (!assignment) throw new AppError('Assignment not found.', 404);

        if (requestingUser.type !== 'admin') {
            if (requestingUser.type === 'lecturer' && requestingUser.role === LecturerRole.HOD) {
                if (assignment.lecturer.departmentId !== requestingUser.departmentId) {
                    throw new AppError("HOD can only remove assignments for lecturers in their department.", 403);
                }
            } else {
                throw new AppError('You are not authorized to remove this assignment.', 403);
            }
        }

        await prisma.staffCourse.delete({ where: { id: assignmentId } });
        return { message: 'Course assignment removed successfully.' };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error removing assignment:", error.message, error.stack);
        throw new AppError('Could not remove assignment.', 500);
    }
};