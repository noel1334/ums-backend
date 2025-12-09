import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js'; //
import { DegreeType } from '../generated/prisma/index.js'; // Import DegreeType enum

export const createLevel = async (levelData) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500); //
        const { name, value, description, order, degreeType } = levelData;

        if (!name || value === undefined || String(value).trim() === '') {
            throw new AppError('Level name and a valid numeric value are required.', 400); //
        }
        // MODIFIED: degreeType is now required in the Level model
        if (!degreeType || !Object.values(DegreeType).includes(degreeType)) {
            throw new AppError('A valid DegreeType is required for the level.', 400); //
        }

        const data = {
            name,
            value: parseInt(value, 10),
            description,
            order: (order !== undefined && String(order).trim() !== '') ? parseInt(order, 10) : undefined,
            degreeType: degreeType, // degreeType is now required
        };

        if (isNaN(data.value)) throw new AppError('Level value must be a valid number.', 400); //
        if (data.order !== undefined && isNaN(data.order)) throw new AppError('Order must be a valid number if provided.', 400); //

        const level = await prisma.level.create({ data });
        return level;
    } catch (error) {
        if (error.code === 'P2002') { //
            const field = error.meta?.target?.[0];
            if (field.includes('name') && field.includes('degreeType')) throw new AppError('A level with this name and degree type combination already exists.', 409); //
            if (field.includes('value') && field.includes('degreeType')) throw new AppError('A level with this value and degree type combination already exists.', 409); //
            if (field.includes('order') && field.includes('degreeType')) throw new AppError('A level with this order and degree type combination already exists.', 409); //
            throw new AppError(`Duplicate entry for unique field: ${field || 'unknown field'}.`, 409); //
        }
        if (error instanceof AppError) throw error; //
        console.error("Error creating level:", error);
        throw new AppError('Could not create level due to an unexpected error.', 500); //
    }
};

export const getAllLevels = async () => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500); //
        return await prisma.level.findMany({
            orderBy: [{ order: 'asc' }, { value: 'asc' }]
        });
    } catch (error) {
        console.error("Error fetching levels:", error);
        throw new AppError('Could not retrieve levels.', 500); //
    }
};

export const getLevelById = async (id) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500); //
        const levelId = parseInt(id, 10);
        if (isNaN(levelId)) throw new AppError('Invalid level ID format.', 400); //

        const level = await prisma.level.findUnique({ where: { id: levelId } });
        if (!level) throw new AppError('Level not found.', 404); //
        return level;
    } catch (error) {
        if (error instanceof AppError) throw error; //
        console.error("Error fetching level by ID:", error);
        throw new AppError('Could not retrieve level.', 500); //
    }
};

export const updateLevel = async (id, updateData) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500); //
        const levelId = parseInt(id, 10);
        if (isNaN(levelId)) throw new AppError('Invalid level ID format.', 400); //

        const { name, value, description, order, degreeType } = updateData;

        const dataToUpdate = {};
        if (name) dataToUpdate.name = name;
        if (description !== undefined) dataToUpdate.description = description;

        if (value !== undefined && String(value).trim() !== '') {
            const parsedValue = parseInt(value, 10);
            if (isNaN(parsedValue)) throw new AppError('Value must be a valid number.', 400); //
            dataToUpdate.value = parsedValue;
        }
        if (order !== undefined && String(order).trim() !== '') {
            const parsedOrder = parseInt(order, 10);
            if (isNaN(parsedOrder)) throw new AppError('Order must be a valid number.', 400); //
            dataToUpdate.order = parsedOrder;
        }
        // MODIFIED: If degreeType is provided for update, validate it against the enum
        if (degreeType !== undefined) {
            if (!Object.values(DegreeType).includes(degreeType)) {
                throw new AppError('Invalid DegreeType provided for update.', 400); //
            }
            dataToUpdate.degreeType = degreeType;
        }

        if (Object.keys(dataToUpdate).length === 0) {
            throw new AppError('No valid fields provided for update.', 400); //
        }

        const level = await prisma.level.update({
            where: { id: levelId },
            data: dataToUpdate,
        });
        return level;
    } catch (error) {
        if (error.code === 'P2002') { //
            const field = error.meta?.target?.[0];
            if (field.includes('name') && field.includes('degreeType')) throw new AppError('A level with this name and degree type combination already exists.', 409); //
            if (field.includes('value') && field.includes('degreeType')) throw new AppError('A level with this value and degree type combination already exists.', 409); //
            if (field.includes('order') && field.includes('degreeType')) throw new AppError('A level with this order and degree type combination already exists.', 409); //
            throw new AppError(`Duplicate entry for unique field: ${field || 'unknown field'}.`, 409); //
        }
        if (error instanceof AppError) throw error; //
        console.error("Error updating level:", error);
        throw new AppError('Could not update level due to an unexpected error.', 500); //
    }
};

export const deleteLevel = async (id) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500); //
        const levelId = parseInt(id, 10);
        if (isNaN(levelId)) throw new AppError('Invalid level ID format.', 400); //

        // Enhanced checks for dependencies before deleting
        const studentCount = await prisma.student.count({
            where: { OR: [{ entryLevelId: levelId }, { currentLevelId: levelId }] },
        });
        if (studentCount > 0) {
            throw new AppError(`Cannot delete level. It is currently associated with ${studentCount} students.`, 400); //
        }

        const programCourseCount = await prisma.programCourse.count({ where: { levelId } });
        if (programCourseCount > 0) {
            throw new AppError(`Cannot delete level. It is used in ${programCourseCount} program courses.`, 400); //
        }

        const resultCount = await prisma.result.count({ where: { levelId } });
        if (resultCount > 0) {
            throw new AppError(`Cannot delete level. It is used in ${resultCount} student results.`, 400); //
        }

        const schoolFeeListCount = await prisma.schoolFeeList.count({ where: { levelId } });
        if (schoolFeeListCount > 0) {
            throw new AppError(`Cannot delete level. It is used in ${schoolFeeListCount} school fee lists.`, 400); //
        }

        const programCourseUnitRequirementCount = await prisma.programCourseUnitRequirement.count({ where: { levelId } });
        if (programCourseUnitRequirementCount > 0) {
            throw new AppError(`Cannot delete level. It is used in ${programCourseUnitRequirementCount} program course unit requirements.`, 400); //
        }

        const admissionOfferCount = await prisma.admissionOffer.count({ where: { offeredLevelId: levelId } });
        if (admissionOfferCount > 0) {
            throw new AppError(`Cannot delete level. It is referenced by ${admissionOfferCount} admission offers.`, 400); //
        }


        await prisma.level.delete({ where: { id: levelId } });
        return { message: 'Level deleted successfully' };
    } catch (error) {
        if (error.code === 'P2003') { //
            throw new AppError('Cannot delete level. It is referenced by other records (foreign key constraint failed).', 400); //
        }
        if (error instanceof AppError) throw error; //
        console.error("Error deleting level:", error);
        throw new AppError('Could not delete level due to an unexpected error.', 500); //
    }
};