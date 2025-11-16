import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';

const programCoursePublicSelection = {
    id: true, isElective: true, isActive: true,
    createdAt: true, updatedAt: true,
    program: { select: { id: true, name: true, programCode: true } },
    course: { select: { id: true, code: true, title: true, isActive: true } }, // Include course.isActive
    level: { select: { id: true, name: true } }
};
const programCourseAdminSelection = { ...programCoursePublicSelection }; // For now, admin sees same as public for simplicity

export const addCourseToProgram = async (data) => {
    try {
        if (!prisma) throw new AppError('Prisma client not available.', 500);
        const { programId, courseId, levelId, isElective, isActive } = data;

        if (!programId || !courseId || !levelId) {
            throw new AppError('Program, Course, and Level IDs are required.', 400);
        }
        const pPId = parseInt(programId, 10), pCId = parseInt(courseId, 10), pLId = parseInt(levelId, 10);
        if (isNaN(pPId) || isNaN(pCId) || isNaN(pLId)) throw new AppError('Invalid ID format.', 400);

        const [program, course, level] = await Promise.all([
            prisma.program.findUnique({ where: { id: pPId } }),
            prisma.course.findUnique({ where: { id: pCId, isActive: true } }), // Ensure course is active
            prisma.level.findUnique({ where: { id: pLId } })
        ]);
        if (!program) throw new AppError(`Program ID ${pPId} not found.`, 404);
        if (!course) throw new AppError(`Active Course ID ${pCId} not found. Cannot map an inactive course.`, 404); // Clarified error
        if (!level) throw new AppError(`Level ID ${pLId} not found.`, 404);

        const newProgramCourse = await prisma.programCourse.create({
            data: {
                programId: pPId, courseId: pCId, levelId: pLId,
                isElective: isElective === undefined ? false : Boolean(isElective),
                isActive: isActive === undefined ? true : Boolean(isActive), // Mapping's own active status
            },
            select: programCourseAdminSelection
        });
        return newProgramCourse;
    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2002') throw new AppError('This course is already mapped to this program at this level.', 409);
        console.error("Error adding course to program:", error.message, error.stack);
        throw new AppError('Could not add course to program.', 500);
    }
};

export const getProgramCourseById = async (id, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client not available.', 500);
        const pcId = parseInt(id, 10);
        if (isNaN(pcId)) throw new AppError('Invalid ProgramCourse ID.', 400);

        const selection = (requestingUser.type === 'admin' || (requestingUser.type === 'ictstaff' && requestingUser.canManageCourses))
            ? programCourseAdminSelection
            : programCoursePublicSelection;

        const programCourse = await prisma.programCourse.findUnique({
            where: { id: pcId }, select: selection
        });

        if (!programCourse) throw new AppError('Program course mapping not found.', 404);

        // For non-admins/managers, if the mapping is inactive OR the course itself is inactive, don't show.
        if (selection === programCoursePublicSelection && (!programCourse.isActive || !programCourse.course.isActive)) {
            throw new AppError('Program course mapping not available.', 404);
        }
        return programCourse;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching program course by ID:", error.message, error.stack);
        throw new AppError('Could not retrieve program course mapping.', 500);
    }
};

export const getAllProgramCourses = async (query, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client not available.', 500);
        const { programId, courseId, levelId, isActive: queryIsActive, page = 1, limit = 10 } = query;
        const where = {};

        const canSeeInactive = requestingUser.type === 'admin' || (requestingUser.type === 'ictstaff' && requestingUser.canManageCourses);

        if (canSeeInactive) {
            if (queryIsActive !== undefined) where.isActive = queryIsActive === 'true'; // Filter by mapping's isActive
        } else {
            where.isActive = true; // Mapping must be active
            where.course = { isActive: true }; // And the underlying course must be active
        }

        if (programId) where.programId = parseInt(programId, 10);
        if (courseId) where.courseId = parseInt(courseId, 10);
        if (levelId) where.levelId = parseInt(levelId, 10);

        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;
        const selection = canSeeInactive ? programCourseAdminSelection : programCoursePublicSelection;

        const items = await prisma.programCourse.findMany({
            where, select: selection,
            orderBy: [{ program: { name: 'asc' } }, { level: { name: 'asc' } }, { course: { code: 'asc' } }],
            skip, take: limitNum
        });
        const totalItems = await prisma.programCourse.count({ where });
        return { items, totalPages: Math.ceil(totalItems / limitNum), currentPage: pageNum, totalItems };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching program courses:", error.message, error.stack);
        throw new AppError('Could not retrieve program course list.', 500);
    }
};

export const updateProgramCourse = async (id, updateData) => {
    try {
        if (!prisma) throw new AppError('Prisma client not available.', 500);
        const pcId = parseInt(id, 10);
        if (isNaN(pcId)) throw new AppError('Invalid ProgramCourse ID.', 400);

        const existingPC = await prisma.programCourse.findUnique({
            where: { id: pcId },
            include: { course: { select: { isActive: true, code: true } } } // Include course to check its status
        });
        if (!existingPC) throw new AppError('Program course mapping not found.', 404);

        const dataForDb = {};
        const { isElective, isActive } = updateData; // Only these fields are typically updatable for a mapping

        // Prevent changing programId, courseId, levelId after creation
        if (updateData.programId && parseInt(updateData.programId, 10) !== existingPC.programId) {
            throw new AppError('Cannot change programId for an existing mapping.', 400);
        }
        if (updateData.courseId && parseInt(updateData.courseId, 10) !== existingPC.courseId) {
            throw new AppError('Cannot change courseId for an existing mapping.', 400);
        }
        if (updateData.levelId && parseInt(updateData.levelId, 10) !== existingPC.levelId) {
            throw new AppError('Cannot change levelId for an existing mapping.', 400);
        }

        if (isElective !== undefined) dataForDb.isElective = Boolean(isElective);

        if (isActive !== undefined) {
            const newIsActive = Boolean(isActive);
            // If trying to activate this mapping, but the underlying course is inactive, prevent it.
            if (newIsActive === true && !existingPC.course.isActive) {
                throw new AppError(`Cannot activate mapping for inactive course '${existingPC.course.code}'. Activate the course first.`, 400);
            }
            dataForDb.isActive = newIsActive;
        }

        if (Object.keys(dataForDb).length === 0) throw new AppError('No valid fields provided for update.', 400);

        const updatedProgramCourse = await prisma.programCourse.update({
            where: { id: pcId }, data: dataForDb, select: programCourseAdminSelection
        });
        return updatedProgramCourse;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error updating program course:", error.message, error.stack);
        throw new AppError('Could not update program course mapping.', 500);
    }
};

// NEW FUNCTION: To set the active status of a ProgramCourse mapping
export const setProgramCourseActiveStatus = async (id, desiredStatus) => {
    try {
        if (!prisma) throw new AppError('Prisma client not available.', 500);
        const pcId = parseInt(id, 10);
        if (isNaN(pcId)) throw new AppError('Invalid ProgramCourse ID.', 400);

        if (typeof desiredStatus !== 'boolean') {
            throw new AppError('Invalid isActive status provided. Must be true or false.', 400);
        }

        const programCourseToUpdate = await prisma.programCourse.findUnique({
            where: { id: pcId },
            include: { // Include related entities for context in messages or checks
                program: { select: { name: true } },
                course: { select: { code: true, isActive: true } }, // Important: check course's own status
                level: { select: { name: true } }
            }
        });

        if (!programCourseToUpdate) throw new AppError('Program course mapping not found.', 404);

        // Business Logic: Cannot activate a ProgramCourse mapping if the underlying Course is inactive.
        if (desiredStatus === true && !programCourseToUpdate.course.isActive) {
            throw new AppError(
                `Cannot activate mapping for course '${programCourseToUpdate.course.code}' because the course itself is inactive. Activate the course first.`,
                400
            );
        }

        const updatedProgramCourse = await prisma.programCourse.update({
            where: { id: pcId },
            data: { isActive: desiredStatus },
            select: programCourseAdminSelection // Return the updated mapping
        });

        const actionMessage = desiredStatus ? 'activated' : 'deactivated';
        return {
            message: `Program course mapping (Course: ${programCourseToUpdate.course.code} for Program: ${programCourseToUpdate.program.name} at Level: ${programCourseToUpdate.level.name}) has been successfully ${actionMessage}.`,
            updatedMapping: updatedProgramCourse
        };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error(`Error setting ProgramCourse status for ID ${id}:`, error.message, error.stack);
        throw new AppError('Could not set program course mapping active status.', 500);
    }
};


// RENAMED & UPDATED: Permanent delete
export const deleteProgramCourseMappingPermanently = async (id) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const pcId = parseInt(id, 10);
        if (isNaN(pcId)) throw new AppError('Invalid ProgramCourse ID format.', 400);

        const existingPC = await prisma.programCourse.findUnique({
            where: { id: pcId },
            include: { // Include for a richer message, not strictly for delete blocking
                program: { select: { name: true } },
                course: { select: { code: true } },
                level: { select: { name: true } }
            }
        });
        if (!existingPC) throw new AppError('Program course mapping not found for deletion.', 404);

        // Check for dependencies if any. For ProgramCourse, direct dependencies are less common.
        // StudentCourseRegistration links to Course, Level, Semester, Season, not directly to ProgramCourse.id.
        // If you add relations from other tables to ProgramCourse.id with ON DELETE RESTRICT,
        // you'd need to check them here or rely on Prisma's P2003 error.

        await prisma.programCourse.delete({ where: { id: pcId } });
        return {
            message: `Program course mapping (ID: ${pcId}, Course: ${existingPC.course.code} for Program: ${existingPC.program.name} at Level: ${existingPC.level.name}) permanently deleted.`
        };
    } catch (error) {
        if (error instanceof AppError) throw error;
        // P2003 is a foreign key constraint error.
        // It means something else in your database is still referencing this ProgramCourse record
        // AND that foreign key relationship has an ON DELETE RESTRICT rule.
        if (error.code === 'P2003') {
            throw new AppError('Cannot delete this program course mapping. It is still referenced by other critical records in the system.', 400);
        }
        console.error("Error deleting program course mapping permanently:", error.message, error.stack);
        throw new AppError('Could not permanently delete program course mapping.', 500);
    }
};