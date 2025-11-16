// src/services/programCourseUnitRequirement.service.js

import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import { SemesterType } from '../generated/prisma/index.js'; // Import the enum

const programCourseUnitRequirementSelection = {
    id: true,
    minimumCreditUnits: true,
    maximumCreditUnits: true,
    description: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
    programId: true,
    levelId: true,
    semesterType: true, // Select the enum directly
    // Include related models for richer data
    program: {
        select: {
            id: true,
            name: true,
            programCode: true,
            department: {
                select: {
                    id: true,
                    name: true,
                },
            },
        },
    },
    level: {
        select: {
            id: true,
            name: true,
            value: true,
        },
    },
};

/**
 * Creates a new Program Course Unit Requirement.
 * @param {object} requirementData - Data for the new requirement.
 * @returns {Promise<object>} The created requirement.
 */
export const createRequirement = async (requirementData) => {
    try {
        const { programId, levelId, semesterType, minimumCreditUnits, maximumCreditUnits, description, isActive } = requirementData;

        // 1. Basic Validation
        if (!programId || !levelId || !semesterType || minimumCreditUnits === undefined || maximumCreditUnits === undefined) {
            throw new AppError('Program ID, Level ID, Semester Type, Minimum and Maximum Credit Units are required.', 400);
        }
        if (!Object.values(SemesterType).includes(semesterType)) {
            throw new AppError(`Invalid Semester Type: ${semesterType}. Must be one of ${Object.values(SemesterType).join(', ')}.`, 400);
        }
        if (minimumCreditUnits < 0 || maximumCreditUnits < 0) {
            throw new AppError('Credit units cannot be negative.', 400);
        }
        if (minimumCreditUnits > maximumCreditUnits) {
            throw new AppError('Minimum credit units cannot be greater than maximum credit units.', 400);
        }

        const pProgramId = parseInt(programId, 10);
        const pLevelId = parseInt(levelId, 10);

        if (isNaN(pProgramId) || isNaN(pLevelId)) {
            throw new AppError('Invalid ID format for Program or Level.', 400);
        }

        // 2. Check existence of related entities
        const [programExists, levelExists] = await Promise.all([
            prisma.program.findUnique({ where: { id: pProgramId } }),
            prisma.level.findUnique({ where: { id: pLevelId } }),
        ]);

        if (!programExists) throw new AppError(`Program with ID ${pProgramId} not found.`, 404);
        if (!levelExists) throw new AppError(`Level with ID ${pLevelId} not found.`, 404);

        // 3. Create the requirement
        const newRequirement = await prisma.programCourseUnitRequirement.create({
            data: {
                programId: pProgramId,
                levelId: pLevelId,
                semesterType: semesterType,
                minimumCreditUnits,
                maximumCreditUnits,
                description: description || null,
                isActive: isActive ?? true, // Default to true if not provided
            },
            select: programCourseUnitRequirementSelection,
        });

        return newRequirement;

    } catch (error) {
        if (error.code === 'P2002' && error.meta?.target) {
            throw new AppError(`A unit requirement for this program, level, and semester type already exists.`, 409);
        }
        throw error; // Re-throw other AppErrors or general errors
    }
};

/**
 * Retrieves a single Program Course Unit Requirement by ID.
 * @param {number} id - The ID of the requirement.
 * @returns {Promise<object>} The requirement found.
 */
export const getRequirementById = async (id) => {
    try {
        const pId = parseInt(id, 10);
        if (isNaN(pId)) throw new AppError('Invalid requirement ID format.', 400);

        const requirement = await prisma.programCourseUnitRequirement.findUnique({
            where: { id: pId },
            select: programCourseUnitRequirementSelection,
        });

        if (!requirement) throw new AppError('Program Course Unit Requirement not found.', 404);

        return requirement;
    } catch (error) {
        throw error;
    }
};

/**
 * Retrieves all Program Course Unit Requirements with optional filters and pagination.
 * @param {object} query - Query parameters for filtering and pagination.
 * @returns {Promise<{requirements: object[], totalPages: number, currentPage: number, limit: number, totalRequirements: number}>} List of requirements and pagination info.
 */
export const getAllRequirements = async (query) => {
    try {
        const {
            programId,
            levelId,
            semesterType,
            isActive,
            page = "1",
            limit = "10"
        } = query;

        const where = {};

        if (programId) {
            const pId = parseInt(programId, 10);
            if (!isNaN(pId)) where.programId = pId;
        }
        if (levelId) {
            const lId = parseInt(levelId, 10);
            if (!isNaN(lId)) where.levelId = lId;
        }
        if (semesterType && Object.values(SemesterType).includes(semesterType)) {
            where.semesterType = semesterType;
        }
        if (isActive !== undefined) {
            where.isActive = String(isActive).toLowerCase() === 'true';
        }

        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        if (isNaN(pageNum) || pageNum < 1) throw new AppError('Invalid page number.', 400);
        if (isNaN(limitNum) || limitNum < 1) throw new AppError('Invalid limit number.', 400);

        const skip = (pageNum - 1) * limitNum;

        const [requirements, totalRequirements] = await prisma.$transaction([
            prisma.programCourseUnitRequirement.findMany({
                where,
                select: programCourseUnitRequirementSelection,
                skip,
                take: limitNum,
                orderBy: { program: { name: 'asc' } }, // Default order
            }),
            prisma.programCourseUnitRequirement.count({ where }),
        ]);

        return {
            requirements,
            totalPages: Math.ceil(totalRequirements / limitNum),
            currentPage: pageNum,
            limit: limitNum,
            totalRequirements,
        };
    } catch (error) {
        throw error;
    }
};

/**
 * Updates an existing Program Course Unit Requirement.
 * @param {number} id - The ID of the requirement to update.
 * @param {object} updateData - Data to update the requirement with.
 * @returns {Promise<object>} The updated requirement.
 */
export const updateRequirement = async (id, updateData) => {
    try {
        const pId = parseInt(id, 10);
        if (isNaN(pId)) throw new AppError('Invalid requirement ID format.', 400);

        const existingRequirement = await prisma.programCourseUnitRequirement.findUnique({
            where: { id: pId },
            select: { id: true, programId: true, levelId: true, semesterType: true } // Select unique fields for later checks
        });
        if (!existingRequirement) throw new AppError('Program Course Unit Requirement not found for update.', 404);

        const dataToUpdate = {};

        // Validate and assign update fields
        if (updateData.programId !== undefined) {
            const newProgramId = parseInt(updateData.programId, 10);
            if (isNaN(newProgramId)) throw new AppError('Invalid Program ID format.', 400);
            const programExists = await prisma.program.findUnique({ where: { id: newProgramId } });
            if (!programExists) throw new AppError(`Program with ID ${newProgramId} not found.`, 404);
            dataToUpdate.programId = newProgramId;
        }
        if (updateData.levelId !== undefined) {
            const newLevelId = parseInt(updateData.levelId, 10);
            if (isNaN(newLevelId)) throw new AppError('Invalid Level ID format.', 400);
            const levelExists = await prisma.level.findUnique({ where: { id: newLevelId } });
            if (!levelExists) throw new AppError(`Level with ID ${newLevelId} not found.`, 404);
            dataToUpdate.levelId = newLevelId;
        }
        if (updateData.semesterType !== undefined) {
            if (!Object.values(SemesterType).includes(updateData.semesterType)) {
                throw new AppError(`Invalid Semester Type: ${updateData.semesterType}.`, 400);
            }
            dataToUpdate.semesterType = updateData.semesterType;
        }
        if (updateData.minimumCreditUnits !== undefined) {
            if (updateData.minimumCreditUnits < 0) throw new AppError('Minimum credit units cannot be negative.', 400);
            dataToUpdate.minimumCreditUnits = updateData.minimumCreditUnits;
        }
        if (updateData.maximumCreditUnits !== undefined) {
            if (updateData.maximumCreditUnits < 0) throw new AppError('Maximum credit units cannot be negative.', 400);
            dataToUpdate.maximumCreditUnits = updateData.maximumCreditUnits;
        }
        if (updateData.description !== undefined) {
            dataToUpdate.description = updateData.description;
        }
        if (updateData.isActive !== undefined) {
            dataToUpdate.isActive = Boolean(updateData.isActive);
        }

        // Validate min/max coherence after all updates are applied
        const finalMinUnits = dataToUpdate.minimumCreditUnits ?? existingRequirement.minimumCreditUnits;
        const finalMaxUnits = dataToUpdate.maximumCreditUnits ?? existingRequirement.maximumCreditUnits;
        if (finalMinUnits > finalMaxUnits) {
             throw new AppError('Minimum credit units cannot be greater than maximum credit units.', 400);
        }

        if (Object.keys(dataToUpdate).length === 0) {
            throw new AppError('No valid fields provided for update.', 400);
        }

        const updatedRequirement = await prisma.programCourseUnitRequirement.update({
            where: { id: pId },
            data: dataToUpdate,
            select: programCourseUnitRequirementSelection,
        });

        return updatedRequirement;
    } catch (error) {
        if (error.code === 'P2002' && error.meta?.target) {
            throw new AppError(`A unit requirement with these program, level, and semester type values already exists.`, 409);
        }
        throw error;
    }
};

/**
 * Deletes a Program Course Unit Requirement.
 * @param {number} id - The ID of the requirement to delete.
 * @returns {Promise<object>} Confirmation message.
 */
export const deleteRequirement = async (id) => {
    try {
        const pId = parseInt(id, 10);
        if (isNaN(pId)) throw new AppError('Invalid requirement ID format.', 400);

        const requirementExists = await prisma.programCourseUnitRequirement.findUnique({
            where: { id: pId },
            select: { id: true },
        });
        if (!requirementExists) throw new AppError('Program Course Unit Requirement not found for deletion.', 404);

        await prisma.programCourseUnitRequirement.delete({
            where: { id: pId },
        });

        return { message: 'Program Course Unit Requirement deleted successfully.' };
    } catch (error) {
        // P2003 indicates a foreign key constraint violation (unlikely here as no other models reference this)
        if (error.code === 'P2003') {
            throw new AppError('Cannot delete this requirement as it is still referenced by other records.', 409);
        }
        throw error;
    }
};