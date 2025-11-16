import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';

export const createDepartment = async (departmentData) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const { name, facultyId } = departmentData;

        if (!name || !facultyId) {
            throw new AppError('Department name and faculty ID are required.', 400);
        }

        // Validate facultyId exists
        const faculty = await prisma.faculty.findUnique({ where: { id: parseInt(facultyId, 10) } });
        if (!faculty) {
            throw new AppError(`Faculty with ID ${facultyId} not found.`, 404);
        }

        const department = await prisma.department.create({
            data: {
                name,
                facultyId: parseInt(facultyId, 10),
            },
            include: { faculty: true }, // Include faculty details in the response
        });
        return department;
    } catch (error) {
        if (error.code === 'P2002' && error.meta?.target?.includes('name')) {
            throw new AppError('A department with this name already exists.', 409);
        }
        if (error instanceof AppError) throw error;
        console.error("Error creating department in service:", error);
        throw new AppError('Could not create department.', 500);
    }
};

export const getAllDepartments = async (query) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const { facultyId } = query;
        let whereClause = {};
        if (facultyId) {
            whereClause.facultyId = parseInt(facultyId, 10);
            if (isNaN(whereClause.facultyId)) {
                throw new AppError('Invalid facultyId format in query.', 400);
            }
        }

        return await prisma.department.findMany({
            where: whereClause,
            include: {
                faculty: true, // Include faculty information
                // programs: true, // Optionally include programs, can make response large
                // lecturers: { select: { id: true, name: true } } // Example of selective include
            },
            orderBy: { name: 'asc' }
        });
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching departments in service:", error);
        throw new AppError('Could not retrieve departments.', 500);
    }
};

export const getDepartmentById = async (id) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const departmentId = parseInt(id, 10);
        if (isNaN(departmentId)) {
            throw new AppError('Invalid department ID format.', 400);
        }

        const department = await prisma.department.findUnique({
            where: { id: departmentId },
            include: {
                faculty: true,
                programs: true,
                lecturers: { select: { id: true, name: true, staffId: true, role: true } },
            },
        });

        if (!department) {
            throw new AppError('Department not found.', 404);
        }
        return department;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching department by ID in service:", error);
        throw new AppError('Could not retrieve department.', 500);
    }
};

export const updateDepartment = async (id, updateData) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const departmentId = parseInt(id, 10);
        if (isNaN(departmentId)) {
            throw new AppError('Invalid department ID format.', 400);
        }

        const { name, facultyId } = updateData;

        if (facultyId) {
            const faculty = await prisma.faculty.findUnique({ where: { id: parseInt(facultyId, 10) } });
            if (!faculty) {
                throw new AppError(`Faculty with ID ${facultyId} not found for update.`, 404);
            }
            updateData.facultyId = parseInt(facultyId, 10);
        }


        // Check if department exists before attempting update
        const existingDepartment = await prisma.department.findUnique({ where: { id: departmentId } });
        if (!existingDepartment) {
            throw new AppError('Department not found for update.', 404);
        }

        const department = await prisma.department.update({
            where: { id: departmentId },
            data: updateData,
            include: { faculty: true },
        });
        return department;
    } catch (error) {
        if (error.code === 'P2002' && error.meta?.target?.includes('name')) {
            throw new AppError('A department with this name already exists.', 409);
        }
        if (error instanceof AppError) throw error;
        console.error("Error updating department in service:", error);
        throw new AppError('Could not update department.', 500);
    }
};

export const deleteDepartment = async (id) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const departmentId = parseInt(id, 10);
        if (isNaN(departmentId)) {
            throw new AppError('Invalid department ID format.', 400);
        }

        // Check if department exists
        const existingDepartment = await prisma.department.findUnique({ where: { id: departmentId } });
        if (!existingDepartment) {
            throw new AppError('Department not found for deletion.', 404);
        }

        // Check for related entities before deletion (example)
        const programsCount = await prisma.program.count({ where: { departmentId } });
        if (programsCount > 0) {
            throw new AppError('Cannot delete department. It has associated programs.', 400);
        }
        const lecturersCount = await prisma.lecturer.count({ where: { departmentId } });
        if (lecturersCount > 0) {
            throw new AppError('Cannot delete department. It has associated lecturers.', 400);
        }
        // Add similar checks for students, courses, etc. if necessary based on your rules

        await prisma.department.delete({
            where: { id: departmentId },
        });
        return { message: 'Department deleted successfully' };
    } catch (error) {
        if (error.code === 'P2003') { // Foreign key constraint failed
            throw new AppError('Cannot delete department. It is referenced by other records (e.g., students, courses).', 400);
        }
        if (error instanceof AppError) throw error;
        console.error("Error deleting department in service:", error);
        throw new AppError('Could not delete department.', 500);
    }
};