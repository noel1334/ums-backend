// src/services/applicantProfile.service.js

import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import { hashPassword } from '../utils/password.utils.js';
import {
    ApplicationStatus,
    Gender,
    DocumentUploadStatus,
    OLevelGrade,
    TertiaryQualificationType,
    DocumentType,
    DegreeType // NEW: Import DegreeType
} from '../generated/prisma/index.js';


// MODIFIED: profileFullSelection to include degreeType, jambRequired, and onlineScreeningRequired
const profileFullSelection = {
    id: true,
    jambRegNo: true, // This can now be null
    email: true,
    phone: true,
    applicationStatus: true,
    remarks: true,
    targetProgramId: true,
    hasPaidScreeningFee: true,
    createdAt: true,
    updatedAt: true,
    onlineScreeningList: {
        select: {
            id: true,
            lastLogin: true,
            jambRegNo: true, // Include the screening list's JAMB RegNo
            email: true, // Include the screening list's email
            jambApplicant: {
                 select: {
                    jambRegNo: true,
                    name: true,
                    email:true,
                    programName: true,
                    entryMode: true, // This is entryMode from JAMB
                    jambScore: true,
                    gender: true,
                    jambSeason: {
                        select: {
                            id: true,
                            name: true,
                        }
                    }
                }
            }
        }
    },
    targetProgram: { // This is the program the applicant applied for
        select: {
            id: true,
            name: true,
            programCode: true,
            degreeType: true, // NEW: Include degreeType here
            jambRequired: true, // NEW: Include jambRequired here
            onlineScreeningRequired: true, // NEW: Include onlineScreeningRequired here
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
    bioData: true,
    contactInfo: true,
    nextOfKin: true,
    guardianInfo: true,
    oLevelResults: { include: { subjects: true }, orderBy: { sittingNumber: 'asc' } },
    tertiaryQualifications: { orderBy: { graduationYear: 'desc' } },
    uploadedDocuments: {
        select: {
            documentType: true,
            fileUrl: true,
            id: true,
            fileName: true,
            fileType: true,
            fileSize: true,
            status: true,
            rejectionReason: true,
            verifiedBy: true,
            verifiedAt: true,
            uploadedAt: true,
            updatedAt: true,
        },
        orderBy: { documentType: 'asc' }
    },
    // IMPORTANT: AdmissionOffer selection fixed to include correct relations
    admissionOffer: {
        select: {
            id: true,
            hasPaidAcceptanceFee: true,
            acceptanceFeeListId: true,
            admissionLetterUrl: true,
            isAccepted: true,
            acceptanceDate: true,

            offeredProgram: {
                select: {
                    id: true,
                    name: true,
                    programCode: true,
                    degreeType: true,
                    duration: true,
                    modeOfStudy: true,
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
            offeredLevel: {
                select: {
                    id: true,
                    name: true,
                }
            },
            admissionSeason: {
                select: {
                    id: true,
                    name: true,
                }
            },
            admissionSemester: {
                select: {
                    id: true,
                    name: true,
                }
            }
        }
    }
};

// MODIFIED: profileSummarySelection to include degreeType, jambRequired, and onlineScreeningRequired
const profileSummarySelection = {
    id: true,
    jambRegNo: true, // Can be null
    email: true,
    applicationStatus: true,
    hasPaidScreeningFee: true,
    onlineScreeningList: {
        select: {
            jambApplicant: {
                 select: {
                    name: true,
                    entryMode: true,
                    jambSeason: {
                        select: {
                            id: true,
                            name: true,
                        }
                    }
                }
            }
        }
    },
    bioData: { // Keep this for name
        select: {
            firstName: true,
            lastName: true,
            nationality: true,
        }
    },
    targetProgram: {
        select: { name: true, degreeType: true, jambRequired: true, onlineScreeningRequired: true } // NEW: Include degreeType, jambRequired, onlineScreeningRequired
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
    },
    admissionOffer: { select: { hasPaidAcceptanceFee: true, admissionLetterUrl: true } }
};



// Make sure fetchFullProfile is still used correctly:
async function fetchFullProfile(applicationProfileId) {
    const id = parseInt(applicationProfileId, 10);
    if (isNaN(id)) throw new AppError('Invalid applicationProfileId provided.', 400);
    
    const rawProfile = await prisma.applicationProfile.findUnique({
        where: { id },
        select: profileFullSelection,
    });
    
    if (!rawProfile) throw new AppError('Application profile not found.', 404);

    // Dynamic name from JAMB or BioData
    const jambApplicantName = rawProfile.onlineScreeningList?.jambApplicant?.name;
    const bioDataName = rawProfile.bioData ? `${rawProfile.bioData.firstName} ${rawProfile.bioData.lastName}` : null;

    const transformedProfile = {
        ...rawProfile,
        jambNameFromRecord: jambApplicantName || bioDataName || rawProfile.jambRegNo || rawProfile.email,
        profileImg: rawProfile.uploadedDocuments?.find(doc => doc.documentType === 'PROFILE_PHOTO')?.fileUrl || null,
    };
    
    return transformedProfile;
}

// --- EXPORTED SERVICE FUNCTIONS ---

export const getMyApplicationProfile = async (applicationProfileId) => {
    return fetchFullProfile(applicationProfileId);
};

// NEW: createApplicantProfileDirect function for non-JAMB applicants
export const createApplicantProfileDirect = async (email, password, targetProgramId) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        if (!email || !password || !targetProgramId) {
            throw new AppError('Email, password, and target program are required for direct application.', 400);
        }

        const trimmedEmail = String(email).trim();
        const pTargetProgramId = parseInt(targetProgramId, 10);
        if (isNaN(pTargetProgramId)) throw new AppError('Invalid Target Program ID format.', 400);

        const targetProgram = await prisma.program.findUnique({
            where: { id: pTargetProgramId },
            select: { id: true, name: true, degreeType: true, jambRequired: true }
        });

        if (!targetProgram) {
            throw new AppError(`Target Program with ID ${targetProgramId} not found.`, 404);
        }

        // Only allow direct application for programs that do NOT require JAMB
        if (targetProgram.jambRequired) {
            throw new AppError(`Program '${targetProgram.name}' requires a JAMB registration. Please use the JAMB application flow.`, 400);
        }

        const hashedPassword = await hashPassword(password);

        // Transaction to ensure both screening account and application profile are created
        const newProfile = await prisma.$transaction(async (tx) => {
            // 1. Check if an OnlineScreeningList or ApplicationProfile already exists with this email
            const existingScreeningAccount = await tx.onlineScreeningList.findUnique({ where: { email: trimmedEmail } });
            if (existingScreeningAccount) {
                throw new AppError(`An online screening account with email '${trimmedEmail}' already exists.`, 409);
            }
            const existingApplicationProfile = await tx.applicationProfile.findUnique({ where: { email: trimmedEmail } });
            if (existingApplicationProfile) {
                throw new AppError(`An application profile with email '${trimmedEmail}' already exists.`, 409);
            }


            // 1. Create OnlineScreeningList (using email as identifier)
            const onlineScreeningAccount = await tx.onlineScreeningList.create({
                data: {
                    email: trimmedEmail,
                    password: hashedPassword,
                    isActive: true,
                    // jambRegNo will be null here
                },
                select: { id: true, email: true }
            });

            // 2. Create ApplicationProfile, linking to the new OnlineScreeningList
            const applicationProfile = await tx.applicationProfile.create({
                data: {
                    email: trimmedEmail,
                    onlineScreeningListId: onlineScreeningAccount.id,
                    targetProgramId: targetProgram.id,
                    applicationStatus: ApplicationStatus.PENDING_SUBMISSION,
                    // jambRegNo will be null here
                },
                select: {
                    id: true, email: true, applicationStatus: true, targetProgramId: true,
                    onlineScreeningListId: true, jambRegNo: true
                }
            });

            return applicationProfile;
        });

        return newProfile;
    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2002') {
             const target = error.meta?.target;
             if (target?.includes('email')) throw new AppError('Email already in use for a screening account or application profile.', 409);
             throw new AppError('Failed to create profile due to a conflict.', 409);
        }
        console.error("Error creating direct applicant profile:", error.message, error.stack);
        throw new AppError('Could not create applicant profile.', 500);
    }
};

// NOTE: The `createApplicantProfile` function in your provided code was problematic.
// It was attempting to perform a login-like check and also create an OnlineScreeningList within it,
// which is a responsibility handled by `onlineScreening.service.js` or the new `createApplicantProfileDirect`.
// I am removing this ambiguous function, assuming new applications will go through
// either `onlineScreening.service.createOnlineScreeningAccount` (for JAMB-linked)
// or `applicantProfile.service.createApplicantProfileDirect` (for non-JAMB-linked).
// If you still need a `createApplicantProfile` for other purposes, it would need a clear definition.


// MODIFIED: getAllApplicationProfiles to include more robust searching and filtering
export const getAllApplicationProfiles = async (query) => {
    const { page = "1", limit = "10", search, programId, status, entryMode, seasonId } = query;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const where = {};
    const filters = [];
    if (search) {
        filters.push({
            OR: [
                { jambRegNo: { contains: search } }, // Check nullable jambRegNo
                { email: { contains: search } }, // Check email (primary for non-jamb)
                // Search jambApplicant name via onlineScreeningList
                { onlineScreeningList: { jambApplicant: { name: { contains: search } } } },
                // Search bioData name directly
                { bioData: { OR: [{ firstName: { contains: search } }, { lastName: { contains: search } }] } }
            ]
        });
    }
    if (status && status !== 'all') { filters.push({ applicationStatus: status }); }
    if (programId && programId !== 'all') { filters.push({ targetProgramId: parseInt(programId, 10) }); }
    
    // Filtering by entryMode or seasonId, consider it comes from jambApplicant
    // This will only filter profiles that actually have a linked JAMB applicant.
    const jambApplicantFilters = [];
    if (entryMode && entryMode !== 'all') { jambApplicantFilters.push({ entryMode: entryMode }); }
    if (seasonId && seasonId !== 'all') {
        const sId = parseInt(seasonId, 10);
        if (!isNaN(sId)) { jambApplicantFilters.push({ jambSeasonId: sId }); }
    }
    if (jambApplicantFilters.length > 0) {
        filters.push({ onlineScreeningList: { jambApplicant: { AND: jambApplicantFilters } } });
    }
    
    if (filters.length > 0) { where.AND = filters; }

    const [profiles, totalProfiles] = await prisma.$transaction([
        prisma.applicationProfile.findMany({
            where,
            select: profileSummarySelection,
            skip,
            take: limitNum,
            orderBy: { createdAt: 'desc' },
        }),
        prisma.applicationProfile.count({ where }),
    ]);

    return {
        profiles: profiles,
        totalPages: Math.ceil(totalProfiles / limitNum),
        currentPage: pageNum,
        totalProfiles,
    };
};

// MODIFIED: updateMyApplicationProfile to handle targetProgramId validation and password handling
export const updateMyApplicationProfile = async (applicationProfileId, updateData) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const id = parseInt(applicationProfileId, 10);

        const existingProfile = await prisma.applicationProfile.findUnique({
            where: { id },
            include: { bioData: true, contactInfo: true, nextOfKin: true, guardianInfo: true, targetProgram: { select: { jambRequired: true } } }
        });

        if (!existingProfile) throw new AppError('Application profile not found.', 404);
        if (existingProfile.applicationStatus === ApplicationStatus.SUBMITTED ||
            existingProfile.applicationStatus === ApplicationStatus.UNDER_REVIEW ||
            existingProfile.applicationStatus === ApplicationStatus.ADMITTED ||
            existingProfile.applicationStatus === ApplicationStatus.ENROLLED ||
            existingProfile.applicationStatus === ApplicationStatus.CLOSED ) {
            throw new AppError(`Your application has status '${existingProfile.applicationStatus}' and cannot be edited directly. Contact support if changes are needed.`, 403);
        }

        const {
            email, phone, targetProgramId, password, // 'password' is now handled on OnlineScreeningList
            bioData, contactInfo, nextOfKin, guardianInfo
        } = updateData;

        const profileUpdates = {};
        const bioDataUpdates = {};
        const contactUpdates = {};
        const nextOfKinUpdates = {};
        const guardianUpdates = {};

        if (email && email !== existingProfile.email) {
            const emailInUse = await prisma.applicationProfile.findFirst({where: {email: email, id: {not: id}}});
            if(emailInUse) throw new AppError('Email already in use.', 409);
            profileUpdates.email = email;
            // Also update the linked onlineScreeningList email if it matches the old email
            const onlineScreening = await prisma.onlineScreeningList.findUnique({where: {id: existingProfile.onlineScreeningListId}});
            if(onlineScreening && onlineScreening.email === existingProfile.email) {
                await prisma.onlineScreeningList.update({
                    where: { id: existingProfile.onlineScreeningListId },
                    data: { email: email }
                });
            }
        }
        if (phone && phone !== existingProfile.phone) {
             const phoneInUse = await prisma.applicationProfile.findFirst({where: {phone: phone, id: {not: id}}});
            if(phoneInUse) throw new AppError('Phone number already in use.', 409);
            profileUpdates.phone = phone;
        }
        if (targetProgramId !== undefined) {
            const pTProgramId = targetProgramId === null ? null : parseInt(targetProgramId, 10);
            if (targetProgramId !== null && isNaN(pTProgramId)) throw new AppError('Invalid Target Program ID.', 400);
            
            let newTargetProgram = null;
            if (pTProgramId) {
                newTargetProgram = await prisma.program.findUnique({where: {id: pTProgramId}});
                if (!newTargetProgram) throw new AppError(`Target Program ID ${pTProgramId} not found.`, 404);

                // Validation: If new program requires JAMB, and applicant has no JAMB RegNo
                if (newTargetProgram.jambRequired && !existingProfile.jambRegNo) {
                    throw new AppError(`Cannot switch to program '${newTargetProgram.name}' (ID: ${pTProgramId}) as it requires a JAMB Registration Number, which you do not have.`, 400);
                }
            }
            profileUpdates.targetProgramId = pTProgramId;
        }
        if (password) {
            // Note: ApplicationProfile itself doesn't have a password. 
            // It's the OnlineScreeningList that holds the password.
            // If the intent is to change the screening account password, that needs to be done via onlineScreeningService.
            console.warn("Attempted to update password via application profile. Passwords are on OnlineScreeningList. Ignoring.");
        }

        if (bioData) {
            if(bioData.firstName) bioDataUpdates.firstName = bioData.firstName;
            if(bioData.middleName !== undefined) bioDataUpdates.middleName = bioData.middleName;
            if(bioData.lastName) bioDataUpdates.lastName = bioData.lastName;
            if(bioData.dateOfBirth) bioDataUpdates.dateOfBirth = new Date(bioData.dateOfBirth);
            if(bioData.gender && Object.values(Gender).includes(bioData.gender)) bioDataUpdates.gender = bioData.gender;
            else if (bioData.gender) throw new AppError('Invalid gender in BioData.', 400);
            if(bioData.nationality) bioDataUpdates.nationality = bioData.nationality;
            if(bioData.placeOfBirth !== undefined) bioDataUpdates.placeOfBirth = bioData.placeOfBirth;
            if(bioData.maritalStatus !== undefined) bioDataUpdates.maritalStatus = bioData.maritalStatus;
            if(bioData.religion !== undefined) bioDataUpdates.religion = bioData.religion;
        }

        if (contactInfo) {
            if(contactInfo.countryOfResidence) contactUpdates.countryOfResidence = contactInfo.countryOfResidence;
            if(contactInfo.stateOfResidence) contactUpdates.stateOfResidence = contactInfo.stateOfResidence;
            if(contactInfo.lgaOfResidence) contactUpdates.lgaOfResidence = contactInfo.lgaOfResidence;
            if(contactInfo.residentialAddress) contactUpdates.residentialAddress = contactInfo.residentialAddress;
        }
        
        if (nextOfKin) { Object.assign(nextOfKinUpdates, nextOfKin); }
        if (guardianInfo) { Object.assign(guardianUpdates, guardianInfo); }

        await prisma.$transaction(async (tx) => {
            if (Object.keys(profileUpdates).length > 0) {
                await tx.applicationProfile.update({ where: { id }, data: profileUpdates });
            }
            if (Object.keys(bioDataUpdates).length > 0) {
                await tx.applicantBioData.upsert({
                    where: { applicationProfileId: id },
                    create: { applicationProfileId: id, ...bioDataUpdates },
                    update: bioDataUpdates,
                });
            }
            if (Object.keys(contactUpdates).length > 0) {
                await tx.applicantContactInfo.upsert({
                    where: { applicationProfileId: id },
                    create: { applicationProfileId: id, ...contactUpdates },
                    update: contactUpdates,
                });
            }
            if (Object.keys(nextOfKinUpdates).length > 0) {
                await tx.applicantNextOfKin.upsert({
                    where: { applicationProfileId: id },
                    create: { applicationProfileId: id, ...nextOfKinUpdates },
                    update: nextOfKinUpdates,
                });
            }
            if (Object.keys(guardianUpdates).length > 0) {
                await tx.applicantGuardianInfo.upsert({
                    where: { applicationProfileId: id },
                    create: { applicationProfileId: id, ...guardianUpdates },
                    update: guardianUpdates,
                });
            }
        });

        return getMyApplicationProfile(id);

    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2002') {
            const target = error.meta?.target;
             if (target?.includes('email')) throw new AppError('Email already in use.', 409);
             if (target?.includes('phone')) throw new AppError('Phone number already in use.', 409);
             throw new AppError('Unique constraint violation on update.', 409);
        }
        console.error("Error updating applicant profile:", error.message, error.stack);
        throw new AppError('Could not update your application profile.', 500);
    }
};

// MODIFIED: saveOrUpdateApplicationStep for email/phone handling and more robust validation
export const saveOrUpdateApplicationStep = async (applicationProfileId, step, data) => {
    const existingProfile = await prisma.applicationProfile.findUnique({
        where: { id: applicationProfileId }
    });
    
    if (!existingProfile) {
        throw new AppError('Application profile not found.', 404);
    }
    
    if (existingProfile.applicationStatus !== 'PENDING_SUBMISSION') {
        throw new AppError(`Your application status is '${existingProfile.applicationStatus}' and cannot be edited.`, 403);
    }

    await prisma.$transaction(async (tx) => {
        switch (step) {
            case 'bio-data':
                const { bioData, contactInfo, phone, email } = data;
                
                const profileUpdates = {};
                // Handle potential email/phone updates at profile level (which also link to onlineScreeningList and ensure uniqueness)
                if (phone && phone !== existingProfile.phone) {
                    const phoneInUse = await tx.applicationProfile.findFirst({where: {phone: phone, id: {not: applicationProfileId}}});
                    if(phoneInUse) throw new AppError('Phone number already in use by another applicant.', 409);
                    profileUpdates.phone = phone;
                }
                if (email && email !== existingProfile.email) {
                    const emailInUse = await tx.applicationProfile.findFirst({where: {email: email, id: {not: applicationProfileId}}});
                    if(emailInUse) throw new AppError('Email already in use by another applicant.', 409);
                    profileUpdates.email = email;
                    // Also update the linked onlineScreeningList email if it matches the old email
                    const onlineScreening = await tx.onlineScreeningList.findUnique({where: {id: existingProfile.onlineScreeningListId}});
                    if(onlineScreening && onlineScreening.email === existingProfile.email) {
                        await tx.onlineScreeningList.update({
                            where: { id: existingProfile.onlineScreeningListId },
                            data: { email: email }
                        });
                    }
                }

                if (Object.keys(profileUpdates).length > 0) {
                     await tx.applicationProfile.update({
                        where: { id: applicationProfileId },
                        data: profileUpdates
                    });
                }
                
                if (bioData) {
                    if (bioData.dateOfBirth) bioData.dateOfBirth = new Date(bioData.dateOfBirth);
                    await tx.applicantBioData.upsert({
                        where: { applicationProfileId },
                        create: { ...bioData, applicationProfileId },
                        update: bioData,
                    });
                }

                if (contactInfo) {
                    await tx.applicantContactInfo.upsert({
                        where: { applicationProfileId },
                        create: { ...contactInfo, applicationProfileId },
                        update: contactInfo,
                    });
                }
                break;
            
            case 'next-of-kin':
                const { nextOfKin, guardianInfo } = data;

                if (nextOfKin) {
                    await tx.applicantNextOfKin.upsert({
                        where: { applicationProfileId },
                        create: { ...nextOfKin, applicationProfileId },
                        update: nextOfKin,
                    });
                }
                if (guardianInfo) {
                    await tx.applicantGuardianInfo.upsert({
                        where: { applicationProfileId },
                        create: { ...guardianInfo, applicationProfileId },
                        update: guardianInfo,
                    });
                }
                break;

            case 'education':
                const { oLevelResults } = data;
                if (!oLevelResults || !Array.isArray(oLevelResults)) {
                    throw new AppError('O-Level results data is missing or not an array.', 400);
                }
                
                // Delete existing O-Level results before creating new ones for this sitting
                await tx.applicantOLevelResult.deleteMany({ where: { applicationProfileId } });

                for (const result of oLevelResults) {
                    const sanitizedResultData = {
                        examType: result.examType, examYear: Number(result.examYear),
                        examNumber: result.examNumber, cardPin: result.cardPin,
                        cardSerialNumber: result.cardSerialNumber, candidateIdNumber: result.candidateIdNumber,
                        sittingNumber: result.sittingNumber,
                    };
                    const sanitizedSubjects = result.subjects.map(s => ({ subjectName: s.subjectName, grade: s.grade }));
                    
                    await tx.applicantOLevelResult.create({
                        data: {
                            ...sanitizedResultData,
                            applicationProfileId,
                            subjects: { create: sanitizedSubjects },
                        },
                    });
                }
                break;
            
            case 'higher-qualification':
                const { tertiaryQualifications } = data;
                if (!tertiaryQualifications || !Array.isArray(tertiaryQualifications)) {
                    throw new AppError('Higher qualifications data must be an array.', 400);
                }
                
                // Delete existing tertiary qualifications before creating new ones
                await tx.applicantTertiaryQualification.deleteMany({ where: { applicationProfileId } });
                
                for (const qual of tertiaryQualifications) {
                    const sanitizedQualData = {
                        institutionName: qual.institutionName, qualificationObtained: qual.qualificationObtained,
                        courseOfStudy: qual.courseOfStudy, graduationYear: qual.graduationYear ? Number(qual.graduationYear) : null,
                        gradeOrClass: qual.gradeOrClass, cgpa: qual.cgpa ? parseFloat(qual.cgpa) : null,
                    };
                    await tx.applicantTertiaryQualification.create({
                        data: { ...sanitizedQualData, applicationProfileId }
                    });
                }
                break;
            
            case 'documents':
                // Document uploads are handled by saveOrUpdateSingleDocument, not directly here.
                console.log(`Step 'documents' processed. No data to save in this step.`);
                break;
                
            default:
                throw new AppError(`The form step '${step}' is not recognized by the server.`, 400);
        }
    });

    return getMyApplicationProfile(applicationProfileId);
};


export const saveOrUpdateSingleDocument = async (applicationProfileId, documentData) => {
    const { documentType, fileUrl, fileName, fileType, fileSize } = documentData;

    const existingDocument = await prisma.applicantDocument.findFirst({
        where: {
            applicationProfileId: applicationProfileId,
            documentType: documentType,
        }
    });

    if (existingDocument) {
        console.log(`Found existing document (ID: ${existingDocument.id}). Updating...`);
        await prisma.applicantDocument.update({
            where: {
                id: existingDocument.id
            },
            data: {
                fileUrl,
                fileName,
                fileType,
                fileSize,
                status: DocumentUploadStatus.UPLOADED, // Reset status to UPLOADED on update
                rejectionReason: null, // Clear rejection reason on new upload
                verifiedBy: null, // Clear verification status
                verifiedAt: null,
            }
        });
    } else {
        console.log(`No existing document found for type ${documentType}. Creating...`);
        await prisma.applicantDocument.create({
            data: {
                applicationProfileId,
                documentType,
                fileUrl,
                fileName,
                fileType,
                fileSize,
                status: DocumentUploadStatus.UPLOADED,
            }
        });
    }

    return getMyApplicationProfile(applicationProfileId);
};

// MODIFIED: submitApplicationProfile to conditionally check for JAMB document and tertiary documents based on program type
export const submitApplicationProfile = async (applicationProfileId) => {
    const id = parseInt(applicationProfileId, 10);
    
    const profile = await prisma.applicationProfile.findUnique({
        where: { id },
        include: {
            bioData: true, 
            contactInfo: true, 
            oLevelResults: { include: { subjects: true } },
            uploadedDocuments: true,
            targetProgram: { select: { jambRequired: true, degreeType: true } }, // Fetch target program details
            tertiaryQualifications: true // Needed for postgraduate/DE validation
        }
    });

    if (!profile) {
        throw new AppError('Application profile not found.', 404);
    }
    if (profile.applicationStatus !== ApplicationStatus.PENDING_SUBMISSION) {
        throw new AppError(`Application cannot be submitted. Current status: '${profile.applicationStatus}'`, 400);
    }

    if (!profile.targetProgram) {
        throw new AppError('Please select a target program before submitting your application.', 400);
    }
    
    const userDocs = profile.uploadedDocuments.map(d => d.documentType);
    let requiredDocs = [
        DocumentType.PROFILE_PHOTO, 
        DocumentType.BIRTH_CERTIFICATE,
    ];

    // O-Level certificate is generally required for all non-postgraduate degrees.
    // If the institution allows two sittings, ensure logic supports either 1st or 2nd.
    const hasOLevelCert = userDocs.includes(DocumentType.OLEVEL_CERTIFICATE_FIRST_SITTING) || userDocs.includes(DocumentType.OLEVEL_CERTIFICATE_SECOND_SITTING);
    if (!hasOLevelCert && ![DegreeType.POSTGRADUATE_DIPLOMA, DegreeType.MASTERS, DegreeType.PHD].includes(profile.targetProgram.degreeType)) {
        requiredDocs.push(DocumentType.OLEVEL_CERTIFICATE_FIRST_SITTING); // Or handle 2nd sitting specifically if needed
    }


    // Conditional document requirements based on program type
    if (profile.targetProgram.jambRequired) {
        requiredDocs.push(DocumentType.JAMB_RESULT_SLIP);
    }

    const isPostgraduate = [
        DegreeType.POSTGRADUATE_DIPLOMA, DegreeType.MASTERS, DegreeType.PHD
    ].includes(profile.targetProgram.degreeType);

    const isDirectEntryEquivalent = [
        DegreeType.HND, DegreeType.ND, DegreeType.NCE, DegreeType.DIPLOMA, DegreeType.CERTIFICATE
    ].includes(profile.targetProgram.degreeType) && !profile.targetProgram.jambRequired; // Assuming non-JAMB HND/ND/NCE/Diploma/Cert is like DE

    if (isPostgraduate || isDirectEntryEquivalent) {
        requiredDocs.push(DocumentType.TERTIARY_CERTIFICATE); // e.g., ND cert for HND, BSc for Masters
        requiredDocs.push(DocumentType.TERTIARY_TRANSCRIPT); // For academic record verification

        if (!profile.tertiaryQualifications || profile.tertiaryQualifications.length === 0) {
            throw new AppError('Tertiary (Higher) Qualifications are required for your chosen program. Please add them in the "Higher Qualification" step.', 400);
        }
    }

    // Always require Certificate of Origin for all programs unless explicitly waived
    requiredDocs.push(DocumentType.CERTIFICATE_OF_ORIGIN);


    // Validate presence of all required documents
    for (const docType of requiredDocs) {
        if (!userDocs.includes(docType)) {
            const friendlyName = docType.replace(/_/g, ' ');
            // Capitalize each word for a friendlier error message
            throw new AppError(`${friendlyName.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')} is a required document for your chosen program. Please upload it.`, 400);
        }
    }

    // Basic data integrity checks (can be made more specific)
    if (!profile.bioData) throw new AppError('Bio-data is incomplete. Please fill out all required personal information.', 400);
    if (!profile.contactInfo) throw new AppError('Contact information is incomplete. Please fill out all required contact details.', 400);
    
    // For non-postgraduate, O-Levels are generally expected
    if (!isPostgraduate && profile.oLevelResults.length === 0) {
        throw new AppError('O-Level results are required for this program. Please add at least one sitting.', 400);
    }


    const updatedProfile = await prisma.applicationProfile.update({
        where: { id },
        data: { applicationStatus: ApplicationStatus.SUBMITTED },
        select: profileFullSelection 
    });

    return updatedProfile;
};

// MODIFIED: updateProfileAndAddToScreening to use nullable jambRegNo correctly
export const updateProfileAndAddToScreening = async (applicationProfileId, payload) => {
    const { targetProgramId, remarks } = payload;

    if (!targetProgramId) {
        throw new AppError('targetProgramId is required in the payload.', 400);
    }

    const updatedProfile = await prisma.$transaction(async (tx) => {
        const profile = await tx.applicationProfile.update({
            where: { id: applicationProfileId },
            data: {
                targetProgramId: parseInt(targetProgramId, 10),
                remarks: remarks,
            },
        });

        if (!profile) {
            throw new AppError('Application profile not found to update.', 404);
        }

        await tx.physicalScreeningList.upsert({
            where: {
                applicationProfileId: applicationProfileId,
            },
            update: {}, // If exists, do nothing or update timestamps/updater
            create: {
                applicationProfileId: applicationProfileId,
                jambRegNo: profile.jambRegNo, // This now safely uses the nullable jambRegNo from ApplicationProfile
                status: ApplicationStatus.UNDER_REVIEW,
                remarks: 'Added to screening list by admin.',
            }
        });

        return profile;
    });

    // Re-fetch the full profile after the transaction to ensure consistency
    const fullUpdatedProfile = await prisma.applicationProfile.findUnique({
        where: { id: applicationProfileId },
        select: profileFullSelection,
    });

    return fullUpdatedProfile;
};