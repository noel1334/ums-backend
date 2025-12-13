import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import { ApplicationStatus, EntryMode, DocumentType, DegreeType } from '../generated/prisma/index.js';
import { sendEmail } from '../utils/email.js';
import config from '../config/index.js';


const offerSelection = {
    id: true,
    applicationProfileId: true,
    offeredProgramId: true,
    offeredLevelId: true,
    admissionSeasonId: true,
    admissionSemesterId: true,
    offerDate: true,
    acceptanceDeadline: true,
    isAccepted: true,
    acceptanceDate: true,
    rejectionReason: true,
    generatedStudentRegNo: true,
    createdStudentId: true,
    admissionLetterUrl: true,
    hasPaidAcceptanceFee: true,
    createdAt: true,
    updatedAt: true,
    physicalScreeningId: true,
    
    applicationProfile: {
        select: {
            id: true,
            jambRegNo: true,
            email: true,
            phone: true,
            bioData: { // Include bioData for applicant name
                select: {
                    firstName: true,
                    lastName: true,
                    gender: true,
                    dateOfBirth: true
                }
            },
            contactInfo: { 
                select: {
                    residentialAddress: true,
                }
            },
            uploadedDocuments: {
                where: {
                    documentType: DocumentType.PROFILE_PHOTO
                },
                select: {
                    fileUrl: true,
                    documentType: true
                },
                take: 1
            },
            onlineScreeningList: {
                select: {
                    jambApplicant: { select: { name: true, entryMode: true, gender: true } }
                }
            }
        }
    },
    offeredProgram: {
        select: {
            id: true,
            name: true,
            programCode: true,
            degree: true,
            degreeType: true, // Already here, good for filtering
            duration: true,
            modeOfStudy: true,
            department: {
                select: {
                    id: true,
                    name: true, // IMPORTANT: Ensure name is selected for filtering/display
                    faculty: { // IMPORTANT: Ensure faculty is selected for filtering/cascading
                        select: {
                            id: true,
                            name: true // IMPORTANT: Ensure name is selected for filtering/display
                        }
                    }
                }
            }
        }
    },
    offeredLevel: { select: { id: true, name: true, value: true, degreeType: true, order: true } },
    admissionSeason: { select: { id: true, name: true } },
    admissionSemester: { select: { id: true, name: true, type: true } },
    createdStudent: { select: { id: true, regNo: true, name: true } }
};

export const getProgramAdmissionStats = async (seasonId) => {
    let seasonIdNum = null;
    if (seasonId) {
        seasonIdNum = parseInt(seasonId, 10);
        if (isNaN(seasonIdNum)) {
            throw new AppError('Invalid Season ID format for program statistics.', 400);
        }
    }

    const offers = await prisma.admissionOffer.findMany({
        where: {
            isAccepted: true,
            ...(seasonIdNum && { admissionSeasonId: seasonIdNum })
        },
        select: {
            offeredProgram: { select: { id: true, name: true } },
            applicationProfile: {
                select: {
                    onlineScreeningList: {
                        select: { // Correct nesting
                            jambApplicant: {
                                select: { entryMode: true }
                            }
                        }
                    }
                }
            }
        }
    });

    const statsMap = new Map();

    offers.forEach(offer => {
        const programId = offer.offeredProgram.id;
        const programName = offer.offeredProgram.name;
        const entryMode = offer.applicationProfile.onlineScreeningList?.jambApplicant?.entryMode;

        if (!statsMap.has(programId)) {
            statsMap.set(programId, {
                programId: programId,
                programName: programName,
                totalAdmitted: 0,
                utmeAdmitted: 0,
                deAdmitted: 0,
            });
        }

        const stats = statsMap.get(programId);
        stats.totalAdmitted++;
        if (entryMode === EntryMode.UTME) {
            stats.utmeAdmitted++;
        } else if (entryMode === EntryMode.DIRECT_ENTRY) {
            stats.deAdmitted++;
        } else if (!entryMode && offer.applicationProfile.jambRegNo === null) {
             stats.deAdmitted++;
        }
    });

    return Array.from(statsMap.values()).sort((a, b) => b.totalAdmitted - a.totalAdmitted);
};

export const createAdmissionOffer = async (offerData) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const {
            applicationProfileId, offeredProgramId, offeredLevelId,
            admissionSeasonId, admissionSemesterId, acceptanceDeadline,
            acceptanceFeeListId
        } = offerData;

        if (!applicationProfileId || !offeredProgramId || !offeredLevelId || !admissionSeasonId || !admissionSemesterId) {
            throw new AppError('Application Profile ID, Offered Program, Level, Season, and Semester are required.', 400);
        }

        const pAppProfileId = parseInt(applicationProfileId, 10);
        const pOfferedProgramId = parseInt(offeredProgramId, 10);
        const pOfferedLevelId = parseInt(offeredLevelId, 10);
        const pAdmissionSeasonId = parseInt(admissionSeasonId, 10);
        const pAdmissionSemesterId = parseInt(admissionSemesterId, 10);
        const pAcceptanceFeeListId = acceptanceFeeListId ? parseInt(acceptanceFeeListId, 10) : null;

        const program = await prisma.program.findUnique({
            where: { id: pOfferedProgramId },
            select: { id: true, name: true, degreeType: true }
        });
        if (!program) throw new AppError(`Offered Program ID ${pOfferedProgramId} not found.`, 404);

        // Validate existence of related entities
        const [appProfile, level, season, semester] = await Promise.all([
            prisma.applicationProfile.findUnique({ where: { id: pAppProfileId } }),
            // FIX: Query level using both ID and the program's degreeType
            prisma.level.findUnique({
                where: {
                    id: pOfferedLevelId,
                    degreeType: program.degreeType
                }
            }),
            prisma.season.findUnique({ where: { id: pAdmissionSeasonId } }),
            prisma.semester.findUnique({ where: { id: pAdmissionSemesterId } }),
        ]);

        if (!appProfile) throw new AppError(`Application Profile ID ${pAppProfileId} not found.`, 404);
        if (appProfile.applicationStatus !== ApplicationStatus.SCREENING_PASSED && appProfile.applicationStatus !== ApplicationStatus.ADMITTED) {
            throw new AppError(`Cannot create offer. Applicant status is '${appProfile.applicationStatus}'. Expected SCREENING_PASSED or ADMITTED.`, 400);
        }
        if (!level) throw new AppError(`Offered Level ID ${pOfferedLevelId} for degree type ${program.degreeType} not found.`, 404);
        if (!season) throw new AppError(`Admission Season ID ${pAdmissionSeasonId} not found.`, 404);
        if (!semester) throw new AppError(`Admission Semester ID ${pAdmissionSemesterId} not found.`, 404);


        const existingOffer = await prisma.admissionOffer.findUnique({
            where: { applicationProfileId: pAppProfileId }
        });
        if (existingOffer) {
            throw new AppError('An admission offer already exists for this applicant. Use update if changes are needed.', 409);
        }

        const physicalScreeningRecord = await prisma.physicalScreeningList.findUnique({
            where: { applicationProfileId: pAppProfileId },
            select: { id: true }
        });


        const newOffer = await prisma.admissionOffer.create({
            data: {
                applicationProfileId: pAppProfileId,
                physicalScreeningId: physicalScreeningRecord?.id || null,
                offeredProgramId: pOfferedProgramId,
                offeredLevelId: pOfferedLevelId,
                admissionSeasonId: pAdmissionSeasonId,
                admissionSemesterId: pAdmissionSemesterId,
                acceptanceFeeListId: pAcceptanceFeeListId,
                offerDate: new Date(),
                acceptanceDeadline: acceptanceDeadline ? new Date(acceptanceDeadline) : null,
            },
            select: offerSelection
        });

        await prisma.applicationProfile.update({
            where: { id: pAppProfileId },
            data: { applicationStatus: ApplicationStatus.ADMITTED }
        });

        await prisma.physicalScreeningList.update({
            where: { applicationProfileId: pAppProfileId },
            data: { status: ApplicationStatus.ADMITTED }
        });


        return newOffer;
    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2002' && error.meta?.target?.includes('applicationProfileId')) {
            throw new AppError('An admission offer already exists for this applicant (P2002).', 409);
        }
        console.error("Error creating admission offer:", error.message, error.stack);
        throw new AppError('Could not create admission offer.', 500);
    }
};

export const createBatchAdmissionOffers = async (applicationProfileIds, offerDetails) => {
    const { admissionSeasonId, admissionSemesterId, acceptanceDeadline } = offerDetails;
    if (!applicationProfileIds || applicationProfileIds.length === 0) {
        throw new AppError('An array of Application Profile IDs is required.', 400);
    }
    if (!admissionSeasonId || !admissionSemesterId || !acceptanceDeadline) {
        throw new AppError('Admission Season, Semester, and Acceptance Deadline are required.', 400);
    }

    // 1. Fetch eligible candidates and their related physicalScreening record ID, and TARGET PROGRAM.
    const candidates = await prisma.applicationProfile.findMany({
        where: {
            id: { in: applicationProfileIds },
            applicationStatus: ApplicationStatus.SCREENING_PASSED,
        },
        include: {
            targetProgram: {
                select: { id: true, degreeType: true }
            },
            onlineScreeningList: {
                include: { jambApplicant: { select: { entryMode: true } } }
            },
            admissionOffer: true,
            physicalScreening: {
                select: {
                    id: true
                }
            }
        }
    });

    // 2. Filter out candidates who are not eligible or already have an offer or no target program
    const eligibleCandidates = candidates.filter(c => !c.admissionOffer && c.targetProgramId && c.targetProgram);
    if (eligibleCandidates.length === 0) {
        throw new AppError('No eligible candidates found. They may already have an offer, did not pass screening, or lack a target program.', 400);
    }

    // 3. Pre-fetch ALL relevant levels to avoid N+1 queries inside the loop.
    const allLevels = await prisma.level.findMany({
        select: { id: true, name: true, value: true, degreeType: true, order: true }
    });

    // Create a more robust map for quick lookup: (identifier, degreeType) -> Level.id
    const levelMap = new Map();
    allLevels.forEach(level => {
        levelMap.set(`${level.name}-${level.degreeType}`, level.id);
        levelMap.set(`${level.order}-${level.degreeType}`, level.id);
    });

    // 4. Prepare the data for creating multiple admission offers
    const offersToCreate = eligibleCandidates.map(candidate => {
        const programDegreeType = candidate.targetProgram.degreeType;
        const entryMode = candidate.onlineScreeningList.jambApplicant?.entryMode;

        let offeredLevelIdentifier;
        let levelLookupKey;

        switch (programDegreeType) {
            case DegreeType.UNDERGRADUATE:
                offeredLevelIdentifier = (entryMode === EntryMode.DIRECT_ENTRY) ? "200 Level" : "100 Level";
                levelLookupKey = `${offeredLevelIdentifier}-${programDegreeType}`;
                break;
            
            case DegreeType.ND:
            case DegreeType.NCE:
            case DegreeType.HND:
            case DegreeType.POSTGRADUATE_DIPLOMA:
            case DegreeType.MASTERS:
            case DegreeType.PHD:
            case DegreeType.CERTIFICATE:
            case DegreeType.DIPLOMA:
                offeredLevelIdentifier = 1; // Order of the level
                levelLookupKey = `${offeredLevelIdentifier}-${programDegreeType}`;
                break;
            
            default:
                throw new AppError(`Database setup error: Unhandled DegreeType '${programDegreeType}' for entry level determination.`, 500);
        }

        const offeredLevelId = levelMap.get(levelLookupKey);

        if (!offeredLevelId) {
            throw new AppError(`Database setup error: Entry Level '${offeredLevelIdentifier}' for DegreeType '${programDegreeType}' not found. Ensure all required Levels are configured.`, 500);
        }
        
        if (!candidate.targetProgramId) {
            throw new AppError(`Candidate ${candidate.id} does not have an assigned target program. This should have been filtered earlier.`, 400);
        }

        return {
            applicationProfileId: candidate.id,
            physicalScreeningId: candidate.physicalScreening?.id || null,
            offeredProgramId: candidate.targetProgramId,
            offeredLevelId: offeredLevelId,
            admissionSeasonId,
            admissionSemesterId,
            acceptanceDeadline: new Date(acceptanceDeadline),
        };
    });
    
    // 5. Use a transaction to create offers and update statuses atomically
    const result = await prisma.$transaction(async (tx) => {
        const createdOffers = await tx.admissionOffer.createMany({
            data: offersToCreate,
            skipDuplicates: true
        });
        
        const updatedProfileIds = eligibleCandidates.map(c => c.id);

        // Update ApplicationProfile status
        await tx.applicationProfile.updateMany({
            where: { id: { in: updatedProfileIds } },
            data: { applicationStatus: ApplicationStatus.ADMITTED }
        });

        // Update PhysicalScreeningList status
        await tx.physicalScreeningList.updateMany({
            where: { applicationProfileId: { in: updatedProfileIds } },
            data: { status: ApplicationStatus.ADMITTED }
        });

        return createdOffers;
    });

    return { createdCount: result.count };
};

export const getAllAdmissionOffers = async (query) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        
        const {
            admissionSeasonId,
            offeredProgramId,
            entryMode,
            isAccepted,
            search,
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
                    { applicationProfile: { jambRegNo: { contains: search } } }, // Removed mode: 'insensitive'
                    // Also search by name if target program is set, or if biodata exists
                    { applicationProfile: { bioData: { OR: [{ firstName: { contains: search } }, { lastName: { contains: search } }] } } }, // NEW: Search by bioData name
                    { applicationProfile: { onlineScreeningList: { jambApplicant: { name: { contains: search } } } } } // Removed mode: 'insensitive'
                ]
            });
        }

        if (admissionSeasonId && admissionSeasonId !== 'all') {
            filters.push({ admissionSeasonId: parseInt(admissionSeasonId, 10) });
        }

        // Initialize offeredProgram filter object
        let offeredProgramFilter = {};

        if (offeredProgramId && offeredProgramId !== 'all') {
            offeredProgramFilter.id = parseInt(offeredProgramId, 10);
        }

        // NEW Filters: Department, Faculty, DegreeType (all via offeredProgram)
        if (departmentId && departmentId !== 'all') {
            offeredProgramFilter.departmentId = parseInt(departmentId, 10);
        }

        if (facultyId && facultyId !== 'all') {
            offeredProgramFilter.department = {
                facultyId: parseInt(facultyId, 10)
            };
        }

        if (degreeType && degreeType !== 'all') {
            if (!Object.values(DegreeType).includes(degreeType)) {
                throw new AppError(`Invalid degree type: ${degreeType}.`, 400);
            }
            offeredProgramFilter.degreeType = degreeType;
        }

        // If any offeredProgram filters were set, add them to the main filters
        if (Object.keys(offeredProgramFilter).length > 0) {
            filters.push({ offeredProgram: offeredProgramFilter });
        }
        
        if (entryMode && entryMode !== 'all') {
            filters.push({
                applicationProfile: {
                    onlineScreeningList: {
                        jambApplicant: {
                            entryMode: entryMode // Now directly filter by EntryMode
                        }
                    }
                }
            });
        }
        
        if (isAccepted !== undefined && isAccepted !== 'all') {
            if (isAccepted === 'true') filters.push({ isAccepted: true });
            else if (isAccepted === 'false') filters.push({ isAccepted: false });
            else if (isAccepted === 'null') filters.push({ isAccepted: null });
        }
        
        if (filters.length > 0) {
            where.AND = filters;
        }

        const pageNum = parseInt(page, 10) || 1;
        const limitNum = parseInt(limit, 10) || 10;
        const skip = (pageNum - 1) * limitNum;

        const [offers, totalOffers] = await prisma.$transaction([
            prisma.admissionOffer.findMany({
                where, 
                select: offerSelection,
                orderBy: { offerDate: 'desc' },
                skip, take: limitNum
            }),
            prisma.admissionOffer.count({ where })
        ]);

        return { offers, totalPages: Math.ceil(totalOffers / limitNum), currentPage: pageNum, totalOffers };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching admission offers:", error);
        throw new AppError('Could not retrieve admission offers.', 500);
    }
};


export const getAdmissionOfferById = async (id) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const offerId = parseInt(id, 10);
        if (isNaN(offerId)) throw new AppError('Invalid Offer ID format.', 400);

        const offer = await prisma.admissionOffer.findUnique({
            where: { id: offerId },
            select: offerSelection
        });
        if (!offer) throw new AppError('Admission offer not found.', 404);
        return offer;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching admission offer by ID:", error.message, error.stack);
        throw new AppError('Could not retrieve admission offer.', 500);
    }
};

export const updateAdmissionOfferAsAdmin = async (id, updateData) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const offerId = parseInt(id, 10);
        if (isNaN(offerId)) throw new AppError('Invalid Offer ID format.', 400);

        const existingOffer = await prisma.admissionOffer.findUnique({ where: { id: offerId } });
        if (!existingOffer) throw new AppError('Admission offer not found for update.', 404);

        const dataForDb = {};
        const { acceptanceDeadline, admissionLetterUrl, remarks } = updateData;

        if (updateData.hasOwnProperty('acceptanceDeadline')) {
            dataForDb.acceptanceDeadline = acceptanceDeadline ? new Date(acceptanceDeadline) : null;
        }
        if (updateData.hasOwnProperty('admissionLetterUrl')) {
            dataForDb.admissionLetterUrl = admissionLetterUrl;
        }

        if (Object.keys(dataForDb).length === 0) throw new AppError('No valid fields to update.', 400);

        const updatedOffer = await prisma.admissionOffer.update({
            where: { id: offerId },
            data: dataForDb,
            select: offerSelection
        });
        return updatedOffer;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error updating admission offer (admin):", error.message, error.stack);
        throw new AppError('Could not update admission offer.', 500);
    }
};

export const getMyAdmissionOffer = async (applicationProfileId) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const profileId = parseInt(applicationProfileId, 10);
        if (isNaN(profileId)) throw new AppError('Invalid Application Profile ID.', 400);

        const offer = await prisma.admissionOffer.findUnique({
            where: { applicationProfileId: profileId },
            select: offerSelection
        });

        if (!offer) {
            return null;
        }
        return offer;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching applicant's admission offer:", error.message, error.stack);
        throw new AppError("Could not retrieve your admission offer.", 500);
    }
};

export const respondToAdmissionOffer = async (applicationProfileId, acceptanceStatus, rejectionReason = null) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const profileId = parseInt(applicationProfileId, 10);
        if (isNaN(profileId)) throw new AppError('Invalid Application Profile ID.', 400);
        if (typeof acceptanceStatus !== 'boolean') {
            throw new AppError('Acceptance status must be true or false.', 400);
        }

        const offer = await prisma.admissionOffer.findUnique({
            where: { applicationProfileId: profileId },
            include: { applicationProfile: true }
        });

        if (!offer) throw new AppError('No admission offer found for you to respond to.', 404);
        if (offer.isAccepted !== null) {
            const currentStatus = offer.isAccepted ? 'accepted' : 'rejected';
            throw new AppError(`You have already ${currentStatus} this admission offer.`, 400);
        }
        if (offer.acceptanceDeadline && new Date() > new Date(offer.acceptanceDeadline)) {
            await prisma.applicationProfile.update({
                where: {id: profileId},
                data: {applicationStatus: ApplicationStatus.CLOSED}
            });
            throw new AppError('The deadline to respond to this admission offer has passed.', 400);
        }

        let newAppStatus;
        if (acceptanceStatus === true) {
            newAppStatus = ApplicationStatus.ADMISSION_ACCEPTED;
            if (offer.acceptanceFeeListId) {
                newAppStatus = ApplicationStatus.PENDING_PAYMENT;
            } else {
                newAppStatus = ApplicationStatus.ADMISSION_ACCEPTED;
            }
        } else {
            newAppStatus = ApplicationStatus.ADMISSION_REJECTED;
        }

        const updatedOffer = await prisma.admissionOffer.update({
            where: { id: offer.id },
            data: {
                isAccepted: acceptanceStatus,
                acceptanceDate: new Date(),
                rejectionReason: acceptanceStatus === false ? (rejectionReason || "Not specified") : null
            },
            select: offerSelection
        });

        await prisma.applicationProfile.update({
            where: { id: profileId },
            data: { applicationStatus: newAppStatus }
        });

        return updatedOffer;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error responding to admission offer:", error.message, error.stack);
        throw new AppError('Could not process your response to the admission offer.', 500);
    }
};

export const batchEmailNotificationAdmission = async (payload) => {
    const { offerIds, subject, message } = payload;
    if (!offerIds || !Array.isArray(offerIds) || offerIds.length === 0) {
        throw new AppError('An array of Admission Offer IDs is required.', 400);
    }
    const offers = await prisma.admissionOffer.findMany({
        where: {
            id: { in: offerIds },
            OR: [
                { isAccepted: true },
                { isAccepted: null }
            ]
        },
        select: {
            id: true,
            offeredProgram: { select: { name: true, degreeType: true, duration: true } },
            offeredLevel: { select: { name: true } },
            admissionSeason: { select: { name: true } },
            admissionSemester: { select: { name: true, type: true } },
            applicationProfile: {
                select: {
                    email: true,
                    bioData: { // NEW: Select bioData for robust name fallback
                        select: { firstName: true, lastName: true }
                    },
                    onlineScreeningList: {
                        select: { // <--- CRITICAL FIX: Added 'select' here for the relation
                            jambApplicant: {
                                select: { name: true } // Corrected nesting
                            }
                        }
                    }
                }
            }
        }
    });

    const emailsToSend = offers.map(offer => {
        const applicantBioData = offer.applicationProfile.bioData;
        const applicantJambData = offer.applicationProfile.onlineScreeningList?.jambApplicant;
        const program = offer.offeredProgram;
        const level = offer.offeredLevel;
        const season = offer.admissionSeason;
        const semester = offer.admissionSemester;

        if (!offer.applicationProfile.email) return null; // Must have an email

        // MODIFIED: Robust applicant_name derivation
        const applicant_name = (applicantBioData?.firstName && applicantBioData?.lastName)
            ? `${applicantBioData.firstName} ${applicantBioData.lastName}`.trim()
            : applicantJambData?.name || 'Applicant'; // Fallback to 'Applicant'

        return {
            to: offer.applicationProfile.email,
            applicant_name: applicant_name, // Use the robust name
            program_name: program.name,
            degree_type: program.degreeType.replace(/_/g, ' '),
            program_duration: `${program.duration} years`,
            entry_level: level.name,
            admission_season: season.name,
            admission_semester: `${semester.name} (${semester.type.replace(/_/g, ' ')})`,
            screening_portal_link: config.screeningPortalUrl
        };
    }).filter(e => e !== null);

    if (emailsToSend.length === 0) {
        throw new AppError('No eligible candidates with valid emails found for the selected offers (candidates may have rejected their offers or missing data).', 404);
    }

    for (const emailData of emailsToSend) {
        let personalizedMessage = message;
        for (const key in emailData) {
            if (Object.prototype.hasOwnProperty.call(emailData, key) && key !== 'to') {
                const placeholder = new RegExp(`{${key}}`, 'g');
                personalizedMessage = personalizedMessage.replace(placeholder, emailData[key]);
            }
        }

        try {
            await sendEmail({
                to: emailData.to,
                subject: subject,
                text: personalizedMessage,
                html: `<div style="font-family: sans-serif; line-height: 1.6;">${personalizedMessage.replace(/\n/g, '<br>')}</div>`
            });
        } catch (error) {
            console.error(`Failed to send admission notification email to ${emailData.to}:`, error);
        }
    }

    return { message: `Admission notifications sent to ${emailsToSend.length} candidates.` };
};

export const deleteAdmissionOffer = async (id) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const offerId = parseInt(id, 10);
        if (isNaN(offerId)) throw new AppError('Invalid Offer ID format for deletion.', 400);

        const existingOffer = await prisma.admissionOffer.findUnique({
            where: { id: offerId },
            select: {
                applicationProfileId: true,
                createdStudentId: true,
                isAccepted: true
            }
        });

        if (!existingOffer) {
            throw new AppError('Admission offer not found.', 404);
        }

        if (existingOffer.createdStudentId) {
            throw new AppError('Cannot delete an offer that has already led to student registration. Please manage student record directly if needed.', 400);
        }
        if (existingOffer.isAccepted === true) {
            throw new AppError('Cannot delete an offer that has already been accepted by the applicant. Consider invalidating the offer instead.', 400);
        }

        await prisma.$transaction(async (tx) => {
            await tx.admissionOffer.delete({
                where: { id: offerId }
            });

            if (existingOffer.applicationProfileId) {
                const otherOffersCount = await tx.admissionOffer.count({
                    where: {
                        applicationProfileId: existingOffer.applicationProfileId,
                        id: { not: offerId }
                    }
                });

                if (otherOffersCount === 0) {
                    await tx.applicationProfile.update({
                        where: { id: existingOffer.applicationProfileId },
                        data: { applicationStatus: ApplicationStatus.SCREENING_PASSED }
                    });

                    await tx.physicalScreeningList.updateMany({
                        where: { applicationProfileId: existingOffer.applicationProfileId },
                        data: { status: ApplicationStatus.SCREENING_PASSED }
                    });
                }
            }
        });

        return { message: 'Admission offer successfully deleted.' };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error deleting admission offer:", error.message, error.stack);
        throw new AppError('Could not delete admission offer.', 500);
    }
};

export const batchEmailAdmissionNotifications = async (payload) => {
    const { offerIds, subject, message } = payload;
    if (!offerIds || !Array.isArray(offerIds) || offerIds.length === 0) {
        throw new AppError('An array of Admission Offer IDs is required.', 400);
    }
    
    // MODIFIED: Corrected select structure and added bioData
    const offers = await prisma.admissionOffer.findMany({
        where: {
            id: { in: offerIds },
            OR: [
                { isAccepted: true },
                { isAccepted: null }
            ]
        },
        select: {
            id: true,
            offeredProgram: { select: { name: true, degreeType: true, duration: true } },
            offeredLevel: { select: { name: true } },
            admissionSeason: { select: { name: true } },
            admissionSemester: { select: { name: true, type: true } },
            applicationProfile: {
                select: {
                    email: true,
                    bioData: { select: { firstName: true, lastName: true } }, // NEW: Fetch bioData
                    onlineScreeningList: {
                        select: { // <--- CRITICAL FIX: Added 'select' here for the relation
                            jambApplicant: {
                                select: { name: true } // Corrected nesting
                            }
                        }
                    }
                }
            }
        }
    });

    const emailsToSend = offers.map(offer => {
        const applicantBioData = offer.applicationProfile.bioData;
        const applicantJambData = offer.applicationProfile.onlineScreeningList?.jambApplicant;
        const program = offer.offeredProgram;
        const level = offer.offeredLevel;
        const season = offer.admissionSeason;
        const semester = offer.admissionSemester;

        if (!offer.applicationProfile.email) return null;

        // MODIFIED: Robust applicant_name derivation
        const applicant_name = (applicantBioData?.firstName && applicantBioData?.lastName)
            ? `${applicantBioData.firstName} ${applicantBioData.lastName}`.trim()
            : applicantJambData?.name || 'Applicant'; // Fallback to 'Applicant'

        return {
            to: offer.applicationProfile.email,
            applicant_name: applicant_name, // Use the robust name
            program_name: program.name,
            degree_type: program.degreeType.replace(/_/g, ' '),
            program_duration: `${program.duration} years`,
            entry_level: level.name,
            admission_season: season.name,
            admission_semester: `${semester.name} (${semester.type.replace(/_/g, ' ')})`,
            screening_portal_link: config.screeningPortalUrl
        };
    }).filter(e => e !== null);

    if (emailsToSend.length === 0) {
        throw new AppError('No eligible candidates with valid emails found for the selected offers (candidates may have rejected their offers or missing data).', 404);
    }

    for (const emailData of emailsToSend) {
        let personalizedMessage = message;
        for (const key in emailData) {
            if (typeof emailData[key] === 'string' && Object.prototype.hasOwnProperty.call(emailData, key) && key !== 'to') {
                const placeholder = new RegExp(`{${key}}`, 'g');
                personalizedMessage = personalizedMessage.replace(placeholder, emailData[key]);
            }
        }

        try {
            await sendEmail({
                to: emailData.to,
                subject: subject,
                text: personalizedMessage,
                html: `<div style="font-family: sans-serif; line-height: 1.6;">${personalizedMessage.replace(/\n/g, '<br>')}</div>`
            });
        } catch (error) {
            console.error(`Failed to send admission notification email to ${emailData.to}:`, error);
        }
    }

    return { message: `Admission notifications sent to ${emailsToSend.length} candidates.` };
};