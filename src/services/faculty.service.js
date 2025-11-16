// src/services/faculty.service.js
import prisma from '../config/prisma.js'; // Make sure this path is correct!
import AppError from '../utils/AppError.js';

export const createFaculty = async (facultyData) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const { name, facultyCode, description } = facultyData;

        if (!name || !facultyCode) {
            throw new AppError('Faculty name and faculty code are required.', 400);
        }

        const dataToCreate = { name, facultyCode };
        if (description !== undefined) {
            dataToCreate.description = description;
        }

        const faculty = await prisma.faculty.create({
            data: dataToCreate,
            include: { departments: true } // Optionally include departments on create
        });
        return faculty;
    } catch (error) {
        if (error.code === 'P2002') {
            if (error.meta?.target?.includes('name')) {
                throw new AppError('A faculty with this name already exists.', 409);
            }
            if (error.meta?.target?.includes('facultyCode')) {
                throw new AppError('A faculty with this faculty code already exists.', 409);
            }
            throw new AppError('Unique constraint violation on faculty.', 409);
        }
        console.error("Error creating faculty in service:", error.message, error.stack);
        throw new AppError('Could not create faculty.', 500);
    }
};

export const getAllFaculties = async () => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        return await prisma.faculty.findMany({
            include: { departments: { select: { id: true, name: true } } }, // Select specific fields for departments
            orderBy: { name: 'asc' }
        });
    } catch (error) {
        console.error("Error fetching faculties in service:", error.message, error.stack);
        throw new AppError('Could not retrieve faculties.', 500);
    }
};

export const getFacultyById = async (id) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const facultyId = parseInt(id, 10);
        if (isNaN(facultyId)) {
            throw new AppError('Invalid faculty ID format.', 400);
        }
        const faculty = await prisma.faculty.findUnique({
            where: { id: facultyId },
            include: { departments: true }
        });
        if (!faculty) {
            throw new AppError('Faculty not found.', 404);
        }
        return faculty;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching faculty by ID in service:", error.message, error.stack);
        throw new AppError('Could not retrieve faculty.', 500);
    }
};

export const updateFaculty = async (id, updateData) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const facultyId = parseInt(id, 10);
        if (isNaN(facultyId)) {
            throw new AppError('Invalid faculty ID format.', 400);
        }

        const existingFaculty = await prisma.faculty.findUnique({ where: { id: facultyId } });
        if (!existingFaculty) {
            throw new AppError('Faculty not found for update.', 404);
        }

        const { name, facultyCode, description } = updateData;
        const dataToUpdate = {};

        if (name !== undefined) dataToUpdate.name = name;
        if (facultyCode !== undefined) {
            if (facultyCode === '' || facultyCode === null) {
                throw new AppError('Faculty code is required and cannot be empty.', 400);
            }
            dataToUpdate.facultyCode = facultyCode;
        }
        if (updateData.hasOwnProperty('description')) { // Check if key exists, allows setting to null
            dataToUpdate.description = description === null ? null : String(description);
        }

        if (Object.keys(dataToUpdate).length === 0) {
            throw new AppError('No data provided for update.', 400);
        }

        // Check for unique constraints if name or facultyCode are being changed
        if (dataToUpdate.name && dataToUpdate.name !== existingFaculty.name) {
            const nameConflict = await prisma.faculty.findFirst({ where: { name: dataToUpdate.name, id: { not: facultyId } } });
            if (nameConflict) throw new AppError('A faculty with this name already exists.', 409);
        }
        if (dataToUpdate.facultyCode && dataToUpdate.facultyCode !== existingFaculty.facultyCode) {
            const codeConflict = await prisma.faculty.findFirst({ where: { facultyCode: dataToUpdate.facultyCode, id: { not: facultyId } } });
            if (codeConflict) throw new AppError('A faculty with this faculty code already exists.', 409);
        }


        const faculty = await prisma.faculty.update({
            where: { id: facultyId },
            data: dataToUpdate,
            include: { departments: true } // Optionally include departments on update
        });
        return faculty;
    } catch (error) {
        if (error instanceof AppError) throw error; // Re-throw AppErrors
        if (error.code === 'P2002') { // Fallback unique constraint check
            throw new AppError('A faculty with this name or faculty code already exists (P2002).', 409);
        }
        console.error("Error updating faculty in service:", error.message, error.stack);
        throw new AppError('Could not update faculty.', 500);
    }
};

export const deleteFaculty = async (id) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const facultyId = parseInt(id, 10);
        if (isNaN(facultyId)) {
            throw new AppError('Invalid faculty ID format.', 400);
        }

        const existingFaculty = await prisma.faculty.findUnique({ where: { id: facultyId } });
        if (!existingFaculty) {
            throw new AppError('Faculty not found for deletion.', 404);
        }

        // This check depends on your onDelete rule for Department.facultyId
        // If it's Restrict (which is a good default), this check is vital.
        const departmentsCount = await prisma.department.count({ where: { facultyId } });
        if (departmentsCount > 0) {
            throw new AppError(`Cannot delete faculty. It has ${departmentsCount} associated department(s). Please reassign or delete them first.`, 400);
        }

        await prisma.faculty.delete({
            where: { id: facultyId },
        });
        return { message: 'Faculty deleted successfully' };
    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2003') { // Foreign key constraint failed
            throw new AppError('Cannot delete faculty. It is still referenced by departments.', 400);
        }
        console.error("Error deleting faculty in service:", error.message, error.stack);
        throw new AppError('Could not delete faculty.', 500);
    }
};