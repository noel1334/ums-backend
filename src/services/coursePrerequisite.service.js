
import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';

const prerequisitePublicSelection = {
    id: true,
    course: { select: { id: true, code: true, title: true, isActive: true } },
    prerequisite: { select: { id: true, code: true, title: true, isActive: true } }
};
export const addCoursePrerequisite = async (prerequisiteData) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const { courseId, prerequisiteId } = prerequisiteData;

        if (!courseId || !prerequisiteId) {
            throw new AppError('Both course ID and prerequisite ID are required.', 400);
        }
        const pCourseId = parseInt(courseId, 10);
        const pPrerequisiteId = parseInt(prerequisiteId, 10);

        if (isNaN(pCourseId) || isNaN(pPrerequisiteId)) throw new AppError('Invalid ID format.', 400);
        if (pCourseId === pPrerequisiteId) throw new AppError('A course cannot be its own prerequisite.', 400);

        const [course, prerequisiteCourse] = await Promise.all([
            prisma.course.findUnique({ where: { id: pCourseId } }),
            prisma.course.findUnique({ where: { id: pPrerequisiteId } })
        ]);
        if (!course) throw new AppError(`Main course ID ${pCourseId} not found.`, 404);
        if (!prerequisiteCourse) throw new AppError(`Prerequisite course ID ${pPrerequisiteId} not found.`, 404);

        if (!course.isActive || !prerequisiteCourse.isActive) {
            throw new AppError('Cannot set prerequisite relationship with inactive courses.', 400);
        }

        const isCircular = await prisma.coursePrerequisite.findFirst({
            where: { courseId: pPrerequisiteId, prerequisiteId: pCourseId }
        });
        if (isCircular) throw new AppError('Circular prerequisite dependency detected.', 400);

        const newPrerequisite = await prisma.coursePrerequisite.create({
            data: { courseId: pCourseId, prerequisiteId: pPrerequisiteId },
            select: prerequisitePublicSelection
        });
        return newPrerequisite;
    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2002') throw new AppError('This prerequisite relationship already exists.', 409);
        console.error("Error adding course prerequisite:", error.message, error.stack);
        throw new AppError('Could not add course prerequisite.', 500);
    }
};

export const getAllCoursePrerequisites = async (query, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const { page = 1, limit = 20, courseCode, prerequisiteCode } = query;

        const where = {};
        const canSeeInactive = requestingUser.type === 'admin' || (requestingUser.type === 'ictstaff' && requestingUser.canManageCourses);

        // By default, for non-managers, only show relationships where both courses are active.
        if (!canSeeInactive) {
            where.AND = [
                { course: { isActive: true } },
                { prerequisite: { isActive: true } }
            ];
        }
        // Admins/managers can see all, or filter by specific course codes if provided

        if (courseCode) {
            where.course = { ...where.course, code: { contains: courseCode } };
        }
        if (prerequisiteCode) {
            where.prerequisite = { ...where.prerequisite, code: { contains: prerequisiteCode } };
        }

        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;

        const relationships = await prisma.coursePrerequisite.findMany({
            where,
            select: prerequisitePublicSelection,
            orderBy: [ // Example ordering
                { course: { code: 'asc' } },
                { prerequisite: { code: 'asc' } }
            ],
            skip,
            take: limitNum,
        });

        const totalRelationships = await prisma.coursePrerequisite.count({ where });

        return {
            relationships,
            totalPages: Math.ceil(totalRelationships / limitNum),
            currentPage: pageNum,
            totalRelationships
        };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching all course prerequisites:", error.message, error.stack);
        throw new AppError('Could not retrieve all course prerequisite relationships.', 500);
    }
};

export const getPrerequisitesForCourse = async (courseIdParam, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const courseId = parseInt(courseIdParam, 10);
        if (isNaN(courseId)) throw new AppError('Invalid course ID format.', 400);

        const canSeeInactive = requestingUser.type === 'admin' || (requestingUser.type === 'ictstaff' && requestingUser.canManageCourses);

        const prerequisites = await prisma.coursePrerequisite.findMany({
            where: {
                courseId: courseId,
                // Only show prerequisites that are themselves active, unless admin/manager
                ...(!canSeeInactive && { prerequisite: { isActive: true } })
            },
            select: {
                prerequisite: { select: { id: true, code: true, title: true, creditUnit: true, isActive: true } }
            }
        });
        return prerequisites.map(p => p.prerequisite);
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching prerequisites:", error.message, error.stack);
        throw new AppError('Could not retrieve prerequisites.', 500);
    }
};

export const getCoursesRequiringPrerequisite = async (prerequisiteIdParam, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const prerequisiteId = parseInt(prerequisiteIdParam, 10);
        if (isNaN(prerequisiteId)) throw new AppError('Invalid prerequisite ID format.', 400);

        const canSeeInactive = requestingUser.type === 'admin' || (requestingUser.type === 'ictstaff' && requestingUser.canManageCourses);

        const courses = await prisma.coursePrerequisite.findMany({
            where: {
                prerequisiteId: prerequisiteId,
                // Only show courses that are themselves active, unless admin/manager
                ...(!canSeeInactive && { course: { isActive: true } })
            },
            select: {
                course: { select: { id: true, code: true, title: true, creditUnit: true, isActive: true } }
            }
        });
        return courses.map(c => c.course);
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching courses requiring prerequisite:", error.message, error.stack);
        throw new AppError('Could not retrieve courses.', 500);
    }
};

export const removeCoursePrerequisite = async (courseIdParam, prerequisiteIdParam) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const courseId = parseInt(courseIdParam, 10);
        const prerequisiteId = parseInt(prerequisiteIdParam, 10);

        if (isNaN(courseId) || isNaN(prerequisiteId)) {
            throw new AppError('Invalid ID format for removing prerequisite.', 400);
        }

        const existing = await prisma.coursePrerequisite.findUnique({
            where: { courseId_prerequisiteId: { courseId, prerequisiteId } }
        });
        if (!existing) throw new AppError('Prerequisite relationship not found.', 404);

        await prisma.coursePrerequisite.delete({
            where: { courseId_prerequisiteId: { courseId, prerequisiteId } }
        });
        return { message: 'Course prerequisite removed successfully.' };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error removing course prerequisite:", error.message, error.stack);
        throw new AppError('Could not remove course prerequisite.', 500);
    }
};
export const deleteCourse = async (id) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const courseId = parseInt(id, 10);
        if (isNaN(courseId)) throw new AppError('Invalid course ID format.', 400);

        const course = await prisma.course.findUnique({
            where: { id: courseId },
            include: { // For pre-delete checks if relations are Restrict
                _count: {
                    select: {
                        programCourses: true,
                        staffCourses: true,
                        registrations: true
                    }
                }
            }
        });
        if (!course) throw new AppError('Course not found for deletion.', 404);

        // If relations ProgramCourse.courseId, StaffCourse.courseId, StudentCourseRegistration.courseId
        // are Restrict (default for required relations), these checks are essential.
        // If they are Cascade, these checks are informational before a wider delete.
        if (course._count.programCourses > 0) {
            throw new AppError(`Cannot delete course. It is mapped to ${course._count.programCourses} program(s). Remove mappings first or ensure cascade delete is set on ProgramCourse.`, 400);
        }
        if (course._count.staffCourses > 0) {
            throw new AppError(`Cannot delete course. It is assigned to ${course._count.staffCourses} staff. Unassign first or ensure cascade delete is set on StaffCourse.`, 400);
        }
        if (course._count.registrations > 0) {
            throw new AppError(`Cannot delete course. It has ${course._count.registrations} student registrations. Clear registrations first or ensure cascade delete is set on StudentCourseRegistration.`, 400);
        }

        // CoursePrerequisite has onDelete: Cascade, so they will be auto-deleted.
        await prisma.course.delete({
            where: { id: courseId },
        });

        return { message: `Course ID ${courseId} (${course.code}) and its prerequisite links permanently deleted.` };
    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2003') { // Foreign key constraint failed
            throw new AppError('Cannot delete course. It is still referenced by other records that do not cascade (e.g., ProgramCourse, StaffCourse, Student Registrations). Please resolve these dependencies first.', 400);
        }
        console.error("Error deleting course:", error.message, error.stack);
        throw new AppError('Could not delete course.', 500);
    }
};