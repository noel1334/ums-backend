import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';

export const createLevel = async (levelData) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const { name, value, description, order } = levelData;

        if (!name || value === undefined || String(value).trim() === '') {
            throw new AppError('Level name and a valid numeric value are required.', 400);
        }

        const data = {
            name,
            value: parseInt(value, 10),
            description, // This now correctly uses the destructured 'Description' variable
            order: (order !== undefined && String(order).trim() !== '') ? parseInt(order, 10) : undefined,
        };

        if (isNaN(data.value)) throw new AppError('Level value must be a valid number.', 400);
        if (data.order !== undefined && isNaN(data.order)) throw new AppError('Order must be a valid number if provided.', 400);

        const level = await prisma.level.create({ data });
        return level;
    } catch (error) {
        if (error.code === 'P2002') {
            const field = error.meta?.target?.[0];
            if (field === 'name') throw new AppError('A level with this name already exists.', 409);
            if (field === 'value') throw new AppError('A level with this value already exists.', 409);
            if (field === 'order') throw new AppError('A level with this order already exists.', 409);
        }
        if (error instanceof AppError) throw error;
        console.error("Error creating level:", error);
        throw new AppError('Could not create level.', 500);
    }
};

export const getAllLevels = async () => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        return await prisma.level.findMany({
            orderBy: [{ order: 'asc' }, { value: 'asc' }]
        });
    } catch (error) {
        console.error("Error fetching levels:", error);
        throw new AppError('Could not retrieve levels.', 500);
    }
};

export const getLevelById = async (id) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const levelId = parseInt(id, 10);
        if (isNaN(levelId)) throw new AppError('Invalid level ID format.', 400);

        const level = await prisma.level.findUnique({ where: { id: levelId } });
        if (!level) throw new AppError('Level not found.', 404);
        return level;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching level by ID:", error);
        throw new AppError('Could not retrieve level.', 500);
    }
};

export const updateLevel = async (id, updateData) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const levelId = parseInt(id, 10);
        if (isNaN(levelId)) throw new AppError('Invalid level ID format.', 400);

        // --- THIS IS THE SECOND KEY FIX ---
        const { name, value, description, order } = updateData;

        const dataToUpdate = {};
        if (name) dataToUpdate.name = name;
        if (description !== undefined) dataToUpdate.description = description; // Use capital 'D'

        if (value !== undefined && String(value).trim() !== '') {
            const parsedValue = parseInt(value, 10);
            if (isNaN(parsedValue)) throw new AppError('Value must be a valid number.', 400);
            dataToUpdate.value = parsedValue;
        }
        if (order !== undefined && String(order).trim() !== '') {
            const parsedOrder = parseInt(order, 10);
            if (isNaN(parsedOrder)) throw new AppError('Order must be a valid number.', 400);
            dataToUpdate.order = parsedOrder;
        }

        if (Object.keys(dataToUpdate).length === 0) {
            throw new AppError('No valid fields provided for update.', 400);
        }

        const level = await prisma.level.update({
            where: { id: levelId },
            data: dataToUpdate,
        });
        return level;
    } catch (error) {
        if (error.code === 'P2002') {
            const field = error.meta?.target?.[0];
            if (field === 'name') throw new AppError('A level with this name already exists.', 409);
            if (field === 'value') throw new AppError('A level with this value already exists.', 409);
            if (field === 'order') throw new AppError('A level with this order already exists.', 409);
        }
        if (error instanceof AppError) throw error;
        console.error("Error updating level:", error);
        throw new AppError('Could not update level.', 500);
    }
};

export const deleteLevel = async (id) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const levelId = parseInt(id, 10);
        if (isNaN(levelId)) throw new AppError('Invalid level ID format.', 400);

        const studentCount = await prisma.student.count({
            where: { OR: [{ entryLevelId: levelId }, { currentLevelId: levelId }] },
        });
        if (studentCount > 0) {
            throw new AppError(`Cannot delete level. It is used by ${studentCount} students.`, 400);
        }

        const programCourseCount = await prisma.programCourse.count({ where: { levelId } });
        if (programCourseCount > 0) {
            throw new AppError(`Cannot delete level. It is used by ${programCourseCount} program courses.`, 400);
        }

        const resultCount = await prisma.result.count({ where: { levelId } });
        if (resultCount > 0) {
            throw new AppError(`Cannot delete level. It is used by ${resultCount} student results.`, 400);
        }

        await prisma.level.delete({ where: { id: levelId } });
        return { message: 'Level deleted successfully' };
    } catch (error) {
        if (error.code === 'P2003') {
            throw new AppError('Cannot delete level. It is referenced by other records.', 400);
        }
        if (error instanceof AppError) throw error;
        console.error("Error deleting level:", error);
        throw new AppError('Could not delete level.', 500);
    }
};