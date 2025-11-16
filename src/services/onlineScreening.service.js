// src/services/onlineScreening.service.js
import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import { hashPassword } from '../utils/password.utils.js'; // Assuming comparePassword is in auth.service
import config from '../config/index.js'; 
import { ApplicationStatus } from '../generated/prisma/index.js'; 

const screeningListSelection = {
    id: true,
    jambRegNo: true,
    email: true,
    isActive: true,
    lastLogin: true,
    createdAt: true,
    updatedAt: true,
    jambApplicant: {
        select: { 
            id: true, // --- THIS IS THE FIX ---
            name: true, 
            programName: true, 
            entryMode: true, 
            jambScore: true 
        }
    },
    applicationProfile: {
        select: { id: true, applicationStatus: true, hasPaidScreeningFee: true }
    }
};

export const createOnlineScreeningAccount = async (screeningData, creatorUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const {
            jambRegNo,
            email, // Optional email specific to screening account
            password: providedPassword,
            isActive
        } = screeningData;

        if (!jambRegNo) {
            throw new AppError('JAMB Registration Number is required to create a screening account.', 400);
        }
        const trimmedJambRegNo = String(jambRegNo).trim();
        const trimmedEmail = email ? String(email).trim() : null;

        // 1. Check if JambApplicant exists
        const jambApplicant = await prisma.jambApplicant.findUnique({
            where: { jambRegNo: trimmedJambRegNo }
        });
        if (!jambApplicant) {
            throw new AppError(`No JAMB record found for JAMB RegNo: ${trimmedJambRegNo}. Please upload JAMB data first.`, 404);
        }

        // 2. Determine password
        let passwordToHash;
        if (providedPassword && String(providedPassword).trim() !== '') {
            passwordToHash = String(providedPassword).trim();
        } else if (config.onlineScreeningDefaultPassword) {
            passwordToHash = config.onlineScreeningDefaultPassword;
        } else {
            throw new AppError('Password is required, and no default screening password is configured.', 400);
        }
        const hashedPassword = await hashPassword(passwordToHash);

        // 3. Uniqueness checks for OnlineScreeningList
        const existingScreeningByJambRegNo = await prisma.onlineScreeningList.findUnique({
            where: { jambRegNo: trimmedJambRegNo }
        });
        if (existingScreeningByJambRegNo) {
            throw new AppError(`An online screening account for JAMB RegNo ${trimmedJambRegNo} already exists.`, 409);
        }
        if (trimmedEmail) {
            const existingScreeningByEmail = await prisma.onlineScreeningList.findUnique({
                where: { email: trimmedEmail }
            });
            if (existingScreeningByEmail) {
                throw new AppError(`The email '${trimmedEmail}' is already in use for another screening account.`, 409);
            }
        }

        // 4. Create OnlineScreeningList entry and potentially ApplicationProfile in a transaction
        const result = await prisma.$transaction(async (tx) => {
            const newScreeningEntry = await tx.onlineScreeningList.create({
                data: {
                    jambRegNo: trimmedJambRegNo,
                    email: trimmedEmail,
                    password: hashedPassword,
                    isActive: isActive === undefined ? true : Boolean(isActive),
                    // applicationProfile will be linked if/when created
                },
                select: screeningListSelection // Select less here, more after profile creation
            });

            // Find or Create ApplicationProfile
            let appProfile = await tx.applicationProfile.findUnique({
                where: { jambRegNo: trimmedJambRegNo }
                // No include here, we select full screeningListSelection later
            });

            if (!appProfile) {
                // Use email from screening account if provided, else from JAMB, else generate temporary
                const emailForProfile = newScreeningEntry.email || jambApplicant.email || `${trimmedJambRegNo}@yourschool.temp`;
                let finalEmailForProfile = emailForProfile;

                // Ensure uniqueness for ApplicationProfile.email
                const existingAppProfileEmail = await tx.applicationProfile.findUnique({
                    where: { email: emailForProfile }
                });
                if (existingAppProfileEmail) {
                    if (emailForProfile.endsWith('@yourschool.temp') || emailForProfile === jambApplicant.email) {
                        // If temp email or JAMB email conflicts, generate a more unique temp email
                        finalEmailForProfile = `${trimmedJambRegNo}-${Date.now()}@yourschool.temp`;
                    } else {
                        // If a deliberately provided screeningAccount.email conflicts
                        throw new AppError(`The email '${emailForProfile}' for the application profile is already in use.`, 409);
                    }
                }

                appProfile = await tx.applicationProfile.create({
                    data: {
                        jambRegNo: trimmedJambRegNo,
                        onlineScreeningListId: newScreeningEntry.id, // Link to the new screening entry
                        email: finalEmailForProfile,
                        applicationStatus: ApplicationStatus.PENDING_SUBMISSION,
                        // Other defaults for ApplicationProfile
                    }
                });
            } else if (appProfile.onlineScreeningListId !== newScreeningEntry.id) {
                console.warn(`ApplicationProfile for ${trimmedJambRegNo} existed but was linked to a different/null screening ID. Relinking to new ID ${newScreeningEntry.id}.`);
                await tx.applicationProfile.update({
                    where: { id: appProfile.id },
                    data: { onlineScreeningListId: newScreeningEntry.id }
                });
            }
            // Re-fetch screening entry with potentially linked profile for the full return data
            return tx.onlineScreeningList.findUnique({
                where: { id: newScreeningEntry.id },
                select: screeningListSelection
            });
        });

        return result;

    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2002' && error.meta?.target) {
            const target = error.meta.target;
            if (target.includes('jambRegNo')) throw new AppError('Screening account for this JAMB RegNo already exists (P2002).', 409);
            if (target.includes('email')) throw new AppError('Email for screening account already exists (P2002).', 409);
        }
        console.error("[SCREENING_SERVICE_ERROR] CreateScreeningAccount:", error.message, error.stack);
        throw new AppError('Could not create online screening account.', 500);
    }
};

export const batchCreateOnlineScreeningAccounts = async (screeningDataArray, creatorUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        if (!Array.isArray(screeningDataArray) || screeningDataArray.length === 0) {
            throw new AppError('Screening data must be a non-empty array.', 400);
        }

        let createdCount = 0;
        let skippedCount = 0;
        const errors = [];
        const createdScreeningAccounts = [];

        const allJambRegNosInBatch = screeningDataArray.map(s => s.jambRegNo).filter(Boolean);
        const existingJambApplicants = await prisma.jambApplicant.findMany({
            where: { jambRegNo: { in: allJambRegNosInBatch } },
            select: { jambRegNo: true, email: true } // For fallback email
        });
        const existingJambApplicantMap = new Map(existingJambApplicants.map(j => [j.jambRegNo, j]));

        const existingScreeningAccounts = await prisma.onlineScreeningList.findMany({
            where: { jambRegNo: { in: allJambRegNosInBatch } },
            select: { jambRegNo: true }
        });
        const existingScreeningRegNos = new Set(existingScreeningAccounts.map(s => s.jambRegNo));


        for (let i = 0; i < screeningDataArray.length; i++) {
            const data = screeningDataArray[i];
            const { jambRegNo, email, password: providedPassword, isActive } = data;

            if (!jambRegNo) {
                errors.push({ index: i, jambRegNo: 'N/A', error: 'JAMB Registration Number is required.' });
                continue;
            }
            const trimmedJambRegNo = String(jambRegNo).trim();

            if (!existingJambApplicantMap.has(trimmedJambRegNo)) {
                errors.push({ index: i, jambRegNo: trimmedJambRegNo, error: `JAMB Applicant record not found for ${trimmedJambRegNo}.` });
                skippedCount++;
                continue;
            }
            if (existingScreeningRegNos.has(trimmedJambRegNo)) {
                errors.push({ index: i, jambRegNo: trimmedJambRegNo, error: 'Online screening account already exists.' });
                skippedCount++;
                continue;
            }

            let passwordToHash = (providedPassword && String(providedPassword).trim())
                ? String(providedPassword).trim()
                : config.onlineScreeningDefaultPassword;
            if (!passwordToHash) {
                errors.push({ index: i, jambRegNo: trimmedJambRegNo, error: 'Password is required and no default is set.' });
                continue;
            }

            try {
                const hashedPassword = await hashPassword(passwordToHash);
                const newScreeningEntry = await prisma.onlineScreeningList.create({
                    data: {
                        jambRegNo: trimmedJambRegNo,
                        email: email ? String(email).trim() : null,
                        password: hashedPassword,
                        isActive: isActive === undefined ? true : Boolean(isActive),
                    },
                    // select: screeningListSelection // For batch, might be too much data to return
                    select: {id: true, jambRegNo: true}
                });

                // Optionally, create ApplicationProfile here if it doesn't exist
                let appProfile = await prisma.applicationProfile.findUnique({where: {jambRegNo: trimmedJambRegNo}});
                if(!appProfile) {
                    const jambApp = existingJambApplicantMap.get(trimmedJambRegNo);
                    let emailForProfile = email || jambApp?.email || `${trimmedJambRegNo}@yourschool.temp`;
                     const existingEmailProfile = await prisma.applicationProfile.findUnique({ where: { email: emailForProfile }});
                    if(existingEmailProfile) emailForProfile = `${trimmedJambRegNo}-${Date.now()}@yourschool.temp`;

                    await prisma.applicationProfile.create({
                        data: {
                            jambRegNo: trimmedJambRegNo,
                            onlineScreeningListId: newScreeningEntry.id,
                            email: emailForProfile,
                            applicationStatus: ApplicationStatus.PENDING_SUBMISSION
                        }
                    });
                } else if(appProfile.onlineScreeningListId !== newScreeningEntry.id) {
                    await prisma.applicationProfile.update({
                        where: {id: appProfile.id},
                        data: {onlineScreeningListId: newScreeningEntry.id}
                    });
                }

                createdScreeningAccounts.push(newScreeningEntry); // Store minimal info
                createdCount++;
                existingScreeningRegNos.add(trimmedJambRegNo); // Add to set to prevent duplicate processing in this batch
            } catch (individualError) {
                errors.push({ index: i, jambRegNo: trimmedJambRegNo, error: individualError.message || 'Failed to create account.' });
                 console.error(`Error creating screening account for ${trimmedJambRegNo} in batch:`, individualError);
            }
        }

        return {
            message: `Batch processing complete. ${createdCount} accounts created, ${skippedCount} skipped. ${errors.length} errors.`,
            createdCount,
            skippedCount,
            errors,
            createdScreeningAccounts
        };

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("[SCREENING_SERVICE_ERROR] BatchCreateScreeningAccounts:", error.message, error.stack);
        throw new AppError('Could not process batch screening account creation.', 500);
    }
};


export const getOnlineScreeningAccountById = async (id) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const accountId = parseInt(String(id), 10);
        if (isNaN(accountId)) throw new AppError('Invalid ID format.', 400);

        const account = await prisma.onlineScreeningList.findUnique({
            where: { id: accountId },
            select: screeningListSelection
        });
        if (!account) throw new AppError('Online screening account not found.', 404);
        return account;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("[SCREENING_SERVICE_ERROR] GetScreeningAccountById:", error.message, error.stack);
        throw new AppError('Could not retrieve screening account.', 500);
    }
};

export const getAllOnlineScreeningAccounts = async (query) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const { jambRegNo, email, isActive, page = "1", limit = "10" } = query;
        const where = {};

        if (jambRegNo && String(jambRegNo).trim()) where.jambRegNo = { contains: String(jambRegNo).trim() };
        if (email && String(email).trim()) where.email = { contains: String(email).trim() };
        if (isActive !== undefined && isActive !== "") where.isActive = isActive === 'true';

        let pageNum = parseInt(page, 10); let limitNum = parseInt(limit, 10);
        if (isNaN(pageNum) || pageNum < 1) pageNum = 1;
        if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) limitNum = 10;
        const skip = (pageNum - 1) * limitNum;

        const accounts = await prisma.onlineScreeningList.findMany({
            where, select: screeningListSelection,
            orderBy: { createdAt: 'desc' },
            skip, take: limitNum
        });
        const totalAccounts = await prisma.onlineScreeningList.count({ where });

        return {
            accounts, // Use a generic 'accounts' or specific 'onlineScreeningAccounts'
            totalPages: Math.ceil(totalAccounts / limitNum),
            currentPage: pageNum,
            totalAccounts
        };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("[SCREENING_SERVICE_ERROR] GetAllScreeningAccounts:", error.message, error.stack);
        throw new AppError('Could not retrieve screening accounts list.', 500);
    }
};

export const updateOnlineScreeningAccount = async (id, updateData) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const accountId = parseInt(String(id), 10);
        if (isNaN(accountId)) throw new AppError('Invalid ID format.', 400);

        const existingAccount = await prisma.onlineScreeningList.findUnique({ where: { id: accountId } });
        if (!existingAccount) throw new AppError('Screening account not found for update.', 404);

        const dataForDb = {};
        const { email, password, isActive } = updateData;

        if (email !== undefined) {
            const trimmedEmail = email ? String(email).trim() : null;
            if (trimmedEmail && trimmedEmail !== existingAccount.email) {
                const emailTaken = await prisma.onlineScreeningList.findFirst({
                    where: { email: trimmedEmail, id: { not: accountId } }
                });
                if (emailTaken) throw new AppError(`Email '${trimmedEmail}' already in use.`, 409);
            }
            dataForDb.email = trimmedEmail;
        }
        if (password && String(password).trim() !== "") {
            dataForDb.password = await hashPassword(String(password).trim());
        }
        if (isActive !== undefined) {
            dataForDb.isActive = Boolean(isActive);
        }

        if (Object.keys(dataForDb).length === 0) {
            throw new AppError('No valid fields provided for update.', 400);
        }

        const updatedAccount = await prisma.onlineScreeningList.update({
            where: { id: accountId },
            data: dataForDb,
            select: screeningListSelection
        });
        return updatedAccount;
    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2002' && error.meta?.target?.includes('email')) throw new AppError('Email conflict.', 409);
        console.error("[SCREENING_SERVICE_ERROR] UpdateScreeningAccount:", error.message, error.stack);
        throw new AppError('Could not update screening account.', 500);
    }
};

export const deleteOnlineScreeningAccount = async (id) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const accountId = parseInt(String(id), 10);
        if (isNaN(accountId)) throw new AppError('Invalid ID format.', 400);

        const existingAccount = await prisma.onlineScreeningList.findUnique({
            where: { id: accountId },
            // include: { applicationProfile: true } // Check if an application profile is linked
        });
        if (!existingAccount) throw new AppError('Screening account not found for deletion.', 404);

        await prisma.onlineScreeningList.delete({ where: { id: accountId } });
        return { message: `Online screening account for JAMB RegNo ${existingAccount.jambRegNo} deleted.` };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("[SCREENING_SERVICE_ERROR] DeleteScreeningAccount:", error.message, error.stack);
        throw new AppError('Could not delete screening account.', 500);
    }
};

export const batchDeleteOnlineScreeningAccounts = async (ids) => {
    if (!prisma) throw new AppError('Prisma client unavailable', 500);
    if (!Array.isArray(ids) || ids.length === 0) {
        throw new AppError('An array of account IDs is required.', 400);
    }
    const accountIds = ids.map(id => parseInt(id, 10));
    if (accountIds.some(isNaN)) {
        throw new AppError('All provided IDs must be valid integers.', 400);
    }
    
    // Deleting online screening accounts might also require cascading deletes 
    // to ApplicationProfile depending on your schema. Assuming CASCADE is set.
    try {
        const deleteResult = await prisma.onlineScreeningList.deleteMany({
            where: {
                id: { in: accountIds }
            }
        });
        return { message: `${deleteResult.count} screening account(s) deleted successfully.` };
    } catch (error) {
        console.error("Error during batch delete of screening accounts:", error);
        throw new AppError('Could not perform batch deletion.', 500);
    }
};

export const getOnlineScreeningStats = async () => {
    if (!prisma) throw new AppError('Prisma client unavailable', 500);

    try {
        const totalScreened = await prisma.onlineScreeningList.count();

        // Count for UTME and DE by joining with JambApplicant
        const entryModeCounts = await prisma.jambApplicant.groupBy({
            by: ['entryMode'],
            where: {
                onlineScreeningAccount: {
                    isNot: null // Only count those who have a screening account
                }
            },
            _count: {
                entryMode: true,
            },
        });

        // Get today's date at the beginning (midnight)
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Count accounts created today
        const createdToday = await prisma.onlineScreeningList.count({
            where: {
                createdAt: {
                    gte: today // gte means "greater than or equal to"
                }
            }
        });

        const utmeCount = entryModeCounts.find(c => c.entryMode === 'UTME')?._count.entryMode || 0;
        const deCount = entryModeCounts.find(c => c.entryMode === 'DIRECT_ENTRY')?._count.entryMode || 0;
        
        return {
            totalScreened,
            createdToday,
            utmeCount,
            deCount
        };
    } catch (error) {
        console.error("Error fetching online screening stats:", error);
        throw new AppError('Could not retrieve screening statistics.', 500);
    }
};