// src/services/registrationControl.service.js
import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import { DegreeType } from '../generated/prisma/index.js'; // Ensure DegreeType is imported

const registrationControlSelection = {
    id: true,
    degreeType: true,
    isActive: true,
    message: true,
    createdAt: true,
    updatedAt: true,
};

/**
 * Creates a new registration control entry. Primarily for initial setup.
 * @param {object} data - Data for the new control entry.
 * @param {DegreeType} data.degreeType - The degree type this control applies to.
 * @param {boolean} [data.isActive=false] - Whether registration is active for this type.
 * @param {string} [data.message] - Message to display when inactive.
 * @returns {Promise<object>} The created registration control.
 */
export const createRegistrationControl = async (data) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);

        const { degreeType, isActive, message } = data;

        if (!degreeType || !Object.values(DegreeType).includes(degreeType)) {
            throw new AppError('Valid Degree Type is required.', 400);
        }

        const newControl = await prisma.registrationControl.create({
            data: {
                degreeType,
                isActive: isActive ?? false, // Ensure boolean, default to false
                message: message || null,
            },
            select: registrationControlSelection,
        });
        return newControl;
    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2002' && error.meta?.target?.includes('degreeType')) {
            throw new AppError(`Registration control for degree type '${data.degreeType}' already exists.`, 409);
        }
        console.error("[REGISTRATION_CONTROL_SERVICE_ERROR] createRegistrationControl:", error.message, error.stack);
        throw new AppError('Could not create registration control.', 500);
    }
};

/**
 * Retrieves all registration control entries.
 * @returns {Promise<object[]>} A list of all registration controls.
 */
export const getAllRegistrationControls = async () => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);

        const controls = await prisma.registrationControl.findMany({
            select: registrationControlSelection,
            orderBy: { degreeType: 'asc' },
        });
        return controls;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("[REGISTRATION_CONTROL_SERVICE_ERROR] getAllRegistrationControls:", error.message, error.stack);
        throw new AppError('Could not retrieve registration controls.', 500);
    }
};

/**
 * Retrieves the registration status for a specific degree type.
 * @param {DegreeType} degreeType - The degree type to check.
 * @returns {Promise<object>} The registration control for the specified degree type.
 */
export const getRegistrationStatusByDegreeType = async (degreeType) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);

        if (!degreeType || !Object.values(DegreeType).includes(degreeType)) {
            throw new AppError('Valid Degree Type is required.', 400);
        }

        const control = await prisma.registrationControl.findUnique({
            where: { degreeType },
            select: registrationControlSelection,
        });

        // If no control entry exists, assume registration is closed by default.
        if (!control) {
            return {
                degreeType,
                isActive: false,
                message: `Registration for ${String(degreeType).replace(/_/g, ' ')} is not configured. Please contact support.`,
                createdAt: new Date().toISOString(), // Dummy dates for non-existent record
                updatedAt: new Date().toISOString(),
            };
        }
        return control;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("[REGISTRATION_CONTROL_SERVICE_ERROR] getRegistrationStatusByDegreeType:", error.message, error.stack);
        throw new AppError(`Could not retrieve registration status for ${degreeType}.`, 500);
    }
};

/**
 * Updates an existing registration control entry.
 * @param {DegreeType} degreeType - The degree type of the control to update.
 * @param {object} updateData - Data to update.
 * @param {boolean} [updateData.isActive] - Whether registration is active.
 * @param {string} [updateData.message] - Message to display when inactive.
 * @returns {Promise<object>} The updated registration control.
 */
export const updateRegistrationControl = async (degreeType, updateData) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);

        if (!degreeType || !Object.values(DegreeType).includes(degreeType)) {
            throw new AppError('Valid Degree Type is required.', 400);
        }

        const existingControl = await prisma.registrationControl.findUnique({
            where: { degreeType },
        });

        if (!existingControl) {
            throw new AppError(`Registration control for degree type '${degreeType}' not found.`, 404);
        }

        const dataForDb = {};
        if (updateData.hasOwnProperty('isActive')) {
            dataForDb.isActive = Boolean(updateData.isActive);
        }
        if (updateData.hasOwnProperty('message')) {
            dataForDb.message = updateData.message || null; // Allow setting message to null
        }

        if (Object.keys(dataForDb).length === 0) {
            throw new AppError('No valid fields provided for update.', 400);
        }

        const updatedControl = await prisma.registrationControl.update({
            where: { degreeType },
            data: dataForDb,
            select: registrationControlSelection,
        });
        return updatedControl;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("[REGISTRATION_CONTROL_SERVICE_ERROR] updateRegistrationControl:", error.message, error.stack);
        throw new AppError('Could not update registration control.', 500);
    }
};