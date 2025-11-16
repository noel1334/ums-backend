// src/services/physicalScreening.service.js
import prisma from '../config/prisma.js';
import config from '../config/index.js';
import AppError from '../utils/AppError.js';
import { ApplicationStatus, EntryMode } from '../generated/prisma/index.js';
import { sendEmail } from '../utils/email.js'; 

const physicalScreeningSelection = {
    id: true,
    applicationProfileId: true,
    jambRegNo: true,
    screeningDate: true,
    screenedBy: true,
    status: true,
    remarks: true,
    createdAt: true,
    updatedAt: true,
    applicationProfile: {
        select: {
            id: true,
            jambRegNo: true,
            email: true,
            targetProgramId: true, 
            targetProgram: {
                select: { name: true }
            },
            onlineScreeningList: {
                select: {
                    jambApplicant: {
                        select: { name: true, entryMode: true }
                    }
                }
            },
            uploadedDocuments: {
                where: {
                    documentType: 'PROFILE_PHOTO'
                },
                select: {
                    fileUrl: true,
                    documentType: true // <--- ADD THIS LINE HERE!
                },
                take: 1
            }
        }
    },
    admissionOffer: {
        select: { id: true, offerDate: true, isAccepted: true }
    }
};

export const createPhysicalScreeningRecord = async (screeningData, creatorUserIdOrName) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        // ... rest of the function ...
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("[PHYSICAL_SCREENING_SERVICE] CreateRecord:", error);
        throw new AppError('Could not create physical screening record.', 500);
    }
};

export const getAllPhysicalScreeningRecords = async (query) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        
        // --- THIS IS THE FIX ---
        const {
            search,
            status,
            programId,
            seasonId, // Correctly receive seasonId
            page = "1",
            limit = "10"
        } = query;
        
        const where = {};
        const filters = [];

        // Add search logic for name and JAMB number
        if (search) {
            filters.push({
                OR: [
                    { jambRegNo: { contains: search } },
                    { applicationProfile: { onlineScreeningList: { jambApplicant: { name: { contains: search } } } } }
                ]
            });
        }
        
        if (status && status !== 'all') {
            filters.push({ status: status });
        }
        
        // Add filtering for program and season on the nested ApplicationProfile
        const applicationProfileWhere = {};
        if (programId && programId !== 'all') {
            applicationProfileWhere.targetProgramId = parseInt(programId, 10);
        }
        if (seasonId && seasonId !== 'all') {
            // Filter by the season associated with the applicant
            applicationProfileWhere.onlineScreeningList = {
                jambApplicant: {
                    jambSeasonId: parseInt(seasonId, 10)
                }
            };
        }

        if (Object.keys(applicationProfileWhere).length > 0) {
            filters.push({ applicationProfile: applicationProfileWhere });
        }
        
        if (filters.length > 0) {
            where.AND = filters;
        }

        const pageNum = parseInt(page, 10) || 1;
        const limitNum = parseInt(limit, 10) || 10;
        const skip = (pageNum - 1) * limitNum;

        const [records, totalRecords] = await prisma.$transaction([
            prisma.physicalScreeningList.findMany({
                where,
                select: physicalScreeningSelection, // Your existing selection object
                orderBy: { createdAt: 'desc' },
                skip,
                take: limitNum
            }),
            prisma.physicalScreeningList.count({ where })
        ]);

        return {
            records,
            totalPages: Math.ceil(totalRecords / limitNum),
            currentPage: pageNum,
            totalRecords
        };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("[PHYSICAL_SCREENING_SERVICE] GetAllRecords:", error);
        throw new AppError('Could not retrieve physical screening records.', 500);
    }
};

export const getPhysicalScreeningRecordById = async (id) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const recordId = parseInt(id, 10);
        if (isNaN(recordId)) throw new AppError('Invalid ID format.', 400);

        const record = await prisma.physicalScreeningList.findUnique({
            where: { id: recordId },
            select: physicalScreeningSelection
        });
        if (!record) throw new AppError('Physical screening record not found.', 404);
        return record;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("[PHYSICAL_SCREENING_SERVICE] GetById:", error.message, error.stack);
        throw new AppError('Could not retrieve physical screening record.', 500);
    }
};

export const getPhysicalScreeningByApplicationProfileId = async (applicationProfileId) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const profileId = parseInt(applicationProfileId, 10);
        if (isNaN(profileId)) throw new AppError('Invalid Application Profile ID format.', 400);

        const record = await prisma.physicalScreeningList.findUnique({ // It's unique per profileId
            where: { applicationProfileId: profileId },
            select: physicalScreeningSelection
        });
        // It's okay if not found, might mean screening hasn't happened. Client should handle.
        // if (!record) throw new AppError('Physical screening record not found for this application profile.', 404);
        return record; // Can be null
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("[PHYSICAL_SCREENING_SERVICE] GetByAppProfileId:", error.message, error.stack);
        throw new AppError('Could not retrieve physical screening record.', 500);
    }
};


export const updatePhysicalScreeningRecord = async (id, updateData, updaterUserIdOrName) => {
    const recordId = parseInt(id, 10);
    if (isNaN(recordId)) throw new AppError('Invalid ID format.', 400);

    const { status, remarks, targetProgramId } = updateData;

    const existingRecord = await prisma.physicalScreeningList.findUnique({
        where: { id: recordId },
    });
    if (!existingRecord) {
        throw new AppError('Physical screening record not found for update.', 404);
    }
    
    // Use a transaction to update both the screening record and the application profile
    const updatedRecord = await prisma.$transaction(async (tx) => {
        // 1. Update the PhysicalScreeningList itself
        const screeningUpdates = {};
        if (status) screeningUpdates.status = status;
        if (remarks !== undefined) screeningUpdates.remarks = remarks;
        
        const updatedScreeningRecord = await tx.physicalScreeningList.update({
            where: { id: recordId },
            data: screeningUpdates,
            select: physicalScreeningSelection
        });

        // 2. If a targetProgramId is provided, update the related ApplicationProfile
        if (targetProgramId) {
            await tx.applicationProfile.update({
                where: { id: existingRecord.applicationProfileId },
                data: { targetProgramId: parseInt(targetProgramId, 10) }
            });
        }
        
        // 3. If screening status changes, update the ApplicationProfile status too
        if (status && (status === ApplicationStatus.SCREENING_PASSED || status === ApplicationStatus.SCREENING_FAILED)) {
             await tx.applicationProfile.update({
                 where: { id: existingRecord.applicationProfileId },
                 data: { applicationStatus: status }
             });
        }
        
        // Re-fetch the record within the transaction to ensure all data is consistent
        return tx.physicalScreeningList.findUnique({
            where: { id: recordId },
            select: physicalScreeningSelection,
        });
    });

    return updatedRecord;
};
export const deletePhysicalScreeningRecord = async (id) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const recordId = parseInt(id, 10);
        if (isNaN(recordId)) throw new AppError('Invalid ID format.', 400);

        const existingRecord = await prisma.physicalScreeningList.findUnique({
            where: { id: recordId },
            include: { admissionOffer: true }
        });
        if (!existingRecord) throw new AppError('Physical screening record not found for deletion.', 404);

        // Business Rule: Cannot delete if an admission offer has been made based on this screening
        if (existingRecord.admissionOffer) {
            throw new AppError('Cannot delete screening record. An admission offer is linked to it.', 400);
        }

        await prisma.physicalScreeningList.delete({ where: { id: recordId } });
        return { message: `Physical screening record for applicant ${existingRecord.jambRegNo} deleted successfully.` };
    } catch (error) {
        if (error instanceof AppError) throw error;
        // P2003 could happen if AdmissionOffer has ON DELETE RESTRICT on physicalScreeningId
        if (error.code === 'P2003') {
            throw new AppError('Cannot delete this record as it is referenced by an admission offer.', 400);
        }
        console.error("[PHYSICAL_SCREENING_SERVICE] DeleteRecord:", error.message, error.stack);
        throw new AppError('Could not delete physical screening record.', 500);
    }
};

export const addSingleProfileToScreening = async (applicationProfileId) => {
    const profile = await prisma.applicationProfile.findUnique({
        where: { id: applicationProfileId },
        select: { jambRegNo: true, id: true, applicationStatus: true }
    });

    if (!profile) {
        throw new AppError(`Application Profile with ID ${applicationProfileId} not found.`, 404);
    }
    
    // Use upsert to create if not exists, and do nothing if it exists.
    const screeningRecord = await prisma.physicalScreeningList.upsert({
        where: { applicationProfileId },
        update: {}, // Do nothing if it already exists
        create: {
            applicationProfileId: profile.id,
            jambRegNo: profile.jambRegNo,
            status: 'UNDER_REVIEW',
        }
    });

    return screeningRecord;
};

// --- ADD THIS FUNCTION FOR BATCH CREATION ---
export const addBatchProfilesToScreening = async (applicationProfileIds) => {
    if (!applicationProfileIds || !Array.isArray(applicationProfileIds) || applicationProfileIds.length === 0) {
        throw new AppError('An array of applicationProfileIds is required.', 400);
    }

    const profiles = await prisma.applicationProfile.findMany({
        where: {
            id: { in: applicationProfileIds }
        },
        select: { id: true, jambRegNo: true }
    });

    if (profiles.length === 0) {
        throw new AppError('None of the provided profile IDs were valid.', 404);
    }

    const screeningDataToCreate = profiles.map(profile => ({
        applicationProfileId: profile.id,
        jambRegNo: profile.jambRegNo,
        status: 'UNDER_REVIEW'
    }));
    const result = await prisma.physicalScreeningList.createMany({
        data: screeningDataToCreate,
        skipDuplicates: true, // This is the key!
    });

    return { createdCount: result.count };
};

export const batchDeletePhysicalScreeningRecords = async (recordIds) => {
    if (!recordIds || !Array.isArray(recordIds) || recordIds.length === 0) {
        throw new AppError('An array of screening record IDs is required.', 400);
    }
    
    // Optional: Add a business rule check.
    const recordsWithOffersCount = await prisma.physicalScreeningList.count({
        where: {
            id: { in: recordIds },
            admissionOffer: { isNot: null }
        }
    });

    if (recordsWithOffersCount > 0) {
        throw new AppError(`Cannot delete. ${recordsWithOffersCount} of the selected records are linked to an admission offer.`, 400);
    }

    // Proceed with deletion
    const deleteResult = await prisma.physicalScreeningList.deleteMany({
        where: {
            id: { in: recordIds },
        },
    });

    return { 
        message: `${deleteResult.count} screening record(s) deleted successfully.`,
        deletedCount: deleteResult.count
    };
};


export const batchUpdateScreeningRecords = async (payload) => {
    // --- Destructure the correct fields from the payload ---
    const { recordIds, screeningDate, screeningStartDate, screeningEndDate } = payload;
    
    if (!recordIds || !Array.isArray(recordIds) || recordIds.length === 0) {
        throw new AppError('An array of screening record IDs is required.', 400);
    }
    // --- Update validation ---
    if (!screeningDate || !screeningStartDate || !screeningEndDate) {
        throw new AppError('Screening date, start date, and end date are all required.', 400);
    }

    const dataToUpdate = {
        screeningDate: new Date(screeningDate),
        screeningStartDate: new Date(screeningStartDate),
        screeningEndDate: new Date(screeningEndDate),
    };

    const updateResult = await prisma.physicalScreeningList.updateMany({
        where: {
            id: { in: recordIds },
        },
        data: dataToUpdate,
    });

    return {
        message: `${updateResult.count} screening record(s) have been updated with the new schedule.`,
        updatedCount: updateResult.count,
    };
};

export const batchEmailScreeningRecords = async (payload) => {
    const { recordIds, subject, message } = payload;
    if (!recordIds || !Array.isArray(recordIds) || recordIds.length === 0) {
        throw new AppError('An array of screening record IDs is required.', 400);
    }

    const records = await prisma.physicalScreeningList.findMany({
        where: { id: { in: recordIds } },
        select: {
            screeningDate: true,
            screeningStartDate: true,
            screeningEndDate: true,
            applicationProfile: {
                select: {
                    email: true,
                    targetProgram: { select: { name: true } },
                    onlineScreeningList: {
                        select: { jambApplicant: { select: { name: true, entryMode: true } } }
                    }
                }
            }
        }
    });

    const applicantsToEmail = records.map(rec => {
        if (!rec.applicationProfile || !rec.applicationProfile.email) return null;
        
        const formatDate = (date) => date ? new Date(date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'To Be Announced';
        const formatTime = (date) => date ? new Date(date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : 'N/A';
        
        const applicantData = rec.applicationProfile.onlineScreeningList?.jambApplicant;

        return {
            email: rec.applicationProfile.email,
            applicant_name: applicantData?.name ?? 'Applicant',
            program_name: rec.applicationProfile.targetProgram?.name ?? 'your chosen course',
            screening_date: formatDate(rec.screeningDate),
            screening_start_time: formatTime(rec.screeningStartDate),
            screening_end_time: formatTime(rec.screeningEndDate),
            entryMode: applicantData?.entryMode 
        };
    }).filter(app => app !== null);

    if (applicantsToEmail.length === 0) {
        throw new AppError('No valid applicants with emails found for the selected records.', 404);
    }
    
    for (const applicant of applicantsToEmail) {
        let extraCredentialText = '';
        // This line will now work because EntryMode is imported
        if (applicant.entryMode === EntryMode.DIRECT_ENTRY) {
            extraCredentialText = `8. Original and photocopy of your Higher National Diploma (HND), National Diploma (ND), or other A'Level certificate.`;
        }
        
        const personalizedMessage = message
            .replace(/{applicant_name}/g, applicant.applicant_name)
            .replace(/{program_name}/g, applicant.program_name)
            .replace(/{screening_date}/g, applicant.screening_date)
            .replace(/{screening_start_time}/g, applicant.screening_start_time)
            .replace(/{screening_end_time}/g, applicant.screening_end_time)
            .replace(/{extra_credential_requirement}/g, extraCredentialText)
            .replace(/{screening_portal_link}/g, config.screeningPortalUrl);

        try {
            await sendEmail({
                to: applicant.email,
                subject: subject,
                text: personalizedMessage,
                html: `<div style="font-family: sans-serif; line-height: 1.6;">${personalizedMessage.replace(/\n/g, '<br>')}</div>`
            });
        } catch (error) {
            console.error(`Failed to send email to ${applicant.email}:`, error);
        }
    }
    
    return { message: `Email invitations have been dispatched to ${applicantsToEmail.length} candidates.` };
};

