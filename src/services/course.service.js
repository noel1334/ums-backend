import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import { CourseType, SemesterType } from '../generated/prisma/index.js'; 

// --- Selection Objects ---
const coursePublicSelection = {
    id: true,
    code: true,
    title: true,
    creditUnit: true,
    preferredSemesterType: true,
    departmentId: true,
    courseType: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
    department: { select: { id: true, name: true, facultyId: true } }, // Ensure facultyId is selected for frontend Edit form
    prerequisites: {
        where: { prerequisite: { isActive: true } },
        select: { prerequisite: { select: { id: true, code: true, title: true, isActive: true } } }
    },
    isPrerequisiteFor: {
        where: { course: { isActive: true } },
        select: { course: { select: { id: true, code: true, title: true, isActive: true } } }
    },
    _count: {
        select: { programCourses: true, staffCourses: true, registrations: true }
    }
};

const courseAdminSelection = {
    ...coursePublicSelection, 
    prerequisites: {
        select: { prerequisite: { select: { id: true, code: true, title: true, isActive: true } } }
    },
    isPrerequisiteFor: {
        select: { course: { select: { id: true, code: true, title: true, isActive: true } } }
    }
};




export const createCourse = async (courseData) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);

        const {
            code,
            title,
            creditUnit,
            departmentId,
            preferredSemesterType, // CHANGED from semesterId
            courseType,
            isActive
        } = courseData;

        // Validate required fields
        if (!code || !title || creditUnit === undefined || !departmentId) {
            throw new AppError('Code, title, credit unit, and department ID are required.', 400);
        }

        // Validate enums
        if (courseType && !Object.values(CourseType).includes(courseType)) {
            throw new AppError(`Invalid course type: '${courseType}'.`, 400);
        }
        if (preferredSemesterType && preferredSemesterType !== null && preferredSemesterType !== "" && !Object.values(SemesterType).includes(preferredSemesterType)) {
            throw new AppError(`Invalid preferred semester type: '${preferredSemesterType}'.`, 400);
        }

        // Parse and validate numeric inputs
        const pCreditUnit = parseInt(String(creditUnit), 10); // Ensure string conversion before parseInt
        if (isNaN(pCreditUnit) || pCreditUnit <= 0) {
            throw new AppError('Credit unit must be a positive integer.', 400);
        }
        const pDepartmentId = parseInt(String(departmentId), 10);
        if (isNaN(pDepartmentId)) {
            throw new AppError('Invalid department ID format.', 400);
        }

        // Check existence of related department
        const departmentExists = await prisma.department.findUnique({ where: { id: pDepartmentId } });
        if (!departmentExists) {
            throw new AppError(`Department with ID ${pDepartmentId} not found.`, 404);
        }

        // No longer need to check for Semester existence for this field

        const dataToCreate = {
            code,
            title,
            creditUnit: pCreditUnit,
            departmentId: pDepartmentId,
            preferredSemesterType: (preferredSemesterType === "" || preferredSemesterType === undefined) ? null : preferredSemesterType,
            courseType: courseType || CourseType.CORE, // Default if not provided
            isActive: isActive === undefined ? true : Boolean(isActive), // Default if not provided
        };

        const newCourse = await prisma.course.create({
            data: dataToCreate,
            select: courseAdminSelection
        });
        return newCourse;

    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2002' && error.meta?.target?.includes('code')) {
            throw new AppError('A course with this code already exists.', 409);
        }
        console.error("Error creating course:", error.message, error.stack);
        throw new AppError('Could not create course due to an internal server error.', 500);
    }
};

export const getCourseById = async (id, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const courseId = parseInt(id, 10);
        if (isNaN(courseId)) {
            throw new AppError('Invalid course ID format.', 400);
        }

        // Determine selection based on user role/permissions
        const selection = (requestingUser?.type === 'admin' || (requestingUser?.type === 'ictstaff' && requestingUser?.canManageCourses))
            ? courseAdminSelection
            : coursePublicSelection;

        const course = await prisma.course.findUnique({
            where: { id: courseId },
            select: selection
        });

        if (!course) {
            throw new AppError('Course not found.', 404);
        }

        // For non-privileged users, hide inactive courses
        if (selection === coursePublicSelection && !course.isActive) {
            throw new AppError('Course not found or is inactive.', 404);
        }
        return course;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching course by ID:", error.message, error.stack);
        throw new AppError('Could not retrieve course details.', 500);
    }
};

export const getAllCourses = async (query, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);

        const {
            facultyId, // NEW: Filter by facultyId
            departmentId,
            programId, // NEW: Filter by programId
            levelId, // NEW: Filter by levelId
            preferredSemesterType,
            courseType,
            search,
            isActive: queryIsActive,
            page = 1,
            limit = 10,
        } = query;

        const where = {};
        const filters = []; // Use an array for filters for more complex AND conditions

        // Authorization for seeing inactive courses
        const canSeeInactive = requestingUser?.type === 'admin' || (requestingUser?.type === 'ictstaff' && requestingUser?.canManageCourses);
        if (canSeeInactive) {
            if (queryIsActive !== undefined && queryIsActive !== "") {
                filters.push({ isActive: queryIsActive === 'true' });
            }
        } else {
            filters.push({ isActive: true }); // Default for others to see only active
        }

        // --- Apply Filters ---

        // 1. Faculty filter
        if (facultyId && facultyId !== 'all') {
            filters.push({
                department: {
                    facultyId: parseInt(facultyId, 10)
                }
            });
        }

        // 2. Department filter
        if (departmentId && departmentId !== 'all') {
            filters.push({ departmentId: parseInt(departmentId, 10) });
        }

        // 3. Program filter
        // This requires joining through ProgramCourse. Adjust based on your schema.
        // Assuming Course has a `programCourses` relation to `ProgramCourse`
        if (programId && programId !== 'all') {
            filters.push({
                programCourses: { // This is the relation name on your Course model
                    some: {
                        programId: parseInt(programId, 10)
                    }
                }
            });
        }

        // 4. Level filter
        // This requires joining through ProgramCourse. Adjust based on your schema.
        // Assuming ProgramCourse has a `levelId` field and Course has a `programCourses` relation
        if (levelId && levelId !== 'all') {
            filters.push({
                programCourses: { // This is the relation name on your Course model
                    some: {
                        levelId: parseInt(levelId, 10) // Assuming ProgramCourse has a direct levelId
                    }
                }
            });
        }

        // 5. Preferred Semester Type filter
        if (preferredSemesterType !== undefined && preferredSemesterType !== 'all') {
            if (preferredSemesterType === 'null') { // Frontend sends "null" string for null preference
                filters.push({ preferredSemesterType: null });
            } else if (Object.values(SemesterType).includes(preferredSemesterType)) {
                filters.push({ preferredSemesterType: preferredSemesterType });
            } else {
                console.warn(`[CourseService] Invalid preferredSemesterType received: ${preferredSemesterType}`);
            }
        }

        // 6. Course Type filter
        if (courseType && courseType !== 'all' && Object.values(CourseType).includes(courseType)) {
            filters.push({ courseType: courseType });
        }

        // 7. Search filter (for code or title)
        if (search && String(search).trim() !== "") {
            const searchTerm = String(search).trim();
            filters.push({
                OR: [
                    { code: { contains: searchTerm } }, // REMOVED: mode: 'insensitive'
                    { title: { contains: searchTerm } } // REMOVED: mode: 'insensitive'
                ]
            });
        }
        
        // Combine all filters with AND
        if (filters.length > 0) {
            where.AND = filters;
        }

        const pageNum = parseInt(String(page), 10);
        const limitNum = parseInt(String(limit), 10);
        const skip = (pageNum - 1) * limitNum;

        const selection = canSeeInactive ? courseAdminSelection : coursePublicSelection;

        const courses = await prisma.course.findMany({
            where,
            select: selection,
            orderBy: { code: 'asc' },
            skip,
            take: limitNum
        });
        const totalCourses = await prisma.course.count({ where });

        return {
            courses,
            totalPages: Math.ceil(totalCourses / limitNum),
            currentPage: pageNum,
            totalCourses
        };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching courses:", error.message, error.stack);
        throw new AppError('Could not retrieve course list.', 500);
    }
};

export const updateCourse = async (id, updateData, requestingUser) => { // Added requestingUser for auth if needed
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const courseId = parseInt(id, 10);
        if (isNaN(courseId)) {
            throw new AppError('Invalid course ID format.', 400);
        }

        const courseToUpdate = await prisma.course.findUnique({ where: { id: courseId } });
        if (!courseToUpdate) {
            throw new AppError('Course not found for update.', 404);
        }

        // Add authorization check here if not all admins/managers can update all courses
        // if (!await canUserManageCourse(requestingUser, courseId)) { // Example
        //     throw new AppError('You are not authorized to update this course.', 403);
        // }

        const dataForDb = {};
        const {
            code, title, creditUnit, departmentId,
            preferredSemesterType, // CHANGED from semesterId
            courseType, isActive
        } = updateData;

        if (code !== undefined) {
            if (String(code).trim() !== courseToUpdate.code) {
                const existing = await prisma.course.findFirst({ where: { code: String(code).trim(), id: { not: courseId } } });
                if (existing) throw new AppError('Another course with this code already exists.', 409);
            }
            dataForDb.code = String(code).trim();
        }
        if (title !== undefined) dataForDb.title = String(title).trim();
        if (creditUnit !== undefined) {
            const pCreditUnit = parseInt(String(creditUnit), 10);
            if (isNaN(pCreditUnit) || pCreditUnit <= 0) throw new AppError('Credit unit must be a positive integer.', 400);
            dataForDb.creditUnit = pCreditUnit;
        }
        if (departmentId !== undefined) {
            const pDepartmentId = parseInt(String(departmentId), 10);
            if (isNaN(pDepartmentId)) throw new AppError('Invalid department ID for update.', 400);
            const dept = await prisma.department.findUnique({ where: { id: pDepartmentId } });
            if (!dept) throw new AppError(`Department with ID ${pDepartmentId} not found.`, 404);
            dataForDb.departmentId = pDepartmentId;
        }

        // Handle preferredSemesterType update
        if (updateData.hasOwnProperty('preferredSemesterType')) { // Check if key exists, even if value is null/empty
            const newPreferredSemesterType = updateData.preferredSemesterType;
            if (newPreferredSemesterType && newPreferredSemesterType !== "" && !Object.values(SemesterType).includes(newPreferredSemesterType)) {
                throw new AppError(`Invalid preferred semester type: '${newPreferredSemesterType}'.`, 400);
            }
            dataForDb.preferredSemesterType = (newPreferredSemesterType === "" || newPreferredSemesterType === null) ? null : newPreferredSemesterType;
        }

        if (courseType !== undefined) {
            if (!Object.values(CourseType).includes(courseType)) throw new AppError('Invalid course type.', 400);
            dataForDb.courseType = courseType;
        }
        if (isActive !== undefined) {
            dataForDb.isActive = Boolean(isActive);
        }

        if (Object.keys(dataForDb).length === 0) {
            throw new AppError('No valid fields provided for update.', 400);
        }

        const updatedCourse = await prisma.course.update({
            where: { id: courseId },
            data: dataForDb,
            select: courseAdminSelection
        });
        return updatedCourse;
    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2002' && error.meta?.target?.includes('code')) {
            throw new AppError('Update failed: A course with this code already exists.', 409);
        }
        console.error("Error updating course:", error.message, error.stack);
        throw new AppError('Could not update course.', 500);
    }
};

export const setCourseActiveStatus = async (id, desiredStatus) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const courseId = parseInt(id, 10);
        if (isNaN(courseId)) throw new AppError('Invalid course ID provided.', 400);
        if (typeof desiredStatus !== 'boolean') throw new AppError('Invalid isActive status provided.', 400);

        const courseToUpdate = await prisma.course.findUnique({
            where: { id: courseId }, select: { code: true }
        });
        if (!courseToUpdate) throw new AppError(`Course with ID ${courseId} not found.`, 404);

        await prisma.$transaction(async (tx) => {
            await tx.course.update({
                where: { id: courseId },
                data: { isActive: desiredStatus },
            });
            // Synchronize ProgramCourse.isActive status
            await tx.programCourse.updateMany({
                where: { courseId: courseId },
                data: { isActive: desiredStatus },
            });
        });

        const actionMessage = desiredStatus ? 'activated' : 'deactivated';
        const programCourseSyncMessage = `All associated program course mappings have also been ${actionMessage}.`;
        return {
            message: `Course '${courseToUpdate.code}' has been successfully ${actionMessage}. ${programCourseSyncMessage}`,
            newStatus: desiredStatus,
        };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error(`Error in setCourseActiveStatus for course ID ${id}:`, error.message, error.stack);
        throw new AppError('Could not set course active status.', 500);
    }
};

export const deleteCourse = async (id) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const courseId = parseInt(id, 10);
        if (isNaN(courseId)) throw new AppError('Invalid course ID format.', 400);

        const course = await prisma.course.findUnique({
            where: { id: courseId },
            include: { _count: { select: { programCourses: true, staffCourses: true, registrations: true } } }
        });
        if (!course) throw new AppError('Course not found for deletion.', 404);

        if (course._count.programCourses > 0) throw new AppError(`Cannot delete. Course mapped to ${course._count.programCourses} program(s).`, 400);
        if (course._count.staffCourses > 0) throw new AppError(`Cannot delete. Course assigned to ${course._count.staffCourses} staff.`, 400);
        if (course._count.registrations > 0) throw new AppError(`Cannot delete. Course has ${course._count.registrations} student registrations.`, 400);

        // CoursePrerequisite records linked to this course will be cascade deleted
        // due to onDelete: Cascade in the CoursePrerequisite model.

        await prisma.course.delete({ where: { id: courseId } });
        return { message: `Course '${course.code}' (ID: ${courseId}) and its prerequisite links permanently deleted.` };
    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2003') { // Foreign key constraint failed
            throw new AppError('Cannot delete course. It is still referenced by other records (e.g., exams). Resolve dependencies first.', 400);
        }
        console.error("Error deleting course:", error.message, error.stack);
        throw new AppError('Could not delete course.', 500);
    }
};