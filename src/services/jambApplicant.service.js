import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import { EntryMode, Gender } from '../generated/prisma/index.js';
import { sendEmail } from '../utils/email.js';

const applicantSelection = {
    id: true,
    jambRegNo: true,
    name: true,
    email: true,
    phoneNumber: true, // Added for consistency
    programName: true,
    entryMode: true,
    gender: true,
    jambScore: true,
    deGrade: true,
    dateOfBirth: true,
    jambYear: true,
    jambSeasonId: true,
    uploadedAt: true,
    uploadedBy: true,
    jambSeason: { select: { id: true, name: true } },
    onlineScreeningAccount: { select: { id: true } } 
};

export const createJambApplicant = async (data, uploaderUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);

        const {
            jambRegNo, name, email, phoneNumber, programName,
            entryMode, gender, dateOfBirth, jambScore, deGrade,
            jambYear, jambSeasonId
        } = data;

        if (!jambRegNo || !name || !programName || !entryMode || !jambYear || !jambSeasonId || !dateOfBirth) {
            throw new AppError('Required fields are missing: JAMB RegNo, Name, Program, Entry Mode, JAMB Year, Season, and Date of Birth.', 400);
        }
        if (entryMode === 'UTME' && (jambScore === null || jambScore === undefined)) {
            throw new AppError('JAMB Score is required for UTME applicants.', 400);
        }
        if (entryMode === 'DIRECT_ENTRY' && !deGrade) {
            throw new AppError('DE Grade is required for Direct Entry applicants.', 400);
        }
        if (!Object.values(EntryMode).includes(entryMode)) throw new AppError('Invalid Entry Mode.', 400);
        if (gender && !Object.values(Gender).includes(gender)) throw new AppError('Invalid Gender.', 400);

        const pJambSeasonId = parseInt(jambSeasonId, 10);
        if (isNaN(pJambSeasonId)) {
            throw new AppError('Invalid Season ID format.', 400);
        }

        const seasonExists = await prisma.season.findUnique({ where: { id: pJambSeasonId } });
        if (!seasonExists) throw new AppError(`JAMB Season ID ${pJambSeasonId} not found.`, 404);

        // Date of Birth validation and conversion using Date object
        let parsedDateOfBirth = null;
        if (dateOfBirth) {
            try {
                const date = new Date(dateOfBirth);
                if (!isNaN(date.getTime())) { // Check for valid date
                    parsedDateOfBirth = date;
                } else {
                    console.warn(`Invalid dateOfBirth format: ${dateOfBirth}. Setting to NULL.`);
                    // Optionally log the invalid date for debugging
                }
            } catch (error) {
                console.warn(`Error parsing dateOfBirth: ${dateOfBirth}. Setting to NULL. Error:`, error);
                // Optionally log the full error
            }
        }

        const dataForPrisma = {
            jambRegNo,
            name,
            email: email || null,
            phoneNumber: phoneNumber || null,
            programName,
            entryMode,
            gender: gender || null,
            dateOfBirth: parsedDateOfBirth,  // Use parsed or null value
            jambScore: (jambScore !== null && jambScore !== undefined) ? parseInt(jambScore, 10) : null,
            deGrade: deGrade || null,
            jambYear: jambYear || null,
            jambSeasonId: pJambSeasonId,
            uploadedBy: uploaderUser.email
        };

        const newApplicant = await prisma.jambApplicant.create({
            data: dataForPrisma,
            select: applicantSelection
        });

        return newApplicant;
    } catch (error) {
        if (error instanceof AppError) throw error;

        if (error.code === 'P2002') {
            const target = error.meta?.target || [];
            if (target.includes('jambRegNo')) throw new AppError('JAMB Registration Number already exists.', 409);
            if (target.includes('email')) throw new AppError('Email provided is already in use.', 409);
            if (target.includes('phoneNumber')) throw new AppError('Phone number provided is already in use.', 409);
        }

        console.error("Prisma Error creating JAMB applicant:", error);
        throw new AppError('Could not create JAMB applicant.', 500);
    }
};


export const batchCreateJambApplicants = async (applicantsDataArray, uploaderUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        if (!Array.isArray(applicantsDataArray) || applicantsDataArray.length === 0) {
            throw new AppError('Applicant data must be a non-empty array.', 400);
        }

        const errors = [];
        const validApplicantsToCreate = [];

        // Fetch existing data for pre-validation (efficiency)
        const existingApplicants = await prisma.jambApplicant.findMany({
            select: { jambRegNo: true, email: true, phoneNumber: true }
        });
        const existingJambRegNos = new Set(existingApplicants.map(app => app.jambRegNo));
        const existingEmails = new Set(existingApplicants.filter(app => app.email).map(app => app.email));
        const existingPhones = new Set(existingApplicants.filter(app => app.phoneNumber).map(app => app.phoneNumber));

        for (const [index, data] of applicantsDataArray.entries()) {
            const {
                jambRegNo, name, email, phoneNumber, programName,
                entryMode, gender, dateOfBirth, jambScore, deGrade,
                jambYear, jambSeasonId
            } = data;

            // --- Sanitization and Type Coercion ---
            const sJambRegNo = String(jambRegNo || '').trim();
            const sName = String(name || '').trim();
            const sProgramName = String(programName || '').trim();
            const sEntryMode = String(entryMode || '').trim();
            const sJambYear = String(jambYear || '').trim();
            const sEmail = email ? String(email).trim() : null;
            const sPhoneNumber = phoneNumber ? String(phoneNumber).trim() : null;
            const sDeGrade = deGrade ? String(deGrade).trim() : null;

            let pJambScore = (jambScore !== null && jambScore !== undefined) ? parseInt(jambScore, 10) : null;
            let pJambSeasonId = (jambSeasonId !== null && jambSeasonId !== undefined) ? parseInt(jambSeasonId, 10) : null;

            // Date of Birth validation and conversion
            let pDateOfBirth = null;
            if (dateOfBirth) {
                try {
                    const date = new Date(dateOfBirth);
                    if (!isNaN(date.getTime())) {
                        pDateOfBirth = date;
                    } else {
                        console.warn(`Invalid dateOfBirth format for row ${index + 1} (JambRegNo: ${sJambRegNo || 'N/A'}).  Setting to NULL.`);
                    }
                } catch (error) {
                    console.warn(`Error parsing dateOfBirth for row ${index + 1} (JambRegNo: ${sJambRegNo || 'N/A'}). Setting to NULL.  Error:`, error);
                }
            }

            let rowErrors = [];

            if (!sJambRegNo) rowErrors.push('JAMB RegNo is missing.');
            if (!sName) rowErrors.push('Name is missing.');
            if (!sProgramName) rowErrors.push('Program Name is missing.');
            if (!sEntryMode) rowErrors.push('Entry Mode is missing.');
            if (!sJambYear) rowErrors.push('JAMB Year is missing.');

            if (sJambRegNo && existingJambRegNos.has(sJambRegNo)) {
                rowErrors.push('JAMB Registration Number already exists.');
            }
            if (sEmail && existingEmails.has(sEmail)) {
                rowErrors.push('Email already exists.');
            }
            if (sPhoneNumber && existingPhones.has(sPhoneNumber)) {
                rowErrors.push('Phone number already exists.');
            }

            if (sEntryMode === 'UTME' && (pJambScore === null || isNaN(pJambScore))) {
                rowErrors.push('JAMB Score is required for UTME applicants.');
            }
            if (sEntryMode === 'DIRECT_ENTRY' && !sDeGrade) {
                rowErrors.push('DE Grade is required for Direct Entry applicants.');
            }
            if (!Object.values(EntryMode).includes(sEntryMode)) {
                rowErrors.push('Invalid Entry Mode.');
            }
            if (gender && !Object.values(Gender).includes(gender)) {
                rowErrors.push('Invalid Gender.');
            }
            if (pJambSeasonId === null || isNaN(pJambSeasonId)) {
                rowErrors.push('JAMB Season ID is missing or invalid.');
            }

            if (rowErrors.length > 0) {
                errors.push({ index, jambRegNo: sJambRegNo || 'N/A', name: sName || 'N/A', error: rowErrors.join(' ') });
            } else {
                validApplicantsToCreate.push({
                    jambRegNo: sJambRegNo,
                    name: sName,
                    email: sEmail,
                    phoneNumber: sPhoneNumber,
                    programName: sProgramName,
                    entryMode: sEntryMode,
                    gender: gender,
                    dateOfBirth: pDateOfBirth, // Use parsed or null value
                    jambScore: pJambScore,
                    deGrade: sDeGrade,
                    jambYear: sJambYear,
                    jambSeasonId: pJambSeasonId,
                    uploadedBy: uploaderUser.email,
                });

                existingJambRegNos.add(sJambRegNo);
                if (sEmail) existingEmails.add(sEmail);
                if (sPhoneNumber) existingPhones.add(sPhoneNumber);
            }
        }

        let createdCount = 0;
        if (validApplicantsToCreate.length > 0) {
            const result = await prisma.jambApplicant.createMany({
                data: validApplicantsToCreate,
                skipDuplicates: true,
            });
            createdCount = result.count;
        }

        const totalProcessedCount = applicantsDataArray.length;
        const totalFailedValidation = errors.length;
        const skippedByPrismaDuplicates = validApplicantsToCreate.length - createdCount;
        const totalSkipped = totalFailedValidation + skippedByPrismaDuplicates;

        let message = `Batch import complete. Created: ${createdCount} applicants. Skipped or had errors: ${totalSkipped} applicants.`;
        let status = 'success';
        if (totalFailedValidation > 0 || skippedByPrismaDuplicates > 0) {
            status = 'partial_success';
        }
        if (createdCount === 0 && totalProcessedCount > 0) {
            status = 'fail';
        }

        return {
            status: status,
            message: message,
            data: {
                createdCount: createdCount,
                skippedCount: totalSkipped,
                errors: errors,
            }
        };

    } catch (error) {
        if (error instanceof AppError) throw error;

        console.error("Error in batchCreateJambApplicants:", error);
        throw new AppError('Could not process batch import due to an unexpected server error.', 500);
    }
};
export const getAllJambApplicants = async (query) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        
        // --- FIX: Renamed 'jambSeason' to 'jambSeasonName' to avoid conflict ---
        const { search, programName, entryMode, jambSeasonName, sortBy, page = 1, limit = 10 } = query;
        const where = {};

        // --- FIX: Removed `mode: 'insensitive'` from all clauses ---
        if (search) {
          where.OR = [
            { name: { contains: search } },
            { jambRegNo: { contains: search } },
            { email: { contains: search } },
          ];
        }
        if (programName && programName !== 'all-programs') {
            where.programName = { contains: programName };
        }
        if (entryMode && entryMode !== 'all-types' && Object.values(EntryMode).includes(entryMode)) {
            where.entryMode = entryMode;
        }
        // --- FIX: Filter by the name on the related jambSeason model ---
        if (jambSeasonName) {
            where.jambSeason = {
                name: { contains: jambSeasonName }
            };
        }

        let orderBy = { uploadedAt: 'desc' };
        if (sortBy && sortBy !== 'default') {
          const [field, direction] = sortBy.split(':');
          if (field && direction && ['jambScore'].includes(field)) { // Whitelist sortable fields
            orderBy = { [field]: direction };
          }
        }

        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;

        const applicants = await prisma.jambApplicant.findMany({
            where, 
            select: applicantSelection,
            orderBy,
            skip, 
            take: limitNum
        });
        const totalApplicants = await prisma.jambApplicant.count({ where });
        return { applicants, totalPages: Math.ceil(totalApplicants / limitNum), currentPage: pageNum, totalApplicants };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching JAMB applicants: ", error);
        throw new AppError('Could not retrieve JAMB applicants.', 500);
    }
};

export const getJambApplicantByJambRegNo = async (jambRegNo) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        if (!jambRegNo) throw new AppError('JAMB Registration Number is required.', 400);

        const applicant = await prisma.jambApplicant.findUnique({
            where: { jambRegNo: jambRegNo },
            select: {
                jambRegNo: true, name: true, programName: true, entryMode: true, jambScore: true,
                jambSeason: { select: { name: true } },
                onlineScreeningAccount: { select: { id: true } } // Corrected from 'application'
            }
        });

        if (!applicant) throw new AppError('JAMB applicant record not found.', 404);
        return applicant;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching JAMB applicant by RegNo:", error);
        throw new AppError('Could not retrieve JAMB applicant.', 500);
    }
};

export const getJambApplicantById = async (id) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const applicantId = parseInt(id, 10);
         if (isNaN(applicantId)) throw new AppError('Invalid ID format.', 400);

        const applicant = await prisma.jambApplicant.findUnique({
            where: { id: applicantId },
            select: applicantSelection
        });
        if (!applicant) throw new AppError('JAMB applicant record not found.', 404);
        return applicant;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching JAMB applicant by ID:", error);
        throw new AppError('Could not retrieve JAMB applicant.', 500);
    }
};

export const updateJambApplicant = async (id, updateData) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const applicantId = parseInt(id, 10);
        if (isNaN(applicantId)) throw new AppError('Invalid ID format.', 400);

        const existingApplicant = await prisma.jambApplicant.findUnique({
            where: { id: applicantId },
        });

        if (!existingApplicant) {
            throw new AppError('JAMB applicant not found for update.', 404);
        }

        if (updateData.jambRegNo && updateData.jambRegNo !== existingApplicant.jambRegNo) {
            throw new AppError('JAMB Registration Number cannot be changed.', 400);
        }

        const allowedFields = [
            'name', 'email', 'phoneNumber', 'programName', 'entryMode', 'gender', 'jambScore', 
            'jambSeasonId', 'deGrade', 'dateOfBirth', 'jambYear'
        ];
        
        const dataForDb = {};

        for (const key of allowedFields) {
            if (updateData.hasOwnProperty(key)) {
                const value = updateData[key];
                
                if (key === 'entryMode' && value && !Object.values(EntryMode).includes(value)) {
                    throw new AppError('Invalid Entry Mode.', 400);
                }
                if (key === 'gender' && value && !Object.values(Gender).includes(value)) {
                    throw new AppError('Invalid Gender.', 400);
                }
                
                if (key === 'jambScore' || key === 'jambSeasonId') {
                    dataForDb[key] = value !== null ? parseInt(value, 10) : null;
                } 
                 else if (key === 'dateOfBirth' && value) {
                dataForDb[key] = new Date(value);
                }
                else {
                    dataForDb[key] = value;
                }
            }
        }

        if (Object.keys(dataForDb).length === 0) {
            throw new AppError('No valid fields to update.', 400);
        }

        const updatedApplicant = await prisma.jambApplicant.update({
            where: { id: applicantId },
            data: dataForDb,
            select: applicantSelection
        });

        return updatedApplicant;
    } catch (error) {
        if (error instanceof AppError) throw error;
        
        if (error.code === 'P2002') { 
            const field = error.meta?.target?.[0] || 'field';
            throw new AppError(`The provided ${field} is already in use by another applicant.`, 409);
        }
        
        console.error("Prisma Error updating JAMB applicant:", error);
        throw new AppError('Could not update JAMB applicant.', 500);
    }
};

export const deleteJambApplicant = async (id) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const applicantId = parseInt(id, 10);
        if (isNaN(applicantId)) throw new AppError('Invalid ID format.', 400);

        const existingApplicant = await prisma.jambApplicant.findUnique({
            where: { id: applicantId },
            include: { onlineScreeningAccount: true }
        });

        if (!existingApplicant) {
            throw new AppError('JAMB applicant not found for deletion.', 404);
        }

        if (existingApplicant.onlineScreeningAccount) {
            throw new AppError('Cannot delete. An online screening account already exists for this applicant.', 400);
        }

        await prisma.jambApplicant.delete({ where: { id: applicantId } });
        return { message: 'JAMB applicant record deleted successfully.' };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error deleting JAMB applicant:", error);
        throw new AppError('Could not delete JAMB applicant.', 500);
    }
};

export const batchDeleteJambApplicants = async (ids) => {
    if (!prisma) throw new AppError('Prisma client unavailable', 500);
    if (!Array.isArray(ids) || ids.length === 0) {
        throw new AppError('An array of applicant IDs is required for batch deletion.', 400);
    }

    // Ensure all IDs are integers to prevent injection
    const applicantIds = ids.map(id => parseInt(id, 10));
    if (applicantIds.some(isNaN)) {
        throw new AppError('All provided IDs must be valid integers.', 400);
    }
    
    // Optional but recommended: Check if any of these applicants have started the screening process
    const applicantsWithAccounts = await prisma.jambApplicant.count({
        where: {
            id: { in: applicantIds },
            onlineScreeningAccount: { isNot: null }
        }
    });

    if (applicantsWithAccounts > 0) {
        throw new AppError(`Cannot delete. ${applicantsWithAccounts} of the selected applicants have started the application process.`, 400);
    }
    
    // Perform the batch deletion
    try {
        const deleteResult = await prisma.jambApplicant.deleteMany({
            where: {
                id: { in: applicantIds }
            }
        });
        
        return { message: `${deleteResult.count} applicant(s) deleted successfully.` };
    } catch (error) {
        console.error("Error during batch delete of JAMB applicants:", error);
        throw new AppError('Could not perform batch deletion.', 500);
    }
};

export const batchUpdateJambApplicants = async (ids, updateData) => {
    if (!prisma) throw new AppError('Prisma client unavailable', 500);
    if (!Array.isArray(ids) || ids.length === 0) {
        throw new AppError('An array of applicant IDs is required.', 400);
    }

    const { jambYear, jambSeasonId } = updateData;
    if (!jambYear && !jambSeasonId) {
        throw new AppError('At least one field (jambYear or jambSeasonId) must be provided for update.', 400);
    }

    const applicantIds = ids.map(id => parseInt(id, 10));
    if (applicantIds.some(isNaN)) {
        throw new AppError('All provided IDs must be valid integers.', 400);
    }
    
    // --- THIS IS THE FIX ---
    // Create an empty object, then conditionally add properties to it.
    const dataToUpdate = {};
    if (jambYear) {
        dataToUpdate.jambYear = String(jambYear);
    }
    if (jambSeasonId) {
        dataToUpdate.jambSeasonId = parseInt(jambSeasonId, 10);
    }
    // ----------------------
    
    try {
        const result = await prisma.jambApplicant.updateMany({
            where: {
                id: { in: applicantIds }
            },
            data: dataToUpdate
        });

        return { message: `${result.count} applicant(s) updated successfully.` };
    } catch (error) {
        console.error("Error during batch update of JAMB applicants:", error);
        throw new AppError('Could not perform batch update.', 500);
    }
};

export const batchEmailJambApplicants = async (ids, subject, messageTemplate) => {
    if (!prisma) throw new AppError('Prisma client unavailable', 500);
    if (!Array.isArray(ids) || ids.length === 0) {
        throw new AppError('An array of applicant IDs is required.', 400);
    }

    const applicants = await prisma.jambApplicant.findMany({
        where: { 
            id: { in: ids },
            email: { not: null, contains: '@' } // Only get valid-looking emails
        },
        select: {
            name: true, email: true, jambRegNo: true, programName: true, jambYear: true,
            jambSeason: { select: { name: true } }
        }
    });

    if (applicants.length === 0) {
        throw new AppError('No valid applicants with email addresses found in the selected batch.', 404);
    }
    
    const screeningLink = process.env.SCREENING_PORTAL_URL || 'http://localhost:8080/screening-login';
    let successfulEmails = 0;
    const errors = [];

    // This loop now calls the same efficient sendEmail function every time.
    for (const applicant of applicants) {
        try {
            let message = messageTemplate
                .replace(/{applicant_name}/g, applicant.name)
                .replace(/{jamb_reg_no}/g, applicant.jambRegNo)
                .replace(/{program_name}/g, applicant.programName)
                .replace(/{jamb_year}/g, applicant.jambYear || 'N/A')
                .replace(/{jamb_season}/g, applicant.jambSeason?.name || 'the current')
                .replace(/{screening_link}/g, screeningLink);

            await sendEmail({
                to: applicant.email,
                subject: subject,
                html: message.replace(/\n/g, '<br>')
            });
            successfulEmails++;
        } catch (error) {
            console.error(`Failed to send email to ${applicant.email}:`, error.message);
            errors.push({ email: applicant.email, error: error.message });
        }
    }
    
    // Check if some emails failed but others succeeded
    if (errors.length > 0 && successfulEmails > 0) {
         return {
            message: `Process complete with some errors. Sent: ${successfulEmails}. Failed: ${errors.length}.`,
            successfulEmails,
            errors
        };
    }
    // All emails failed, likely a config issue
    if (errors.length > 0 && successfulEmails === 0) {
       throw new AppError('Failed to send all emails. Please check your SMTP credentials in the .env file.', 500);
    }
    
    return {
        message: `Email process complete. ${successfulEmails} emails were sent successfully.`,
        successfulEmails,
        errors: []
    };
};