import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import { hashPassword } from '../utils/password.utils.js';
import config from '../config/index.js';
import { ApplicationStatus, DegreeType } from '../generated/prisma/index.js';

// MODIFIED: screeningListSelection to include onlineScreeningRequired
const screeningListSelection = {
    id: true,
    jambRegNo: true, // Can be null now
    email: true,
    isActive: true,
    lastLogin: true,
    createdAt: true,
    updatedAt: true,
    jambApplicant: {
        select: {
            id: true,
            name: true,
            programName: true,
            entryMode: true,
            jambScore: true
        }
    },
    applicationProfile: {
        select: {
            id: true,
            applicationStatus: true,
            hasPaidScreeningFee: true,
            targetProgram: { // NEW: Include target program to check degreeType, jambRequired, and onlineScreeningRequired
                select: { id: true, name: true, degreeType: true, jambRequired: true, onlineScreeningRequired: true }
            }
        }
    }
};

// MODIFIED: createOnlineScreeningAccount to handle both JAMB and non-JAMB applicants
export const createOnlineScreeningAccount = async (screeningData, creatorUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const {
            jambRegNo,
            email,
            password: providedPassword,
            isActive,
            targetProgramId // NEW: For direct applications, provide target program
        } = screeningData;

        const trimmedJambRegNo = jambRegNo ? String(jambRegNo).trim() : null;
        const trimmedEmail = email ? String(email).trim() : null;

        if (!trimmedJambRegNo && !trimmedEmail) {
            throw new AppError('Either JAMB Registration Number or Email is required to create a screening account.', 400);
        }

        let targetProgram = null;
        if (targetProgramId) {
            const pTargetProgramId = parseInt(targetProgramId, 10);
            if (isNaN(pTargetProgramId)) throw new AppError('Invalid Target Program ID format.', 400);
            targetProgram = await prisma.program.findUnique({
                where: { id: pTargetProgramId },
                select: { id: true, name: true, degreeType: true, jambRequired: true, onlineScreeningRequired: true } // NEW: Select onlineScreeningRequired
            });
            if (!targetProgram) throw new AppError(`Target Program with ID ${targetProgramId} not found.`, 404);
        }

        // --- Validation based on input and target program ---
        let jambApplicant = null;
        if (trimmedJambRegNo) {
            jambApplicant = await prisma.jambApplicant.findUnique({
                where: { jambRegNo: trimmedJambRegNo }
            });
            if (!jambApplicant) {
                throw new AppError(`No JAMB record found for JAMB RegNo: ${trimmedJambRegNo}. Please upload JAMB data first.`, 404);
            }
            // If a jambRegNo is provided, we assume it's a JAMB-related application.
            // Validate DegreeType for JAMB applications
            if (targetProgram && ![DegreeType.UNDERGRADUATE].includes(targetProgram.degreeType)) {
                 throw new AppError(`Program '${targetProgram.name}' (Degree Type: ${targetProgram.degreeType}) is not typically for JAMB applicants. Please select an undergraduate program or use direct application.`, 400);
            }
        } else { // No JAMB RegNo provided (direct application)
            if (!trimmedEmail) throw new AppError('Email is required for direct applications (without JAMB RegNo).', 400);
            if (!targetProgram || targetProgram.jambRequired) {
                throw new AppError('A valid target program that does NOT require JAMB is needed for applications without a JAMB RegNo.', 400);
            }
            // Validate DegreeType for direct applications
            if (targetProgram && [DegreeType.UNDERGRADUATE].includes(targetProgram.degreeType) && targetProgram.jambRequired) {
                throw new AppError(`Program '${targetProgram.name}' (Degree Type: ${targetProgram.degreeType}) requires JAMB. Direct applications are for programs like ND, HND, NCE, PGD, Masters, or PhD.`, 400);
            }
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
        if (trimmedJambRegNo) {
            const existingScreeningByJambRegNo = await prisma.onlineScreeningList.findUnique({
                where: { jambRegNo: trimmedJambRegNo }
            });
            if (existingScreeningByJambRegNo) {
                throw new AppError(`An online screening account for JAMB RegNo ${trimmedJambRegNo} already exists.`, 409);
            }
        }
        if (trimmedEmail) { // This check is for the email provided for the screening account login itself
            const existingScreeningByEmail = await prisma.onlineScreeningList.findUnique({
                where: { email: trimmedEmail }
            });
            if (existingScreeningByEmail) {
                throw new AppError(`The email '${trimmedEmail}' is already in use for another screening account.`, 409);
            }
        }
        
        // 4. Create OnlineScreeningList entry and ApplicationProfile in a transaction
        const result = await prisma.$transaction(async (tx) => {
            const newScreeningEntry = await tx.onlineScreeningList.create({
                data: {
                    jambRegNo: trimmedJambRegNo, // Will be null for direct applications
                    email: trimmedEmail,
                    password: hashedPassword,
                    isActive: isActive === undefined ? true : Boolean(isActive),
                },
                select: { id: true, email: true, jambRegNo: true } // Select minimal initially
            });

            // FIX: Use findFirst instead of findUnique for OR conditions.
            let appProfile = await tx.applicationProfile.findFirst({
                where: {
                    OR: [
                        trimmedJambRegNo ? { jambRegNo: trimmedJambRegNo } : undefined,
                        trimmedEmail ? { email: trimmedEmail } : undefined,
                    ].filter(Boolean), // Filter out undefined to avoid Prisma errors
                }
            });

            if (!appProfile) {
                // Determine email for ApplicationProfile. Prioritize provided email, then JAMB applicant email, then a temp email
                const emailForProfile = newScreeningEntry.email || jambApplicant?.email || `${trimmedJambRegNo || `direct-${Date.now()}`}@yourschool.temp`;
                let finalEmailForProfile = emailForProfile;

                // Ensure uniqueness for ApplicationProfile.email
                const existingAppProfileByEmail = await tx.applicationProfile.findUnique({
                    where: { email: emailForProfile }
                });
                if (existingAppProfileByEmail) {
                     // If conflicts, generate a more unique temp email unless it's the deliberately provided email
                    if (emailForProfile.endsWith('@yourschool.temp') || emailForProfile === jambApplicant?.email) {
                        finalEmailForProfile = `${trimmedJambRegNo || `direct-${Date.now()}`}-${Date.now()}@yourschool.temp`;
                    } else {
                        throw new AppError(`The email '${emailForProfile}' for the application profile is already in use by another applicant profile.`, 409);
                    }
                }

                appProfile = await tx.applicationProfile.create({
                    data: {
                        jambRegNo: trimmedJambRegNo, // Will be null for direct applications
                        onlineScreeningListId: newScreeningEntry.id, // Link to the new screening entry
                        email: finalEmailForProfile,
                        applicationStatus: ApplicationStatus.PENDING_SUBMISSION,
                        targetProgramId: targetProgram ? targetProgram.id : undefined // Link to target program if provided
                    }
                });
            } else {
                // If ApplicationProfile already exists, ensure it's linked to this new screening account
                if (appProfile.onlineScreeningListId !== newScreeningEntry.id) {
                    console.warn(`ApplicationProfile for ${trimmedJambRegNo || trimmedEmail} existed but was linked to a different/null screening ID. Relinking to new ID ${newScreeningEntry.id}.`);
                    await tx.applicationProfile.update({
                        where: { id: appProfile.id },
                        data: {
                            onlineScreeningListId: newScreeningEntry.id,
                            targetProgramId: targetProgram ? targetProgram.id : appProfile.targetProgramId // Update program if provided, otherwise keep existing
                        }
                    });
                }
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
            if (target.includes('email')) throw new AppError('Email for screening account or application profile already exists (P2002).', 409);
        }
        console.error("[SCREENING_SERVICE_ERROR] CreateScreeningAccount:", error.message, error.stack);
        throw new AppError('Could not create online screening account.', 500);
    }
};

// MODIFIED: batchCreateOnlineScreeningAccounts to handle both JAMB and non-JAMB applicants
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
        const allEmailsInBatch = screeningDataArray.map(s => s.email).filter(Boolean);
        const allTargetProgramIdsInBatch = screeningDataArray.map(s => s.targetProgramId).filter(Boolean).map(id => parseInt(id, 10)).filter(id => !isNaN(id));

        // Fetch existing data for pre-validation (efficiency)
        const existingJambApplicants = await prisma.jambApplicant.findMany({
            where: { jambRegNo: { in: allJambRegNosInBatch } },
            select: { jambRegNo: true, email: true } // For fallback email
        });
        const existingJambApplicantMap = new Map(existingJambApplicants.map(j => [j.jambRegNo, j]));

        const existingScreeningAccounts = await prisma.onlineScreeningList.findMany({
            where: {
                OR: [
                    { jambRegNo: { in: allJambRegNosInBatch } },
                    { email: { in: allEmailsInBatch } }
                ]
            },
            select: { jambRegNo: true, email: true }
        });
        const existingScreeningRegNos = new Set(existingScreeningAccounts.map(s => s.jambRegNo).filter(Boolean));
        const existingScreeningEmails = new Set(existingScreeningAccounts.map(s => s.email).filter(Boolean));

        const existingPrograms = await prisma.program.findMany({
            where: { id: { in: allTargetProgramIdsInBatch } },
            select: { id: true, name: true, degreeType: true, jambRequired: true, onlineScreeningRequired: true } // NEW: Select onlineScreeningRequired
        });
        const existingProgramMap = new Map(existingPrograms.map(p => [p.id, p]));

        for (let i = 0; i < screeningDataArray.length; i++) {
            const data = screeningDataArray[i];
            const { jambRegNo, email, password: providedPassword, isActive, targetProgramId } = data;

            const trimmedJambRegNo = jambRegNo ? String(jambRegNo).trim() : null;
            const trimmedEmail = email ? String(email).trim() : null;
            const pTargetProgramId = targetProgramId ? parseInt(targetProgramId, 10) : null;
            const targetProgram = pTargetProgramId ? existingProgramMap.get(pTargetProgramId) : null;

            let rowErrors = [];

            if (!trimmedJambRegNo && !trimmedEmail) {
                rowErrors.push('Either JAMB Registration Number or Email is required.');
            }

            if (trimmedJambRegNo) {
                if (!existingJambApplicantMap.has(trimmedJambRegNo)) {
                    rowErrors.push(`JAMB Applicant record not found for ${trimmedJambRegNo}.`);
                }
                if (existingScreeningRegNos.has(trimmedJambRegNo)) {
                    rowErrors.push(`Online screening account for JAMB RegNo ${trimmedJambRegNo} already exists.`);
                }
                // Validate DegreeType for JAMB applications in batch
                if (targetProgram && ![DegreeType.UNDERGRADUATE].includes(targetProgram.degreeType)) {
                     rowErrors.push(`Program '${targetProgram.name}' (Degree Type: ${targetProgram.degreeType}) is not typically for JAMB applicants.`);
                }
            } else { // No JAMB RegNo, must be direct application
                if (!trimmedEmail) {
                    rowErrors.push('Email is required for direct applications (without JAMB RegNo).');
                }
                if (trimmedEmail && existingScreeningEmails.has(trimmedEmail)) {
                    rowErrors.push(`Online screening account for email '${trimmedEmail}' already exists.`);
                }
                if (!targetProgram || targetProgram.jambRequired) {
                    rowErrors.push('A valid target program that does NOT require JAMB is required for applications without a JAMB RegNo.');
                }
                // Validate DegreeType for direct applications in batch
                if (targetProgram && [DegreeType.UNDERGRADUATE].includes(targetProgram.degreeType) && targetProgram.jambRequired) {
                    rowErrors.push(`Program '${targetProgram.name}' (Degree Type: ${targetProgram.degreeType}) requires JAMB. Direct applications are for programs like ND, HND, NCE, PGD, Masters, or PhD.`);
                }
            }

            let passwordToHash = (providedPassword && String(providedPassword).trim())
                ? String(providedPassword).trim()
                : config.onlineScreeningDefaultPassword;
            if (!passwordToHash) {
                rowErrors.push('Password is required and no default is set.');
            }

            if (rowErrors.length > 0) {
                errors.push({ index: i, jambRegNo: trimmedJambRegNo || 'N/A', email: trimmedEmail || 'N/A', error: rowErrors.join(' ') });
                skippedCount++;
                continue;
            }

            try {
                const hashedPassword = await hashPassword(passwordToHash);
                const newScreeningEntry = await prisma.onlineScreeningList.create({
                    data: {
                        jambRegNo: trimmedJambRegNo,
                        email: trimmedEmail,
                        password: hashedPassword,
                        isActive: isActive === undefined ? true : Boolean(isActive),
                    },
                    select: {id: true, jambRegNo: true, email: true}
                });

                // FIX: Use findFirst instead of findUnique for OR conditions.
                let appProfile = await prisma.applicationProfile.findFirst({
                    where: {
                        OR: [
                            trimmedJambRegNo ? { jambRegNo: trimmedJambRegNo } : undefined,
                            trimmedEmail ? { email: trimmedEmail } : undefined,
                        ].filter(Boolean),
                    }
                });

                if(!appProfile) {
                    const jambApp = trimmedJambRegNo ? existingJambApplicantMap.get(trimmedJambRegNo) : null;
                    let emailForProfile = newScreeningEntry.email || jambApp?.email || `${trimmedJambRegNo || `direct-${Date.now()}`}@yourschool.temp`;
                     const existingEmailProfile = await prisma.applicationProfile.findUnique({ where: { email: emailForProfile }});
                    if(existingEmailProfile) emailForProfile = `${trimmedJambRegNo || `direct-${Date.now()}`}-${Date.now()}@yourschool.temp`;

                    await prisma.applicationProfile.create({
                        data: {
                            jambRegNo: trimmedJambRegNo,
                            onlineScreeningListId: newScreeningEntry.id,
                            email: emailForProfile,
                            applicationStatus: ApplicationStatus.PENDING_SUBMISSION,
                            targetProgramId: targetProgram ? targetProgram.id : undefined
                        }
                    });
                } else if(appProfile.onlineScreeningListId !== newScreeningEntry.id) {
                    await prisma.applicationProfile.update({
                        where: {id: appProfile.id},
                        data: {
                            onlineScreeningListId: newScreeningEntry.id,
                            targetProgramId: targetProgram ? targetProgram.id : appProfile.targetProgramId
                        }
                    });
                }

                createdScreeningAccounts.push(newScreeningEntry);
                createdCount++;
                if (trimmedJambRegNo) existingScreeningRegNos.add(trimmedJambRegNo);
                if (trimmedEmail) existingScreeningEmails.add(trimmedEmail);

            } catch (individualError) {
                errors.push({ index: i, jambRegNo: trimmedJambRegNo || 'N/A', email: trimmedEmail || 'N/A', error: individualError.message || 'Failed to create account.' });
                 console.error(`Error creating screening account for ${trimmedJambRegNo || trimmedEmail} in batch:`, individualError);
                 skippedCount++;
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

// MODIFIED: getAllOnlineScreeningAccounts to search by email as well
export const getAllOnlineScreeningAccounts = async (query) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const { jambRegNo, email, isActive, page = "1", limit = "10" } = query;
        const where = {};

        // Search by JAMB RegNo OR Email
        const searchFilters = [];
        if (jambRegNo && String(jambRegNo).trim()) {
            searchFilters.push({ jambRegNo: { contains: String(jambRegNo).trim() } });
        }
        if (email && String(email).trim()) {
            searchFilters.push({ email: { contains: String(email).trim() } });
        }

        if (searchFilters.length > 0) {
            where.OR = searchFilters;
        }

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
            accounts,
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
        // The message should be more generic as jambRegNo can be null
        return { message: `Online screening account (ID: ${accountId}${existingAccount.jambRegNo ? `, JAMB RegNo: ${existingAccount.jambRegNo}` : ''}) deleted.` };
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
        if (error instanceof AppError) throw error;
        console.error("Error during batch delete of screening accounts:", error);
        throw new AppError('Could not perform batch deletion.', 500);
    }
};

// MODIFIED: getOnlineScreeningStats to properly count all screening accounts
export const getOnlineScreeningStats = async () => {
    if (!prisma) throw new AppError('Prisma client unavailable', 500);

    try {
        const totalScreened = await prisma.onlineScreeningList.count();

        // Count by EntryMode (only for those linked to JambApplicant)
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

        // Count direct applications (those in onlineScreeningList with null jambRegNo)
        const directEntryScreenedCount = await prisma.onlineScreeningList.count({
            where: {
                jambRegNo: null,
                applicationProfile: {
                    isNot: null // Ensure there's a linked application profile for it to be a valid "application"
                }
            }
        });

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const createdToday = await prisma.onlineScreeningList.count({
            where: {
                createdAt: {
                    gte: today
                }
            }
        });

        const utmeCount = entryModeCounts.find(c => c.entryMode === 'UTME')?._count.entryMode || 0;
        const deCountFromJamb = entryModeCounts.find(c => c.entryMode === 'DIRECT_ENTRY')?._count.entryMode || 0;
        
        return {
            totalScreened,
            createdToday,
            utmeCount,
            deCount: deCountFromJamb + directEntryScreenedCount // Combine DE from JAMB and direct applications
        };
    } catch (error) {
        console.error("Error fetching online screening stats:", error);
        throw new AppError('Could not retrieve screening statistics.', 500);
    }
};