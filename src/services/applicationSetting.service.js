import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';

const settingPublicSelection = {
    id: true,
    key: true,
    value: true,
    description: true,
    type: true,
    createdAt: true,
    updatedAt: true
};

export const createApplicationSetting = async (settingData) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const { key, value, description, type } = settingData;

        if (!key || value === undefined) { // value can be an empty string
            throw new AppError('Setting key and value are required.', 400);
        }

        const newSetting = await prisma.applicationSetting.create({
            data: {
                key,
                value: String(value), // Ensure value is stored as string
                description: description || null,
                type: type || null,
            },
            select: settingPublicSelection
        });
        return newSetting;
    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2002' && error.meta?.target?.includes('key')) {
            throw new AppError(`An application setting with key '${key}' already exists.`, 409);
        }
        console.error("Error creating application setting:", error.message, error.stack);
        throw new AppError('Could not create application setting.', 500);
    }
};

export const getApplicationSettingByKey = async (key) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        if (!key) throw new AppError('Setting key is required.', 400);

        const setting = await prisma.applicationSetting.findUnique({
            where: { key },
            select: settingPublicSelection
        });

        if (!setting) throw new AppError(`Application setting with key '${key}' not found.`, 404);
        return setting;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching application setting by key:", error.message, error.stack);
        throw new AppError('Could not retrieve application setting.', 500);
    }
};

export const getAllApplicationSettings = async (query) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const { page = 1, limit = 20, keySearch } = query; // Added keySearch
        const where = {};
        if (keySearch) where.key = { contains: keySearch };


        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;

        const settings = await prisma.applicationSetting.findMany({
            where,
            select: settingPublicSelection,
            orderBy: { key: 'asc' },
            skip,
            take: limitNum
        });
        const totalSettings = await prisma.applicationSetting.count({ where });

        return {
            settings,
            totalPages: Math.ceil(totalSettings / limitNum),
            currentPage: pageNum,
            totalSettings
        };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching all application settings:", error.message, error.stack);
        throw new AppError('Could not retrieve application settings list.', 500);
    }
};

export const updateApplicationSetting = async (key, updateData) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        if (!key) throw new AppError('Setting key is required to identify the setting to update.', 400);

        const existingSetting = await prisma.applicationSetting.findUnique({ where: { key } });
        if (!existingSetting) throw new AppError(`Application setting with key '${key}' not found for update.`, 404);

        const dataForDb = {};
        const { value, description, type } = updateData;

        if (value !== undefined) dataForDb.value = String(value);
        if (updateData.hasOwnProperty('description')) dataForDb.description = description === null ? null : String(description);
        if (updateData.hasOwnProperty('type')) dataForDb.type = type === null ? null : String(type);
        // Key is not updatable, if key needs to change, delete and create new.

        if (Object.keys(dataForDb).length === 0) {
            throw new AppError('No valid fields provided for update.', 400);
        }

        const updatedSetting = await prisma.applicationSetting.update({
            where: { key },
            data: dataForDb,
            select: settingPublicSelection
        });
        return updatedSetting;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error updating application setting:", error.message, error.stack);
        throw new AppError('Could not update application setting.', 500);
    }
};

export const deleteApplicationSetting = async (key) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        if (!key) throw new AppError('Setting key is required for deletion.', 400);

        const existingSetting = await prisma.applicationSetting.findUnique({ where: { key } });
        if (!existingSetting) throw new AppError(`Application setting with key '${key}' not found for deletion.`, 404);

        await prisma.applicationSetting.delete({
            where: { key },
        });
        return { message: `Application setting '${key}' deleted successfully.` };
    } catch (error) {
        if (error instanceof AppError) throw error;
        // P2003 unlikely as ApplicationSetting is not typically a foreign key in other tables.
        console.error("Error deleting application setting:", error.message, error.stack);
        throw new AppError('Could not delete application setting.', 500);
    }
};