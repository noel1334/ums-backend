
import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import { ApplicationStatus, EntryMode, DocumentType, DegreeType } from '../generated/prisma/index.js'; // Import DegreeType
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
            phone: true, // This `phone` is correct, it's directly on ApplicationProfile
            bioData: {
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
            degreeType: true,
            duration: true,
            modeOfStudy: true,
            department: {
                select: {
                    id: true,
                    name: true,
                    facultyId: true
                }
            }
        }
    },
    offeredLevel: { select: { id: true, name: true } },
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

    // Fetch all relevant accepted offers and process them in Node.js
    // This is often more flexible than complex Prisma groupBy queries for conditional sums.
    const offers = await prisma.admissionOffer.findMany({
        where: {
            isAccepted: true, // Only count accepted offers for statistics
            ...(seasonIdNum && { admissionSeasonId: seasonIdNum }) // Apply season filter if provided
        },
        select: {
            offeredProgram: { select: { id: true, name: true } },
            applicationProfile: {
                select: {
                    onlineScreeningList: {
                        select: {
                            jambApplicant: {
                                select: { entryMode: true }
                            }
                        }
                    }
                }
            }
        }
    });

    const statsMap = new Map(); // Map to hold program statistics

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
        }
    });

    // Convert map values to an array, and sort by total admitted (optional)
    return Array.from(statsMap.values()).sort((a, b) => b.totalAdmitted - a.totalAdmitted);
};

export const createAdmissionOffer = async (offerData) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const {
            applicationProfileId, offeredProgramId, offeredLevelId,
            admissionSeasonId, admissionSemesterId, acceptanceDeadline,
            // acceptanceFeeListId is now optional for single creation too
            acceptanceFeeListId // This parameter is now optional.
        } = offerData;

        // Validation - acceptanceFeeListId is removed from required checks
        if (!applicationProfileId || !offeredProgramId || !offeredLevelId || !admissionSeasonId || !admissionSemesterId) {
            throw new AppError('Application Profile ID, Offered Program, Level, Season, and Semester are required.', 400);
        }

        const pAppProfileId = parseInt(applicationProfileId, 10);
        const pOfferedProgramId = parseInt(offeredProgramId, 10);
        const pOfferedLevelId = parseInt(offeredLevelId, 10);
        const pAdmissionSeasonId = parseInt(admissionSeasonId, 10);
        const pAdmissionSemesterId = parseInt(admissionSemesterId, 10);
        const pAcceptanceFeeListId = acceptanceFeeListId ? parseInt(acceptanceFeeListId, 10) : null; // Handle optional parsing

        // Validate existence of related entities
        const [appProfile, program, level, season, semester] = await Promise.all([
            prisma.applicationProfile.findUnique({ where: { id: pAppProfileId } }),
            prisma.program.findUnique({ where: { id: pOfferedProgramId } }),
            prisma.level.findUnique({ where: { id: pOfferedLevelId } }),
            prisma.season.findUnique({ where: { id: pAdmissionSeasonId } }),
            prisma.semester.findUnique({ where: { id: pAdmissionSemesterId } }),
            // Removed feeList validation: prisma.acceptanceFeeList.findUnique({ where: { id: pAcceptanceFeeListId, isActive: true } })
        ]);

        if (!appProfile) throw new AppError(`Application Profile ID ${pAppProfileId} not found.`, 404);
        if (appProfile.applicationStatus !== ApplicationStatus.SCREENING_PASSED && appProfile.applicationStatus !== ApplicationStatus.ADMITTED) {
            throw new AppError(`Cannot create offer. Applicant status is '${appProfile.applicationStatus}'. Expected SCREENING_PASSED.`, 400);
        }
        if (!program) throw new AppError(`Offered Program ID ${pOfferedProgramId} not found.`, 404);
        if (!level) throw new AppError(`Offered Level ID ${pOfferedLevelId} not found.`, 404);
        if (!season) throw new AppError(`Admission Season ID ${pAdmissionSeasonId} not found.`, 404);
        if (!semester) throw new AppError(`Admission Semester ID ${pAdmissionSemesterId} not found.`, 404);
        // Removed: if (!feeList) throw new AppError(`Active Acceptance Fee List ID ${pAcceptanceFeeListId} not found.`, 404);


        const existingOffer = await prisma.admissionOffer.findUnique({
            where: { applicationProfileId: pAppProfileId }
        });
        if (existingOffer) {
            throw new AppError('An admission offer already exists for this applicant. Use update if changes are needed.', 409);
        }

        // Get physicalScreeningId if available, for linkage
        const physicalScreeningRecord = await prisma.physicalScreeningList.findUnique({
            where: { applicationProfileId: pAppProfileId },
            select: { id: true }
        });


        const newOffer = await prisma.admissionOffer.create({
            data: {
                applicationProfileId: pAppProfileId,
                physicalScreeningId: physicalScreeningRecord?.id || null, // Link to physical screening
                offeredProgramId: pOfferedProgramId,
                offeredLevelId: pOfferedLevelId,
                admissionSeasonId: pAdmissionSeasonId,
                admissionSemesterId: pAdmissionSemesterId,
                acceptanceFeeListId: pAcceptanceFeeListId, // This can now be null
                offerDate: new Date(),
                acceptanceDeadline: acceptanceDeadline ? new Date(acceptanceDeadline) : null,
            },
            select: offerSelection
        });

        // Update ApplicationProfile status
        await prisma.applicationProfile.update({
            where: { id: pAppProfileId },
            data: { applicationStatus: ApplicationStatus.ADMITTED }
        });

        // Update PhysicalScreeningList status to ADMITTED as well
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

    // 1. Fetch eligible candidates and their related physicalScreening record ID.
    const candidates = await prisma.applicationProfile.findMany({
        where: {
            id: { in: applicationProfileIds },
            applicationStatus: ApplicationStatus.SCREENING_PASSED,
        },
        include: {
            onlineScreeningList: {
                include: { jambApplicant: { select: { entryMode: true } } }
            },
            admissionOffer: true, // Check if an offer already exists
            // Include the physicalScreening relation to get its ID
            physicalScreening: {
                select: {
                    id: true 
                }
            }
        }
    });

    // 2. Filter out candidates who are not eligible or already have an offer
    const eligibleCandidates = candidates.filter(c => !c.admissionOffer);
    if (eligibleCandidates.length === 0) {
        throw new AppError('No eligible candidates found. They may already have an offer or did not pass screening.', 400);
    }
    
    // 3. Get the Level IDs for UTME (100) and Direct Entry (200)
    const level100 = await prisma.level.findUnique({ where: { value: 100 } });
    const level200 = await prisma.level.findUnique({ where: { value: 200 } });
    if (!level100 || !level200) {
        throw new AppError('Database setup error: 100 and 200 Level records must exist.', 500);
    }

    // 4. Prepare the data for creating multiple admission offers, including physicalScreeningId
    const offersToCreate = eligibleCandidates.map(candidate => {
        const entryMode = candidate.onlineScreeningList.jambApplicant.entryMode;
        const offeredLevelId = entryMode === EntryMode.DIRECT_ENTRY ? level200.id : level100.id;
        
        if (!candidate.targetProgramId) {
            throw new AppError(`Candidate ${candidate.jambRegNo} does not have an assigned target program.`, 400);
        }

        return {
            applicationProfileId: candidate.id,
            // Add the physicalScreeningId, using optional chaining for safety
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
            page = "1",
            limit = "10"
        } = query;

        const where = {}; 
        const filters = [];

        if (search) {
            filters.push({
                OR: [
                    { applicationProfile: { jambRegNo: { contains: search } } },
                    { applicationProfile: { onlineScreeningList: { jambApplicant: { name: { contains: search } } } } },
                ]
            });
        }

        // 2. Filter by Admission Season
        if (admissionSeasonId && admissionSeasonId !== 'all') {
            filters.push({ admissionSeasonId: parseInt(admissionSeasonId, 10) });
        }

        // 3. Filter by Offered Program
        if (offeredProgramId && offeredProgramId !== 'all') {
            filters.push({ offeredProgramId: parseInt(offeredProgramId, 10) });
        }

        // 4. Filter by Entry Mode
        if (entryMode && entryMode !== 'all') {
            filters.push({
                applicationProfile: {
                    onlineScreeningList: {
                        jambApplicant: {
                            entryMode: entryMode // Directly filter by the enum value
                        }
                    }
                }
            });
        }
        
        // 5. Filter by Acceptance Status
        if (isAccepted !== undefined && isAccepted !== 'all') {
            if (isAccepted === 'true') filters.push({ isAccepted: true });
            else if (isAccepted === 'false') filters.push({ isAccepted: false });
            else if (isAccepted === 'null') filters.push({ isAccepted: null });
        }
        
        // Combine all filters with an 'AND' clause
        if (filters.length > 0) {
            where.AND = filters;
        }

        const pageNum = parseInt(page, 10) || 1;
        const limitNum = parseInt(limit, 10) || 10;
        const skip = (pageNum - 1) * limitNum;

        const [offers, totalOffers] = await prisma.$transaction([
            prisma.admissionOffer.findMany({
                where, 
                select: offerSelection, // Your existing selection object
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


export const getAdmissionOfferById = async (id) => { // For Admin/ICT
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

// Update by Admin - limited fields typically (e.g., deadline, letter URL)
export const updateAdmissionOfferAsAdmin = async (id, updateData) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const offerId = parseInt(id, 10);
        if (isNaN(offerId)) throw new AppError('Invalid Offer ID format.', 400);

        const existingOffer = await prisma.admissionOffer.findUnique({ where: { id: offerId } });
        if (!existingOffer) throw new AppError('Admission offer not found for update.', 404);

        const dataForDb = {};
        const { acceptanceDeadline, admissionLetterUrl, remarks } = updateData; // Example updatable fields by admin

        if (updateData.hasOwnProperty('acceptanceDeadline')) {
            dataForDb.acceptanceDeadline = acceptanceDeadline ? new Date(acceptanceDeadline) : null;
        }
        if (updateData.hasOwnProperty('admissionLetterUrl')) {
            dataForDb.admissionLetterUrl = admissionLetterUrl;
        }
        // Admin might update `isAccepted` or `generatedStudentRegNo` through other processes, not direct update here.

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

// --- Applicant Operations ---

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
            // It's not an error if an applicant doesn't have an offer yet, just no data.
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
        if (offer.isAccepted !== null) { // Already responded
            const currentStatus = offer.isAccepted ? 'accepted' : 'rejected';
            throw new AppError(`You have already ${currentStatus} this admission offer.`, 400);
        }
        if (offer.acceptanceDeadline && new Date() > new Date(offer.acceptanceDeadline)) {
            // Optionally auto-reject or close application
            await prisma.applicationProfile.update({
                where: {id: profileId},
                data: {applicationStatus: ApplicationStatus.CLOSED}
            });
            throw new AppError('The deadline to respond to this admission offer has passed.', 400);
        }

        let newAppStatus;
        if (acceptanceStatus === true) {
            newAppStatus = ApplicationStatus.ADMISSION_ACCEPTED;
            // Next step for student would be to pay acceptance fee.
            // ApplicationStatus might change to PENDING_PAYMENT after this.
            if (offer.acceptanceFeeListId) { // If an acceptance fee is defined
                newAppStatus = ApplicationStatus.PENDING_PAYMENT;
            } else { // No acceptance fee defined, consider them accepted
                newAppStatus = ApplicationStatus.ADMISSION_ACCEPTED;
                 // Potentially move to ENROLLED if no fee and no other steps
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
                { isAccepted: true },  // Already accepted the offer
                { isAccepted: null }   // Offer is still pending acceptance/rejection
            ]
        },
        select: {
            id: true,
            offeredProgram: { select: { name: true, degreeType: true, duration: true } }, // Program details
            offeredLevel: { select: { name: true } }, // Entry Level
            admissionSeason: { select: { name: true } }, // Admission Season
            admissionSemester: { select: { name: true, type: true } }, // Admission Semester
            applicationProfile: {
                select: {
                    email: true,
                    onlineScreeningList: {
                        select: { jambApplicant: { select: { name: true } } } // Applicant Name
                    }
                }
            }
        }
    });

    const emailsToSend = offers.map(offer => {
        const applicant = offer.applicationProfile.onlineScreeningList?.jambApplicant;
        const program = offer.offeredProgram;
        const level = offer.offeredLevel;
        const season = offer.admissionSeason;
        const semester = offer.admissionSemester;

        // Ensure we have essential data for the email
        if (!applicant || !applicant.name || !offer.applicationProfile.email) return null;

        return {
            to: offer.applicationProfile.email,
            applicant_name: applicant.name,
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
        // Replace all placeholders dynamically
        for (const key in emailData) {
            if (Object.prototype.hasOwnProperty.call(emailData, key) && key !== 'to') {
                const placeholder = `{${key}}`;
                personalizedMessage = personalizedMessage.replace(new RegExp(placeholder, 'g'), emailData[key]);
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
            // Optionally: log to a dedicated table for failed emails in production
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
                createdStudentId: true, // Check if a student was created
                isAccepted: true // Check if already accepted
            }
        });

        if (!existingOffer) {
            throw new AppError('Admission offer not found.', 404);
        }

        // Optional business rules: Prevent deletion if student already created or offer accepted
        // You might want to allow deletion even if a student was created,
        // but the student record itself won't be deleted by this.
        if (existingOffer.createdStudentId) {
            throw new AppError('Cannot delete an offer that has already led to student registration. Please manage student record directly if needed.', 400);
        }
        if (existingOffer.isAccepted === true) {
            throw new AppError('Cannot delete an offer that has already been accepted by the applicant. Consider invalidating the offer instead.', 400);
        }

        await prisma.$transaction(async (tx) => {
            // Delete the admission offer record
            await tx.admissionOffer.delete({
                where: { id: offerId }
            });

            // If the offer existed and was linked to an application profile,
            // check if this was the ONLY offer for that profile.
            if (existingOffer.applicationProfileId) {
                const otherOffersCount = await tx.admissionOffer.count({
                    where: {
                        applicationProfileId: existingOffer.applicationProfileId,
                        id: { not: offerId } // Exclude the offer we just deleted
                    }
                });

                // If no other offers exist for this application profile, revert its status
                if (otherOffersCount === 0) {
                    await tx.applicationProfile.update({
                        where: { id: existingOffer.applicationProfileId },
                        // Revert to SCREENING_PASSED, assuming that was the state before admission
                        data: { applicationStatus: ApplicationStatus.SCREENING_PASSED } 
                    });

                    // Also update the PhysicalScreeningList status if one exists for this profile
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
    
    // --- IMPORTANT: Enhance select to get generatedStudentRegNo, createdStudentId, and jambRegNo ---
    const offers = await prisma.admissionOffer.findMany({
        where: {
            id: { in: offerIds },
            OR: [
                { isAccepted: true },  // Already accepted the offer
                { isAccepted: null }   // Offer is still pending acceptance/rejection
            ]
        },
        select: {
            id: true,
            generatedStudentRegNo: true, // Needed for {reg_no}
            createdStudentId: true,      // Needed to check if student record exists
            applicationProfile: {
                select: {
                    email: true,
                    jambRegNo: true, // Needed for {jamb_no}
                    bioData: { select: { firstName: true, lastName: true } }, // For applicant_name
                    onlineScreeningList: {
                        select: { jambApplicant: { select: { name: true } } } // Fallback for applicant_name
                    }
                }
            },
            createdStudent: { // NEW: Select linked student's regNo if available
                select: { regNo: true }
            }
            // Add other offer details if you need them for other email placeholders
            // offeredProgram: { select: { name: true, degreeType: true, duration: true } },
            // offeredLevel: { select: { name: true } },
            // admissionSeason: { select: { name: true } },
            // admissionSemester: { select: { name: true, type: true } },
        }
    });

    const emailsToSend = offers.map(offer => {
        const applicantFirstName = offer.applicationProfile.bioData?.firstName;
        const applicantLastName = offer.applicationProfile.bioData?.lastName;
        const applicantJambName = offer.applicationProfile.onlineScreeningList?.jambApplicant?.name;

        // Prioritize bioData name, then JAMB name, fallback to "Applicant"
        const applicantName = (applicantFirstName && applicantLastName) 
                            ? `${applicantFirstName} ${applicantLastName}`.trim()
                            : applicantJambName || 'Applicant';

        // Determine the registration number: use created student's regNo if available,
        // otherwise generatedStudentRegNo from the offer, else N/A.
        const regNo = offer.createdStudent?.regNo || offer.generatedStudentRegNo || 'N/A';
        const jambNo = offer.applicationProfile.jambRegNo || 'N/A';
        
        // Fetch default password and portal link from your backend's config
        const studentDefaultPassword = config.studentDefaultPassword || 'Contact Admissions Office'; // Fallback message
        const studentPortalLink = config.studentPortalUrl || 'http://your-student-portal-url.com'; // Fallback URL

        // Ensure we have essential data for the email
        if (!offer.applicationProfile.email) return null; // Skip if no email

        return {
            to: offer.applicationProfile.email,
            applicant_name: applicantName,
            reg_no: regNo,                  // Dynamic Registration Number
            jamb_no: jambNo,                // JAMB Registration Number
            default_password: studentDefaultPassword, // From backend config
            student_portal_link: studentPortalLink,  // From backend config
            // Add any other dynamic data you want to replace here
            // e.g., program_name: offer.offeredProgram?.name,
        };
    }).filter(e => e !== null);

    if (emailsToSend.length === 0) {
        throw new AppError('No eligible candidates with valid emails found for the selected offers (candidates may have rejected their offers or missing data).', 404);
    }

    for (const emailData of emailsToSend) {
        let personalizedMessage = message;
        // Replace all placeholders dynamically
        for (const key in emailData) {
            // Only replace if the key is a string and not 'to' (which is the recipient email)
            if (typeof emailData[key] === 'string' && Object.prototype.hasOwnProperty.call(emailData, key) && key !== 'to') {
                const placeholder = new RegExp(`{${key}}`, 'g'); // Create regex for global replacement
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
            // Optionally: log to a dedicated table for failed emails in production
        }
    }

    return { message: `Admission notifications sent to ${emailsToSend.length} candidates.` };
};
