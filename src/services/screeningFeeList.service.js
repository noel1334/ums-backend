// src/services/screeningFeeList.service.js
import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import { EntryMode } from '../generated/prisma/index.js';

const selection = {
    id: true, seasonId: true, entryMode: true, amount: true, description: true, isActive: true,
    createdAt: true, updatedAt: true,
    season: { select: { id: true, name: true } }
};

export const createScreeningFee = async (data) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const { seasonId, entryMode, amount, description, isActive } = data;

        if (!seasonId || !entryMode || amount === undefined) {
            throw new AppError('Season ID, Entry Mode, and Amount are required.', 400);
        }
        if (!Object.values(EntryMode).includes(entryMode)) {
            throw new AppError('Invalid Entry Mode.', 400);
        }
        const pSeasonId = parseInt(seasonId, 10);
        const pAmount = parseFloat(amount);
        if (isNaN(pSeasonId) || isNaN(pAmount) || pAmount <= 0) {
            throw new AppError('Invalid Season ID or Amount (must be positive).', 400);
        }

        const seasonExists = await prisma.season.findUnique({ where: { id: pSeasonId } });
        if (!seasonExists) throw new AppError(`Season ID ${pSeasonId} not found.`, 404);

        const newFee = await prisma.screeningFeeList.create({
            data: {
                seasonId: pSeasonId,
                entryMode,
                amount: pAmount,
                description: description || null,
                isActive: isActive === undefined ? true : Boolean(isActive)
            },
            select: selection
        });
        return newFee;
    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2002') throw new AppError('A screening fee for this season and entry mode already exists.', 409);
        console.error("Error creating screening fee:", error.message, error.stack);
        throw new AppError('Could not create screening fee.', 500);
    }
};

export const getAllScreeningFees = async (query) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const { seasonId, entryMode, isActive, page = 1, limit = 20 } = query;
        const where = {};
        if (seasonId) where.seasonId = parseInt(seasonId, 10);
        if (entryMode && Object.values(EntryMode).includes(entryMode)) where.entryMode = entryMode;
        if (isActive !== undefined) where.isActive = isActive === 'true';

        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;

        const fees = await prisma.screeningFeeList.findMany({
            where, select: selection, orderBy: { seasonId: 'desc' }, skip, take: limitNum
        });
        const totalFees = await prisma.screeningFeeList.count({ where });
        return { fees, totalPages: Math.ceil(totalFees / limitNum), currentPage: pageNum, totalFees };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching screening fees:", error.message, error.stack);
        throw new AppError('Could not retrieve screening fees.', 500);
    }
};

export const getScreeningFeeById = async (id) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const feeId = parseInt(id, 10);
        if (isNaN(feeId)) throw new AppError('Invalid ID format.', 400);

        const fee = await prisma.screeningFeeList.findUnique({ where: { id: feeId }, select: selection });
        if (!fee) throw new AppError('Screening fee not found.', 404);
        return fee;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching screening fee by ID:", error.message, error.stack);
        throw new AppError('Could not retrieve screening fee.', 500);
    }
};

export const updateScreeningFee = async (id, updateData) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const feeId = parseInt(id, 10);
        if (isNaN(feeId)) throw new AppError('Invalid ID format.', 400);

        const existingFee = await prisma.screeningFeeList.findUnique({ where: { id: feeId } });
        if (!existingFee) throw new AppError('Screening fee not found for update.', 404);

        const dataForDb = {};
        const { amount, description, isActive, seasonId, entryMode } = updateData;

        // Generally, seasonId and entryMode are part of the unique key and shouldn't be changed.
        // If they need to change, it's often better to create a new record and deactivate the old one.
        if (seasonId && parseInt(seasonId, 10) !== existingFee.seasonId) {
            throw new AppError('Cannot change seasonId for an existing screening fee. Create a new one.', 400);
        }
        if (entryMode && entryMode !== existingFee.entryMode) {
            throw new AppError('Cannot change entryMode for an existing screening fee. Create a new one.', 400);
        }

        if (amount !== undefined) {
            const pAmount = parseFloat(amount);
            if (isNaN(pAmount) || pAmount <= 0) throw new AppError('Invalid amount.', 400);
            dataForDb.amount = pAmount;
        }
        if (updateData.hasOwnProperty('description')) dataForDb.description = description; // Allow setting to null
        if (isActive !== undefined) dataForDb.isActive = Boolean(isActive);

        if (Object.keys(dataForDb).length === 0) throw new AppError('No valid fields to update.', 400);

        const updatedFee = await prisma.screeningFeeList.update({
            where: { id: feeId }, data: dataForDb, select: selection
        });
        return updatedFee;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error updating screening fee:", error.message, error.stack);
        throw new AppError('Could not update screening fee.', 500);
    }
};

export const deleteScreeningFee = async (id) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const feeId = parseInt(id, 10);
        if (isNaN(feeId)) throw new AppError('Invalid ID format.', 400);

        const existingFee = await prisma.screeningFeeList.findUnique({
            where: { id: feeId },
            include: { _count: { select: { applicantPayments: true } } }
        });
        if (!existingFee) throw new AppError('Screening fee not found for deletion.', 404);

        if (existingFee._count.applicantPayments > 0) {
            throw new AppError('Cannot delete screening fee. It has associated payments. Consider deactivating it instead.', 400);
        }

        await prisma.screeningFeeList.delete({ where: { id: feeId } });
        return { message: 'Screening fee deleted successfully.' };
    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2003') throw new AppError('Cannot delete fee due to existing relations.', 400);
        console.error("Error deleting screening fee:", error.message, error.stack);
        throw new AppError('Could not delete screening fee.', 500);
    }
};

export const getApplicableFeeForApplicant = async (applicantProfile) => {
    if (!prisma) throw new AppError('Prisma client unavailable', 500);

    // Get the applicant's entryMode and seasonId from their related JambApplicant record
    const jambApplicant = await prisma.jambApplicant.findUnique({
        where: { jambRegNo: applicantProfile.jambRegNo },
        select: { entryMode: true, jambSeasonId: true }
    });

    if (!jambApplicant || !jambApplicant.jambSeasonId) {
        throw new AppError('Could not determine admission season or entry mode for this applicant.', 404);
    }
    
    // Find the active screening fee that matches the applicant's season and entry mode
    const applicableFee = await prisma.screeningFeeList.findUnique({
        where: {
            seasonId_entryMode: {
                seasonId: jambApplicant.jambSeasonId,
                entryMode: jambApplicant.entryMode
            },
            isActive: true
        },
        select: selection // Reuse the selection object from the top of the file
    });

    if (!applicableFee) {
        throw new AppError('No active screening fee found for your admission session and entry mode.', 404);
    }

    return applicableFee;
};