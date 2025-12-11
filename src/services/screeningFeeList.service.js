import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import { EntryMode, ApplicantPaymentPurpose, DegreeType } from '../generated/prisma/index.js'; // Ensure DegreeType is imported

// Updated selection to include degreeType
const selection = {
    id: true, seasonId: true, entryMode: true, degreeType: true, amount: true, description: true, isActive: true,
    createdAt: true, updatedAt: true,
    season: { select: { id: true, name: true } }
};

export const createScreeningFee = async (data) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        // ADDED degreeType to destructuring
        const { seasonId, entryMode, degreeType, amount, description, isActive } = data;

        // ADDED degreeType validation
        if (!seasonId || !entryMode || !degreeType || amount === undefined) {
            throw new AppError('Season ID, Entry Mode, Degree Type, and Amount are required.', 400);
        }
        if (!Object.values(EntryMode).includes(entryMode)) {
            throw new AppError('Invalid Entry Mode.', 400);
        }
        // ADDED DegreeType validation
        if (!Object.values(DegreeType).includes(degreeType)) {
            throw new AppError('Invalid Degree Type.', 400);
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
                degreeType, // NEW: Include degreeType here
                amount: pAmount,
                description: description || null,
                isActive: isActive === undefined ? true : Boolean(isActive)
            },
            select: selection
        });
        return newFee;
    } catch (error) {
        if (error instanceof AppError) throw error;
        // Modified error message for clarity due to new unique constraint
        if (error.code === 'P2002') throw new AppError('A screening fee for this season, entry mode, and degree type already exists.', 409);
        console.error("Error creating screening fee:", error.message, error.stack);
        throw new AppError('Could not create screening fee.', 500);
    }
};

export const getAllScreeningFees = async (query) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        // ADDED degreeType to query destructuring
        const { seasonId, entryMode, degreeType, isActive, page = 1, limit = 20 } = query;
        const where = {};
        if (seasonId) where.seasonId = parseInt(seasonId, 10);
        if (entryMode && Object.values(EntryMode).includes(entryMode)) where.entryMode = entryMode;
        // ADDED degreeType filter
        if (degreeType && Object.values(DegreeType).includes(degreeType)) where.degreeType = degreeType;
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
        // ADDED degreeType to destructuring
        const { amount, description, isActive, seasonId, entryMode, degreeType } = updateData;

        if (seasonId && parseInt(seasonId, 10) !== existingFee.seasonId) {
            throw new AppError('Cannot change seasonId for an existing screening fee. Create a new one.', 400);
        }
        if (entryMode && entryMode !== existingFee.entryMode) {
            throw new AppError('Cannot change entryMode for an existing screening fee. Create a new one.', 400);
        }
        // NEW: Disallow changing degreeType for an existing screening fee
        if (degreeType && degreeType !== existingFee.degreeType) {
            throw new AppError('Cannot change degreeType for an existing screening fee. Create a new one.', 400);
        }

        if (amount !== undefined) {
            const pAmount = parseFloat(amount);
            if (isNaN(pAmount) || pAmount <= 0) throw new AppError('Invalid amount.', 400);
            dataForDb.amount = pAmount;
        }
        if (updateData.hasOwnProperty('description')) dataForDb.description = description;
        if (isActive !== undefined) dataForDb.isActive = Boolean(isActive);

        if (Object.keys(dataForDb).length === 0) throw new AppError('No valid fields to update.', 400);

        const updatedFee = await prisma.screeningFeeList.update({
            where: { id: feeId }, data: dataForDb, select: selection
        });
        return updatedFee;
    } catch (error) {
        if (error instanceof AppError) throw error;
        // Modified error message for clarity if unique constraint is violated on update attempt
        if (error.code === 'P2002') throw new AppError('An active screening fee with these season, entry mode, and degree type already exists.', 409);
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

// --- MODIFIED getApplicableFeeForApplicant FUNCTION to use degreeType ---
export const getApplicableFeeForApplicant = async (applicationProfileId) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);

        const parsedApplicationProfileId = parseInt(applicationProfileId, 10);
        if (isNaN(parsedApplicationProfileId)) {
            throw new AppError('Invalid application profile ID format provided.', 400);
        }

        const applicationProfile = await prisma.applicationProfile.findUnique({
            where: { id: parsedApplicationProfileId },
            select: {
                id: true,
                jambRegNo: true, // Crucial for distinguishing JAMB vs. Direct Entry
                targetProgramId: true,
                onlineScreeningList: {
                    select: {
                        jambApplicant: { // Will be null if no jambRegNo
                            select: {
                                entryMode: true,
                                jambSeasonId: true,
                            },
                        },
                    },
                },
                targetProgram: { // This might be null for JAMB applicants before program selection
                    select: {
                        id: true,
                        name: true,
                        degreeType: true, // Get the degreeType if a program is selected
                        department: {
                            select: {
                                faculty: {
                                    select: {
                                        id: true,
                                        name: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        if (!applicationProfile) {
            throw new AppError('Application profile not found.', 404);
        }

        const currentActiveSeason = await prisma.season.findFirst({
            where: { isActive: true },
            select: { id: true, name: true }
        });

        if (!currentActiveSeason) {
            throw new AppError('No active academic season found for fee determination.', 500);
        }

        let applicableFee = null;
        let feePurpose = ApplicantPaymentPurpose.SCREENING_APPLICATION_FEE;
        let feeListIdField = null;

        // Determine the 'effective' degree type for the screening fee lookup.
        // If a target program is selected, use its degree type.
        // For JAMB applicants without a selected program, we'll assume UNDERGRADUATE for screening fees.
        // For direct registrants without a selected program, it's an error state (as a program should be chosen at registration).
        const targetProgramDegreeType = applicationProfile.targetProgram?.degreeType;

        let effectiveDegreeTypeForScreening = targetProgramDegreeType; // Start with the actual program's degree type

        // --- Logic specific to JAMB-sourced applicants ---
        if (applicationProfile.jambRegNo) {
            const jambApplicantDetails = applicationProfile.onlineScreeningList?.jambApplicant;
            
            // If JAMB applicant has no target program chosen yet, assume UNDERGRADUATE for initial screening fee
            if (!effectiveDegreeTypeForScreening) {
                effectiveDegreeTypeForScreening = DegreeType.UNDERGRADUATE;
                console.log(`JAMB applicant ${parsedApplicationProfileId} has no target program. Assuming screening fee is for ${effectiveDegreeTypeForScreening}.`);
            }

            if (!jambApplicantDetails) {
                console.warn(`JambRegNo '${applicationProfile.jambRegNo}' found on ApplicationProfile ${parsedApplicationProfileId}, but no linked JambApplicant details. This is a data inconsistency. Attempting to use generic UTME/DIRECT_ENTRY fee for screening.`);
                // Fallback: try to find a screening fee using a general UTME/DIRECT_ENTRY mode if JAMB details are missing
                applicableFee = await prisma.screeningFeeList.findFirst({
                    where: {
                        seasonId: currentActiveSeason.id,
                        // If jambApplicantDetails are missing, we can't reliably get entryMode, so cover both
                        OR: [{ entryMode: EntryMode.UTME }, { entryMode: EntryMode.DIRECT_ENTRY }],
                        degreeType: effectiveDegreeTypeForScreening,
                        isActive: true,
                    },
                    orderBy: { createdAt: 'desc' },
                });
            } else {
                // Primary path for JAMB applicants: use their actual entryMode from JAMB
                applicableFee = await prisma.screeningFeeList.findFirst({
                    where: {
                        seasonId: currentActiveSeason.id,
                        entryMode: jambApplicantDetails.entryMode, // UTME or DIRECT_ENTRY from JAMB record
                        degreeType: effectiveDegreeTypeForScreening, // Use the determined effective degree type
                        isActive: true,
                    },
                    orderBy: { createdAt: 'desc' },
                });
            }

            if (applicableFee) {
                feeListIdField = 'screeningFeeListId';
            } else {
                console.warn(`No specific screening fee list found for JAMB entry mode '${jambApplicantDetails?.entryMode || 'N/A'}' and effective degree type '${effectiveDegreeTypeForScreening}' in season ${currentActiveSeason.name}.`);
            }
        }

        // --- Path for Direct Entry/Postgraduate Applicants (who registered directly) or Fallback if JAMB fee not found ---
        if (!applicableFee) {
            // For direct registrations through the portal, a target program *must* be selected during registration.
            // If targetProgramDegreeType is still null here, it means the direct applicant has not selected a program,
            // which is an incomplete state for them.
            if (!targetProgramDegreeType) {
                console.warn(`ApplicationProfile ${parsedApplicationProfileId} (direct entry) has no target program or degree type specified. Cannot determine screening fee.`);
                return null; // Cannot determine fee for direct entry without a selected program
            }

            // Use the actual targetProgramDegreeType for direct registrants
            applicableFee = await prisma.screeningFeeList.findFirst({
                where: {
                    seasonId: currentActiveSeason.id,
                    entryMode: EntryMode.DIRECT_ENTRY, // Portal direct registration implies DIRECT_ENTRY
                    degreeType: targetProgramDegreeType, // Use actual degree type from their selected program
                    isActive: true,
                },
                orderBy: { createdAt: 'desc' },
            });

            if (applicableFee) {
                feeListIdField = 'screeningFeeListId';
            } else {
                console.warn(`No direct entry screening fee found for degree type '${targetProgramDegreeType}' for application (ID: ${parsedApplicationProfileId}) in season ${currentActiveSeason.name}. Checking for Acceptance Fee.`);
            }
        }

        // --- If no screening fee, check for an Acceptance Fee ---
        // This is common for postgraduate programs or others that don't have a separate screening fee
        if (!applicableFee && applicationProfile.targetProgramId) {
            feePurpose = ApplicantPaymentPurpose.ADMISSION_ACCEPTANCE_FEE;

            // Try program-specific acceptance fee first
            applicableFee = await prisma.acceptanceFeeList.findFirst({
                where: {
                    seasonId: currentActiveSeason.id,
                    programId: applicationProfile.targetProgramId,
                    isActive: true,
                },
                orderBy: { createdAt: 'desc' },
            });

            if (applicableFee) {
                feeListIdField = 'acceptanceFeeListId';
            } else {
                const programFacultyId = applicationProfile.targetProgram?.department?.faculty?.id;
                if (programFacultyId) {
                    applicableFee = await prisma.acceptanceFeeList.findFirst({
                        where: {
                            seasonId: currentActiveSeason.id,
                            facultyId: programFacultyId,
                            programId: null, // Only consider faculty-wide, not program-specific if it exists
                            // If you added degreeType to AcceptanceFeeList, you would add it here too:
                            // degreeType: targetProgramDegreeType, // Using the same effective type
                            entryMode: applicationProfile.jambRegNo ? undefined : EntryMode.DIRECT_ENTRY, 
                            isActive: true,
                        },
                        orderBy: { createdAt: 'desc' },
                    });
                    if (applicableFee) {
                        feeListIdField = 'acceptanceFeeListId';
                    }
                }
            }

            if (!applicableFee) {
                console.warn(`No acceptance fee list found for program ${applicationProfile.targetProgram?.name || 'N/A'} (ID: ${applicationProfile.targetProgramId}) or its faculty in season ${currentActiveSeason.name}.`);
            }
        }

        if (!applicableFee) {
            return null; // No applicable screening or acceptance fee found
        }

        const paymentWhereClause = {
            applicationProfileId: parsedApplicationProfileId,
            purpose: feePurpose,
            paymentStatus: 'PAID',
        };

        if (feeListIdField === 'screeningFeeListId' && applicableFee.id) {
            paymentWhereClause.screeningFeeListId = applicableFee.id;
        } else if (feeListIdField === 'acceptanceFeeListId' && applicableFee.id) {
            paymentWhereClause.acceptanceFeeListId = applicableFee.id;
        }

        const hasPaid = await prisma.applicantPayment.count({
            where: paymentWhereClause,
        });

        return {
            amount: applicableFee.amount,
            description: applicableFee.description || `${feePurpose.replace(/_/g, ' ')} for ${currentActiveSeason.name} (Program: ${applicationProfile.targetProgram?.name || 'N/A'})`,
            isPaid: hasPaid > 0,
            purpose: feePurpose,
            feeListItemId: applicableFee.id,
        };

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("[SCREENING_FEE_SERVICE_ERROR] getApplicableFeeForApplicant:", error.message, error.stack);
        throw new AppError('Could not retrieve applicable screening fee.', 500);
    }
};