// src/services/universitySetting.service.js

import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';

/**
 * Fetch the single university setting record.
 * If no record exists, it returns default placeholders.
 */
export const getUniversitySettings = async () => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);

        let settings = await prisma.universitySetting.findFirst();

        // If no settings exist yet, return a safe default structure
        if (!settings) {
            settings = {
                id: 1,
                name: 'Federal University of Technology',
                acronym: 'FUTO',
                address: 'P.M.B. 1526, Owerri, Imo State',
                email: 'info@futo.edu.ng',
                phone: '+234-803-123-4567',
                logoUrl: null
            };
        }
        return settings;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error('[UNIVERSITY_SETTING_SERVICE_ERROR] getUniversitySettings:', error.message);
        throw new AppError('Could not retrieve university information.', 500);
    }
};

/**
 * Create or update the single university settings record.
 */
export const updateUniversitySettings = async (data) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);

        const { name, acronym, address, email, phone, logoUrl } = data;

        if (!name || String(name).trim() === '') {
            throw new AppError('University Name is required.', 400);
        }

        const existingSettings = await prisma.universitySetting.findFirst();

        let updatedSettings;
        if (existingSettings) {
            // Update the existing record
            updatedSettings = await prisma.universitySetting.update({
                where: { id: existingSettings.id },
                data: {
                    name: String(name).trim(),
                    acronym: acronym ? String(acronym).trim() : null,
                    address: address ? String(address).trim() : null,
                    email: email ? String(email).trim() : null,
                    phone: phone ? String(phone).trim() : null,
                    logoUrl: logoUrl ? String(logoUrl).trim() : existingSettings.logoUrl,
                }
            });
        } else {
            // Create the first record if none exists
            updatedSettings = await prisma.universitySetting.create({
                data: {
                    name: String(name).trim(),
                    acronym: acronym ? String(acronym).trim() : null,
                    address: address ? String(address).trim() : null,
                    email: email ? String(email).trim() : null,
                    phone: phone ? String(phone).trim() : null,
                    logoUrl: logoUrl ? String(logoUrl).trim() : null,
                }
            });
        }

        return updatedSettings;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error('[UNIVERSITY_SETTING_SERVICE_ERROR] updateUniversitySettings:', error.message);
        throw new AppError('Could not update university information.', 500);
    }
};