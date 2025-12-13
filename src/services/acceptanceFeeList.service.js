import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import { EntryMode, ApplicationStatus, DocumentType, DegreeType } from '../generated/prisma/index.js'; // Ensure all enums are imported


const normalizeEntryMode = (inputMode) => {
    if (inputMode === undefined || inputMode === null) return null;
    const trimmed = String(inputMode).trim().toUpperCase();

    switch (trimmed) {
        case 'UTME': return EntryMode.UTME;
        case 'DE': 
        case 'DIRECT_ENTRY': return EntryMode.DIRECT_ENTRY;
        case 'TRANSFER': return EntryMode.TRANSFER;
        case '': return null; 
        default: return trimmed; 
    }
};

const selection = {
    id: true,
    amount: true,
    description: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
    seasonId: true,
    programId: true,
    facultyId: true,
    entryMode: true,
    season: { select: { id: true, name: true } },
    program: { select: { id: true, name: true, programCode: true } },
    faculty: { select: { id: true, name: true, facultyCode: true } }
};

export const createAcceptanceFee = async (data) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const { seasonId, programId, facultyId, entryMode, amount, description, isActive } = data;

        if (!seasonId || amount === undefined) {
            throw new AppError('Season ID and Amount are required.', 400);
        }

        const pSeasonId = parseInt(seasonId, 10);
        const pProgramId = programId ? parseInt(programId, 10) : null;
        const pFacultyId = facultyId ? parseInt(facultyId, 10) : null;
        const pAmount = parseFloat(amount);

        if (isNaN(pSeasonId) || pAmount <= 0) {
            throw new AppError('Invalid Season ID or Amount (must be positive).', 400);
        }

        let processedEntryMode = normalizeEntryMode(entryMode);

        if (processedEntryMode !== null && !Object.values(EntryMode).includes(processedEntryMode)) {
            throw new AppError(`Invalid Entry Mode: '${entryMode}'. Must be one of ${Object.values(EntryMode).join(', ')}.`, 400);
        }

        const seasonExists = await prisma.season.findUnique({ where: { id: pSeasonId } });
        if (!seasonExists) throw new AppError(`Season ID ${pSeasonId} not found.`, 404);
        if (pProgramId && !(await prisma.program.findUnique({ where: { id: pProgramId } }))) {
            throw new AppError(`Program ID ${pProgramId} not found.`, 404);
        }
        if (pFacultyId && !(await prisma.faculty.findUnique({ where: { id: pFacultyId } }))) {
            throw new AppError(`Faculty ID ${pFacultyId} not found.`, 404);
        }

        const newFee = await prisma.acceptanceFeeList.create({
            data: {
                seasonId: pSeasonId,
                programId: pProgramId,
                facultyId: pFacultyId,
                entryMode: processedEntryMode,
                amount: pAmount,
                description: description || null,
                isActive: isActive === undefined ? true : Boolean(isActive)
            },
            select: selection
        });
        return newFee;
    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2002') throw new AppError('An acceptance fee with this specific combination of Season, Program, Faculty, and Entry Mode already exists.', 409);
        console.error("Error creating acceptance fee:", error.message, error.stack);
        throw new AppError('Could not create acceptance fee.', 500);
    }
};


export const getAllAcceptanceFees = async (query) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const { seasonId, programId, facultyId, entryMode, isActive, page = 1, limit = 20 } = query;
        const where = {};
        if (seasonId) where.seasonId = parseInt(seasonId, 10);
        if (programId) where.programId = parseInt(programId, 10);
        if (facultyId) where.facultyId = parseInt(facultyId, 10);
        if (entryMode && Object.values(EntryMode).includes(entryMode)) where.entryMode = entryMode;
        if (isActive !== undefined) where.isActive = isActive === 'true';

        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;

        const fees = await prisma.acceptanceFeeList.findMany({
            where, select: selection, orderBy: { seasonId: 'desc' }, skip, take: limitNum
        });
        const totalFees = await prisma.acceptanceFeeList.count({ where });
        return { fees, totalPages: Math.ceil(totalFees / limitNum), currentPage: pageNum, totalFees };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching acceptance fees:", error.message, error.stack);
        throw new AppError('Could not retrieve acceptance fees.', 500);
    }
};

export const getAcceptanceFeeById = async (id) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const feeId = parseInt(id, 10);
        if (isNaN(feeId)) throw new AppError('Invalid ID format.', 400);

        const fee = await prisma.acceptanceFeeList.findUnique({ where: { id: feeId }, select: selection });
        if (!fee) throw new AppError('Acceptance fee not found.', 404);
        return fee;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching acceptance fee by ID:", error.message, error.stack);
        throw new AppError('Could not retrieve acceptance fee.', 500);
    }
};

export const updateAcceptanceFee = async (id, updateData) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const feeId = parseInt(id, 10);
        if (isNaN(feeId)) throw new AppError('Invalid ID format.', 400);

        const existingFee = await prisma.acceptanceFeeList.findUnique({ where: { id: feeId } });
        if (!existingFee) throw new AppError('Acceptance fee not found for update.', 404);

        const dataForDb = {};
        const { amount, description, isActive, seasonId, programId, facultyId, entryMode } = updateData;

        if (seasonId !== undefined && parseInt(seasonId, 10) !== existingFee.seasonId) {
            throw new AppError('Cannot change Season ID for an existing acceptance fee.', 400);
        }
        if (programId !== undefined) {
             const pProgramId = programId ? parseInt(programId, 10) : null;
             if (pProgramId !== existingFee.programId) throw new AppError('Cannot change Program ID for an existing acceptance fee.', 400);
        }
        if (facultyId !== undefined) {
             const pFacultyId = facultyId ? parseInt(facultyId, 10) : null;
             if (pFacultyId !== existingFee.facultyId) throw new AppError('Cannot change Faculty ID for an existing acceptance fee.', 400);
        }
        if (entryMode !== undefined && entryMode !== existingFee.entryMode) {
            throw new AppError('Cannot change Entry Mode for an existing acceptance fee.', 400);
        }

        if (amount !== undefined) {
            const pAmount = parseFloat(amount);
            if (isNaN(pAmount) || pAmount <= 0) throw new AppError('Invalid amount.', 400);
            dataForDb.amount = pAmount;
        }
        if (updateData.hasOwnProperty('description')) dataForDb.description = description;
        if (isActive !== undefined) dataForDb.isActive = Boolean(isActive);

        if (Object.keys(dataForDb).length === 0) throw new AppError('No valid fields to update.', 400);

        const updatedFee = await prisma.acceptanceFeeList.update({
            where: { id: feeId }, data: dataForDb, select: selection
        });
        return updatedFee;
    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2002') throw new AppError('A conflict occurred: An acceptance fee with this unique combination already exists.', 409);
        console.error("Error updating acceptance fee:", error.message, error.stack);
        throw new AppError('Could not update acceptance fee.', 500);
    }
};

// --- MODIFIED deleteAcceptanceFee function ---
export const deleteAcceptanceFee = async (id) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const feeId = parseInt(id, 10);
        if (isNaN(feeId)) throw new AppError('Invalid ID format.', 400);

        // Fetch the existing fee and its counts
        const existingFee = await prisma.acceptanceFeeList.findUnique({
            where: { id: feeId },
            include: { 
                _count: { 
                    select: { 
                        applicantPayments: true, 
                        admissionOffers: true 
                    } 
                } 
            }
        });
        if (!existingFee) throw new AppError('Acceptance fee not found for deletion.', 404);

        // --- REMOVED THE BUSINESS RULE CHECK HERE ---
        // The previous if condition `if (existingFee._count.applicantPayments > 0 || existingFee._count.admissionOffers > 0)`
        // has been removed. Deletion will now proceed regardless of associated records.

        // Perform the deletion
        // Prisma's onDelete actions (SetNull/Cascade) defined in schema.prisma will handle related records.
        await prisma.acceptanceFeeList.delete({ where: { id: feeId } });
        return { message: 'Acceptance fee deleted successfully.' };
    } catch (error) {
        if (error instanceof AppError) throw error;
        // P2003 could still happen if there's a RESTRICT rule not covered by SetNull/Cascade.
        // If it still fails with P2003, review your schema.prisma's onDelete actions for AdmissionOffer/ApplicantPayment related to AcceptanceFeeList.
        if (error.code === 'P2003') {
            throw new AppError('Cannot delete fee due to existing relations. Ensure all relations allow CASCADE or SET NULL on delete.', 400);
        }
        console.error("Error deleting acceptance fee:", error.message, error.stack);
        throw new AppError('Could not delete acceptance fee.', 500);
    }
};

// --- REMAINDER OF ADMISSION OFFER SERVICE (getMyApplicableAcceptanceFee, etc.) ---
export const getApplicableAcceptanceFee = async (applicationProfileId) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const profileId = parseInt(applicationProfileId, 10);
        if (isNaN(profileId)) throw new AppError('Invalid Application Profile ID.', 400);

        const applicationProfile = await prisma.applicationProfile.findUnique({
            where: { id: profileId },
            include: {
                admissionOffer: {
                    include: {
                        admissionSeason: true, 
                        offeredProgram: { include: { department: true } }
                    }
                },
            }
        });

        if (!applicationProfile) {
            throw new AppError('Application profile not found.', 404);
        }
        if (!applicationProfile.admissionOffer) {
            throw new AppError('No admission offer found for this applicant.', 404);
        }

        if (applicationProfile.admissionOffer.hasPaidAcceptanceFee) {
            console.log(`[AcceptanceFeeService] Applicant ${profileId} has already paid acceptance fee.`);
            return { message: "Acceptance fee has already been paid for this offer.", fee: null };
        }

        const offer = applicationProfile.admissionOffer;
        const seasonId = offer.admissionSeasonId;
        const programId = offer.offeredProgramId;
        const facultyId = offer.offeredProgram?.department?.facultyId;

        let entryMode = null;
        if (applicationProfile.jambRegNo) { 
            const jambApplicant = await prisma.jambApplicant.findUnique({
                where: { jambRegNo: applicationProfile.jambRegNo },
                select: { entryMode: true }
            });
            entryMode = jambApplicant?.entryMode || null;
        } else {
            console.warn(`[AcceptanceFeeService] applicationProfile ${profileId} does not have a jambRegNo to fetch entryMode.`);
        }

        console.log(`[AcceptanceFeeService] Searching for fee for Season: ${seasonId}, Program: ${programId}, Faculty: ${facultyId}, EntryMode: ${entryMode}`);

        let applicableFee = null;

        if (programId && entryMode) {
            applicableFee = await prisma.acceptanceFeeList.findFirst({
                where: { isActive: true, seasonId, programId, entryMode },
                orderBy: { createdAt: 'desc' },
                select: selection
            });
        }

        if (!applicableFee && programId) {
            applicableFee = await prisma.acceptanceFeeList.findFirst({
                where: { isActive: true, seasonId, programId, entryMode: null },
                orderBy: { createdAt: 'desc' },
                select: selection
            });
        }

        if (!applicableFee && facultyId && entryMode) {
            applicableFee = await prisma.acceptanceFeeList.findFirst({
                where: { isActive: true, seasonId, programId: null, facultyId, entryMode },
                orderBy: { createdAt: 'desc' },
                select: selection
            });
        }

        if (!applicableFee && facultyId) {
            applicableFee = await prisma.acceptanceFeeList.findFirst({
                where: { isActive: true, seasonId, programId: null, facultyId, entryMode: null },
                orderBy: { createdAt: 'desc' },
                select: selection
            });
        }

        if (!applicableFee && entryMode) {
            applicableFee = await prisma.acceptanceFeeList.findFirst({
                where: { isActive: true, seasonId, programId: null, facultyId: null, entryMode },
                orderBy: { createdAt: 'desc' },
                select: selection
            });
        }

        if (!applicableFee) {
            applicableFee = await prisma.acceptanceFeeList.findFirst({
                where: { isActive: true, seasonId, programId: null, facultyId: null, entryMode: null },
                orderBy: { createdAt: 'desc' },
                select: selection
            });
        }

        if (!applicableFee) {
            console.warn(`[AcceptanceFeeService] No active acceptance fee found for Season: ${seasonId}, Program: ${programId}, Faculty: ${facultyId}, EntryMode: ${entryMode}.`);
            throw new AppError('No applicable acceptance fee found for your admission offer. Please contact support.', 404);
        }

        if (!offer.acceptanceFeeListId || offer.acceptanceFeeListId !== applicableFee.id) {
            await prisma.admissionOffer.update({
                where: { id: offer.id },
                data: { acceptanceFeeListId: applicableFee.id }
            });
            console.log(`[AcceptanceFeeService] Updated AdmissionOffer ${offer.id} with acceptanceFeeListId ${applicableFee.id}`);
        }

        console.log(`[AcceptanceFeeService] Found applicable fee:`, applicableFee);
        return applicableFee; 
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching applicable acceptance fee:", error.message, error.stack);
        throw new AppError('Could not retrieve applicable acceptance fee.', 500);
    }
};
