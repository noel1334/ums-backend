import prisma from '../config/prisma.js';
import config from '../config/index.js';
import AppError from '../utils/AppError.js';
import { ApplicationStatus, EntryMode, DegreeType } from '../generated/prisma/index.js';
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
            phone: true,
            targetProgramId: true, 
            bioData: { // Fetch bioData for applicant name fallback
                select: {
                    firstName: true,
                    lastName: true,
                    gender: true,
                    dateOfBirth: true,
                    nationality: true
                }
            },
            targetProgram: { // Ensure targetProgram includes department, faculty, and degreeType for filtering
                select: { 
                    id: true,
                    name: true,
                    programCode: true,
                    degree: true,
                    degreeType: true, // IMPORTANT: Include degreeType
                    department: {
                        select: {
                            id: true,
                            name: true,
                            faculty: {
                                select: {
                                    id: true,
                                    name: true
                                }
                            }
                        }
                    }
                }
            },
            onlineScreeningList: {
                select: {
                    jambApplicant: { // Correctly nested under 'select' for the relation
                        select: { name: true, entryMode: true, jambSeason: { select: { name: true } } }
                    }
                }
            },
            uploadedDocuments: {
                where: {
                    documentType: 'PROFILE_PHOTO'
                },
                select: {
                    fileUrl: true,
                    documentType: true
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
        
        const {
            search,
            status,
            programId,
            seasonId,
            departmentId, // NEW: departmentId filter
            facultyId,    // NEW: facultyId filter
            degreeType,   // NEW: degreeType filter
            page = "1",
            limit = "10"
        } = query;
        
        const where = {};
        const filters = [];

        if (search) {
            filters.push({
                OR: [
                    { jambRegNo: { contains: search } }, // Removed mode: 'insensitive' based on previous issue
                    // Search bioData names too
                    { applicationProfile: { bioData: { OR: [{ firstName: { contains: search } }, { lastName: { contains: search } }] } } }, // Removed mode: 'insensitive'
                    { applicationProfile: { onlineScreeningList: { jambApplicant: { name: { contains: search } } } } } // Removed mode: 'insensitive'
                ]
            });
        }
        
        if (status && status !== 'all') {
            filters.push({ status: status });
        }
        
        const applicationProfileWhere = {};
        // Initialize targetProgram filter if it will be used
        let targetProgramFilter = {};

        if (programId && programId !== 'all') {
            targetProgramFilter.id = parseInt(programId, 10);
        }
        if (seasonId && seasonId !== 'all') {
            applicationProfileWhere.onlineScreeningList = {
                jambApplicant: {
                    jambSeasonId: parseInt(seasonId, 10)
                }
            };
        }

        // NEW Filters: Department, Faculty, DegreeType (all via applicationProfile.targetProgram)
        if (departmentId && departmentId !== 'all') {
            targetProgramFilter.departmentId = parseInt(departmentId, 10);
        }

        if (facultyId && facultyId !== 'all') {
            targetProgramFilter.department = {
                facultyId: parseInt(facultyId, 10)
            };
        }

        if (degreeType && degreeType !== 'all') {
            // Validate degreeType against your Prisma enum if necessary (or rely on Prisma's own validation)
            if (!Object.values(DegreeType).includes(degreeType)) {
                throw new AppError(`Invalid degree type: ${degreeType}.`, 400);
            }
            targetProgramFilter.degreeType = degreeType;
        }

        // If any targetProgram filters were set, add them to applicationProfileWhere
        if (Object.keys(targetProgramFilter).length > 0) {
            applicationProfileWhere.targetProgram = targetProgramFilter;
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
                select: physicalScreeningSelection,
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

        const record = await prisma.physicalScreeningList.findUnique({
            where: { applicationProfileId: profileId },
            select: physicalScreeningSelection
        });
        return record;
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
    
    const updatedRecord = await prisma.$transaction(async (tx) => {
        const screeningUpdates = {};
        if (status) screeningUpdates.status = status;
        if (remarks !== undefined) screeningUpdates.remarks = remarks;
        
        const updatedScreeningRecord = await tx.physicalScreeningList.update({
            where: { id: recordId },
            data: screeningUpdates,
            select: physicalScreeningSelection
        });

        if (targetProgramId) {
            await tx.applicationProfile.update({
                where: { id: existingRecord.applicationProfileId },
                data: { targetProgramId: parseInt(targetProgramId, 10) }
            });
        }
        
        if (status && (status === ApplicationStatus.SCREENING_PASSED || status === ApplicationStatus.SCREENING_FAILED)) {
             await tx.applicationProfile.update({
                 where: { id: existingRecord.applicationProfileId },
                 data: { applicationStatus: status }
             });
        }
        
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

        if (existingRecord.admissionOffer) {
            throw new AppError('Cannot delete screening record. An admission offer is linked to it.', 400);
        }

        await prisma.physicalScreeningList.delete({ where: { id: recordId } });
        return { message: `Physical screening record for applicant ${existingRecord.jambRegNo} deleted successfully.` };
    } catch (error) {
        if (error instanceof AppError) throw error;
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
    
    const screeningRecord = await prisma.physicalScreeningList.upsert({
        where: { applicationProfileId },
        update: {},
        create: {
            applicationProfileId: profile.id,
            jambRegNo: profile.jambRegNo,
            status: 'UNDER_REVIEW',
        }
    });

    return screeningRecord;
};

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
        skipDuplicates: true,
    });

    return { createdCount: result.count };
};

export const batchDeletePhysicalScreeningRecords = async (recordIds) => {
    if (!recordIds || !Array.isArray(recordIds) || recordIds.length === 0) {
        throw new AppError('An array of screening record IDs is required.', 400);
    }
    
    const recordsWithOffersCount = await prisma.physicalScreeningList.count({
        where: {
            id: { in: recordIds },
            admissionOffer: { isNot: null }
        }
    });

    if (recordsWithOffersCount > 0) {
        throw new AppError(`Cannot delete. ${recordsWithOffersCount} of the selected records are linked to an admission offer.`, 400);
    }

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
    const { recordIds, screeningDate, screeningStartDate, screeningEndDate, screeningVenue, remarks } = payload;
    
    if (!recordIds || !Array.isArray(recordIds) || recordIds.length === 0) {
        throw new AppError('An array of screening record IDs is required.', 400);
    }
    if (!screeningDate || !screeningStartDate || !screeningEndDate) {
        throw new AppError('Screening date, start date, and end date are all required.', 400);
    }

    const dataToUpdate = {
        screeningDate: new Date(screeningDate),
        screeningStartDate: new Date(screeningStartDate),
        screeningEndDate: new Date(screeningEndDate),
    };
    if (screeningVenue !== undefined) dataToUpdate.screeningVenue = screeningVenue;
    if (remarks !== undefined) dataToUpdate.remarks = remarks;

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
                    // CRITICAL FIX: Ensure 'onlineScreeningList' is correctly selected
                    onlineScreeningList: {
                        select: { // <--- Added 'select' here for the relation
                            jambApplicant: {
                                select: { name: true, entryMode: true }
                            }
                        }
                    },
                    targetProgram: { select: { name: true } },
                    bioData: { // NEW: Select bioData for robust name fallback
                        select: { firstName: true, lastName: true }
                    }
                }
            }
        }
    });

    const applicantsToEmail = records.map(rec => {
        if (!rec.applicationProfile || !rec.applicationProfile.email) return null;
        
        const formatDate = (date) => date ? new Date(date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'To Be Announced';
        const formatTime = (date) => date ? new Date(date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : 'N/A';
        
        const applicantBioData = rec.applicationProfile.bioData;
        const applicantJambData = rec.applicationProfile.onlineScreeningList?.jambApplicant;

        // MODIFIED: Robust applicant_name derivation
        const applicant_name = (applicantBioData?.firstName && applicantBioData?.lastName)
            ? `${applicantBioData.firstName} ${applicantBioData.lastName}`.trim()
            : applicantJambData?.name || 'Applicant'; // Fallback to 'Applicant'

        return {
            email: rec.applicationProfile.email,
            applicant_name: applicant_name, // Use the robust name
            program_name: rec.applicationProfile.targetProgram?.name ?? 'your chosen course',
            screening_date: formatDate(rec.screeningDate),
            screening_start_time: formatTime(rec.screeningStartDate),
            screening_end_time: formatTime(rec.screeningEndDate),
            entryMode: applicantJambData?.entryMode // Use applicantJambData
        };
    }).filter(app => app !== null);

    if (applicantsToEmail.length === 0) {
        throw new AppError('No valid applicants with emails found for the selected records.', 404);
    }
    
    for (const applicant of applicantsToEmail) {
        let extraCredentialText = '';
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