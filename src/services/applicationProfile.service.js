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
    DegreeType, // Ensure DegreeType is imported
    EntryMode // Ensure EntryMode is imported (for jambApplicant.entryMode)
} from '../generated/prisma/index.js';


// MODIFIED: profileFullSelection remains as is (it already has programCode)
const profileFullSelection = {
    // ... (This section remains unchanged as it already includes bioData: true)
    id: true,
    jambRegNo: true,
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
            jambRegNo: true,
            email: true,
            jambApplicant: {
                 select: {
                    jambRegNo: true,
                    name: true,
                    email:true,
                    programName: true,
                    entryMode: true,
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
    targetProgram: {
        select: {
            id: true,
            name: true,
            programCode: true,
            degreeType: true,
            jambRequired: true,
            onlineScreeningRequired: true,
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
    bioData: true, // This is already true here for full selection
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

// --- CRITICAL MODIFICATION: profileSummarySelection to include bioData ---
const profileSummarySelection = {
    id: true,
    jambRegNo: true,
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
    // ADD THIS BLOCK TO FETCH FIRST AND LAST NAMES
    bioData: {
        select: {
            firstName: true,
            lastName: true,
            middleName: true, // You might want this too, though not used in applicantName directly
        }
    },
    targetProgram: {
        select: { 
            name: true, 
            programCode: true, 
            degreeType: true, 
            jambRequired: true, 
            onlineScreeningRequired: true,
            department: { // Ensure department and faculty are selected for filtering
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


async function fetchFullProfile(applicationProfileId) {
    const id = parseInt(applicationProfileId, 10);
    if (isNaN(id)) throw new AppError('Invalid applicationProfileId provided.', 400);
    
    const rawProfile = await prisma.applicationProfile.findUnique({
        where: { id },
        select: profileFullSelection,
    });
    
    if (!rawProfile) throw new AppError('Application profile not found.', 404);

    const jambApplicantName = rawProfile.onlineScreeningList?.jambApplicant?.name;
    const bioDataName = rawProfile.bioData ? `${rawProfile.bioData.firstName} ${rawProfile.bioData.lastName}` : null;

    const transformedProfile = {
        ...rawProfile,
        jambNameFromRecord: jambApplicantName || bioDataName || rawProfile.jambRegNo || rawProfile.email,
        profileImg: rawProfile.uploadedDocuments?.find(doc => doc.documentType === 'PROFILE_PHOTO')?.fileUrl || null,
    };
    
    return transformedProfile;
}

export const getMyApplicationProfile = async (applicationProfileId) => {
    return fetchFullProfile(applicationProfileId);
};

// ... (rest of the service functions: createApplicantProfileDirect, getAllApplicationProfiles, updateMyApplicationProfile, etc.)
// Make sure to use 'profileSummarySelection' in 'getAllApplicationProfiles' which it already does.

export const createApplicantProfileDirect = async (email, password, targetProgramId, jambRegNo = null, firstName = null, lastName = null) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        if (!email || !password || !targetProgramId) {
            throw new AppError('Email, password, and desired program are required.', 400);
        }

        const trimmedEmail = String(email).trim();
        const pTargetProgramId = parseInt(targetProgramId, 10);
        if (isNaN(pTargetProgramId)) throw new AppError('Invalid Target Program ID format.', 400);

        const targetProgram = await prisma.program.findUnique({
            where: { id: pTProgramId },
            select: { id: true, name: true, degreeType: true, jambRequired: true }
        });

        if (!targetProgram) {
            throw new AppError(`Target Program with ID ${targetProgramId} not found.`, 404);
        }

        if (targetProgram.jambRequired && !jambRegNo) {
             throw new AppError(`Program '${targetProgram.name}' requires a JAMB registration number, but none was provided.`, 400);
        }


        const hashedPassword = await hashPassword(password);

        const newProfile = await prisma.$transaction(async (tx) => {
            const existingScreeningAccount = await tx.onlineScreeningList.findUnique({ where: { email: trimmedEmail } });
            if (existingScreeningAccount) {
                throw new AppError(`An online screening account with email '${trimmedEmail}' already exists.`, 409);
            }
            const existingApplicationProfile = await tx.applicationProfile.findUnique({ where: { email: trimmedEmail } });
            if (existingApplicationProfile) {
                throw new AppError(`An application profile with email '${trimmedEmail}' already exists.`, 409);
            }

            const onlineScreeningAccount = await tx.onlineScreeningList.create({
                data: {
                    email: trimmedEmail,
                    password: hashedPassword,
                    isActive: true,
                },
                select: { id: true, email: true }
            });

            const applicationProfile = await tx.applicationProfile.create({
                data: {
                    email: trimmedEmail,
                    onlineScreeningListId: onlineScreeningAccount.id,
                    targetProgramId: targetProgram.id,
                    applicationStatus: ApplicationStatus.PENDING_SUBMISSION,
                    jambRegNo: jambRegNo // Pass jambRegNo if provided
                },
                select: {
                    id: true, email: true, applicationStatus: true, targetProgramId: true,
                    onlineScreeningListId: true, jambRegNo: true
                }
            });

            // NEW: Create ApplicantBioData if firstName or lastName are provided
            if (firstName || lastName) {
                await tx.applicantBioData.create({
                    data: {
                        applicationProfileId: applicationProfile.id,
                        firstName: firstName,
                        lastName: lastName,
                        // You might want to default gender or other fields here,
                        // or make them optional in bioData for initial creation.
                        // For simplicity, defaulting to 'OTHER' for gender if not provided
                        gender: Gender.OTHER // Default or set to null if your schema allows
                    }
                });
            }

            return applicationProfile;
        });

        return newProfile;
    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2002') {
             const target = error.meta?.target;
             if (target?.includes('email')) throw new AppError('Email already in use for a screening account or application profile.', 409);
             if (target?.includes('jambRegNo')) throw new AppError('JAMB Registration Number already in use for an application profile.', 409);
             throw new AppError('Failed to create profile due to a conflict.', 409);
        }
        console.error("Error creating direct applicant profile:", error.message, error.stack);
        throw new AppError('Could not create applicant profile.', 500);
    }
};

export const getAllApplicationProfiles = async (query) => {
    // 1. Destructure new filter parameters
    const { page = "1", limit = "10", search, programId, status, entryMode, seasonId, departmentId, facultyId, degreeType } = query;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const where = {};
    const filters = [];
    if (search) {
        filters.push({
            OR: [
                { jambRegNo: { contains: search} },
                { email: { contains: search } },
                { onlineScreeningList: { jambApplicant: { name: { contains: search,  } } } },
                // Make sure bioData is correctly queried here if it's nested
                { bioData: { OR: [{ firstName: { contains: search } }, { lastName: { contains: search} }] } }
            ]
        });
    }
    if (status && status !== 'all') { filters.push({ applicationStatus: status }); }
    if (programId && programId !== 'all') { filters.push({ targetProgramId: parseInt(programId, 10) }); }
    
    // NEW: Filter by degreeType
    if (degreeType && degreeType !== 'all') {
        // Ensure the degreeType exists in your Prisma enum
        if (!Object.values(DegreeType).includes(degreeType)) {
             throw new AppError(`Invalid degree type: ${degreeType}.`, 400);
        }
        filters.push({
            targetProgram: {
                degreeType: degreeType
            }
        });
    }

    // NEW: Filter by departmentId
    if (departmentId && departmentId !== 'all') {
        const dId = parseInt(departmentId, 10);
        if (!isNaN(dId)) {
            filters.push({
                targetProgram: {
                    departmentId: dId
                }
            });
        }
    }

    // NEW: Filter by facultyId
    if (facultyId && facultyId !== 'all') {
        const fId = parseInt(facultyId, 10);
        if (!isNaN(fId)) {
            filters.push({
                targetProgram: {
                    department: {
                        facultyId: fId
                    }
                }
            });
        }
    }


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
            select: profileSummarySelection, // Uses the modified selection
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
            email, phone, targetProgramId, password, 
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

                if (newTargetProgram.jambRequired && !existingProfile.jambRegNo) {
                    throw new AppError(`Cannot switch to program '${newTargetProgram.name}' (ID: ${pTProgramId}) as it requires a JAMB Registration Number, which you do not have.`, 400);
                }
            }
            profileUpdates.targetProgramId = pTProgramId;
        }
        if (password) {
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
                if (phone && phone !== existingProfile.phone) {
                    const phoneInUse = await tx.applicationProfile.findFirst({where: {phone: phone, id: {not: applicationProfileId}}});
                    if(phoneInUse) throw new AppError('Phone number already in use by another applicant.', 409);
                    profileUpdates.phone = phone;
                }
                if (email && email !== existingProfile.email) {
                    const emailInUse = await tx.applicationProfile.findFirst({where: {email: email, id: {not: applicationProfileId}}});
                    if(emailInUse) throw new AppError('Email already in use by another applicant.', 409);
                    profileUpdates.email = email;
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
                        create: { applicationProfileId: applicationProfileId, ...bioData },
                        update: bioData,
                    });
                }

                if (contactInfo) {
                    await tx.applicantContactInfo.upsert({
                        where: { applicationProfileId },
                        create: { applicationProfileId: applicationProfileId, ...contactInfo },
                        update: contactInfo,
                    });
                }
                break;
            
            case 'next-of-kin':
                const { nextOfKin, guardianInfo } = data;

                if (nextOfKin) {
                    await tx.applicantNextOfKin.upsert({
                        where: { applicationProfileId },
                        create: { applicationProfileId: applicationProfileId, ...nextOfKin },
                        update: nextOfKin,
                    });
                }
                if (guardianInfo) {
                    await tx.applicantGuardianInfo.upsert({
                        where: { applicationProfileId },
                        create: { applicationProfileId: applicationProfileId, ...guardianInfo },
                        update: guardianInfo,
                    });
                }
                break;

            case 'education':
                const { oLevelResults } = data;
                if (!oLevelResults || !Array.isArray(oLevelResults)) {
                    throw new AppError('O-Level results data is missing or not an array.', 400);
                }
                
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
                status: DocumentUploadStatus.UPLOADED,
                rejectionReason: null,
                verifiedBy: null,
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

// --- UPDATED submitApplicationProfile FUNCTION ---
export const submitApplicationProfile = async (applicationProfileId) => {
    const id = parseInt(applicationProfileId, 10);
    
    const profile = await prisma.applicationProfile.findUnique({
        where: { id },
        include: {
            bioData: true, 
            contactInfo: true, 
            oLevelResults: { include: { subjects: true } },
            uploadedDocuments: true,
            targetProgram: { 
                select: { 
                    jambRequired: true, 
                    degreeType: true 
                } 
            },
            tertiaryQualifications: true,
            onlineScreeningList: {
                select: {
                    jambApplicant: { // To get the JAMB EntryMode
                        select: {
                            entryMode: true
                        }
                    }
                }
            }
        }
    });

    if (!profile) {
        throw new AppError('Application profile not found.', 404);
    }
    if (profile.applicationStatus !== ApplicationStatus.PENDING_SUBMISSION) {
        throw new AppError(`Application cannot be submitted. Current status: '${profile.applicationStatus}'`, 400);
    }

    const isJambApplicant = profile.jambRegNo !== null; // Check if jambRegNo is present
    const isProgramSelectionDeferredForJambApplicant = isJambApplicant && !profile.targetProgram;

    if (!profile.targetProgram && !isProgramSelectionDeferredForJambApplicant) {
        throw new AppError('Please select a target program before submitting your application.', 400);
    }
    
    const userDocs = profile.uploadedDocuments.map(d => d.documentType);
    const targetDegreeType = profile.targetProgram?.degreeType; // This can now be null if selection is deferred
    const jambEntryMode = profile.onlineScreeningList?.jambApplicant?.entryMode; // EntryMode from JAMB if available
    const programRequiresJamb = profile.targetProgram?.jambRequired; // Only check if targetProgram exists

    // --- Basic Data Integrity Checks ---
    if (!profile.bioData) throw new AppError('Bio-data is incomplete. Please fill out all required personal information.', 400);
    if (!profile.contactInfo) throw new AppError('Contact information is incomplete. Please fill out all required contact details.', 400);
    
    // --- Universal Document Requirements ---
    const universalRequiredDocs = [
        DocumentType.PROFILE_PHOTO, 
        DocumentType.BIRTH_CERTIFICATE,
        DocumentType.CERTIFICATE_OF_ORIGIN,
    ];
    for (const docType of universalRequiredDocs) {
        if (!userDocs.includes(docType)) {
            const friendlyName = String(docType).replace(/_/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
            throw new AppError(`${friendlyName} is a required document. Please upload it.`, 400);
        }
    }

    // --- O-Level Document Requirement (Universal) ---
    const hasOLevelCert = userDocs.includes(DocumentType.OLEVEL_CERTIFICATE_FIRST_SITTING) || 
                           userDocs.includes(DocumentType.OLEVEL_CERTIFICATE_SECOND_SITTING);
    if (!hasOLevelCert) {
        throw new AppError('O-Level Certificate (First or Second Sitting) is a required document for all applicants. Please upload it.', 400);
    }

    // --- JAMB Result Slip Requirement ---
    // Rule: Undergraduate/HND applicants (JAMB-sourced) need JAMB slip.
    if (isJambApplicant && (targetDegreeType === DegreeType.UNDERGRADUATE || targetDegreeType === DegreeType.HND || isProgramSelectionDeferredForJambApplicant)) {
        if (!userDocs.includes(DocumentType.JAMB_RESULT_SLIP)) {
            throw new AppError('As a JAMB applicant for an Undergraduate or HND program, your JAMB Result Slip is required. Please upload it.', 400);
        }
    }
    // For other degree types (PGD, Masters, PhD, ND, NCE, Certificate, Diploma) or non-JAMB applicants, JAMB slip is not required.


    // --- Tertiary (Higher) Qualification & Document Requirements ---
    let requiredTertiaryQualsCount = 0; // Number of tertiary qualification records required
    let requireTertiaryCertDoc = false;
    let requireTertiaryTranscriptDoc = false;

    const currentTertiaryQualsCount = profile.tertiaryQualifications?.length || 0;

    // Only apply tertiary qualification rules if a target program IS selected.
    // If program selection is deferred for JAMB applicant, skip these complex checks for now,
    // as their actual tertiary requirements depend on the program they are eventually assigned.
    if (!isProgramSelectionDeferredForJambApplicant && targetDegreeType) { // Only proceed if program selected
        switch (targetDegreeType) {
            case DegreeType.UNDERGRADUATE:
            case DegreeType.HND:
                // Rule: UG/HND (JAMB DE) needs 1 tertiary qual (ND or NCE for UG, ND for HND)
                if (isJambApplicant && jambEntryMode === EntryMode.DIRECT_ENTRY) {
                    requiredTertiaryQualsCount = 1;
                    requireTertiaryCertDoc = true;
                    // Transcript NOT required for UG/HND Direct Entry (as per your rule)
                }
                // Rule: For non-JAMB direct entry to UG/HND (if your system allows this path, e.g. for HND direct entry without JAMB)
                // Assuming such applicants still need 1 tertiary qual.
                else if (!isJambApplicant && (targetDegreeType === DegreeType.UNDERGRADUATE || targetDegreeType === DegreeType.HND)) {
                     requiredTertiaryQualsCount = 1;
                     requireTertiaryCertDoc = true;
                }
                // UTME does not require tertiary qualifications (default 0)
                break;

            case DegreeType.POSTGRADUATE_DIPLOMA:
                // Rule: PGD requires 1 qualification (HND or BSc)
                requiredTertiaryQualsCount = 1;
                requireTertiaryCertDoc = true;
                // Transcript NOT required for PGD (as per your rule)
                break;

            case DegreeType.MASTERS:
                // Rule: Masters requires 1 qualification (BSc or PGD)
                requiredTertiaryQualsCount = 1;
                requireTertiaryCertDoc = true;

                // Conditional Transcript for Masters: if no PGD among existing qualifications
                const hasPGD = profile.tertiaryQualifications?.some(
                    (q) => q.qualificationObtained === TertiaryQualificationType.PGD
                );
                if (!hasPGD) {
                    requireTertiaryTranscriptDoc = true; // If no PGD, then transcript is needed (assuming from Bachelor's)
                }
                break;

            case DegreeType.PHD:
                // Rule: PhD requires 2 qualifications (Master's and BSc)
                requiredTertiaryQualsCount = 2;
                requireTertiaryCertDoc = true;
                requireTertiaryTranscriptDoc = true;
                break;
                
            case DegreeType.PROFESSIONAL_DOCTORATE: // Assumed this from "Assoc Pro"
                // Rule: Professional Doctorate requires 3 qualifications
                requiredTertiaryQualsCount = 3;
                requireTertiaryCertDoc = true;
                requireTertiaryTranscriptDoc = true;
                break;

            case DegreeType.ND:
            case DegreeType.NCE:
            case DegreeType.CERTIFICATE:
            case DegreeType.DIPLOMA:
                // Rule: These programs do not require higher qualifications (data or documents)
                break;

            default:
                // Handle any other/new degree types. Default to no tertiary requirements.
                break;
        }
    } else if (isProgramSelectionDeferredForJambApplicant) {
        // If program is not selected for JAMB applicants, do NOT enforce any tertiary quals/docs for submission.
        // These will be checked after program assignment.
        requiredTertiaryQualsCount = 0;
        requireTertiaryCertDoc = false;
        requireTertiaryTranscriptDoc = false;
    }


    // Validate Tertiary Qualification Data (records entered in the "Higher Qualification" step)
    if (requiredTertiaryQualsCount > 0) {
        if (currentTertiaryQualsCount < requiredTertiaryQualsCount) {
            throw new AppError(
                `Tertiary (Higher) Qualifications are required for your chosen program. You need to provide at least ${requiredTertiaryQualsCount} qualification(s) in the "Higher Qualification" step.`,
                400
            );
        }
    }

    // Validate Tertiary Qualification Documents
    if (requireTertiaryCertDoc && !userDocs.includes(DocumentType.TERTIARY_CERTIFICATE)) {
        throw new AppError('TERTIARY CERTIFICATE is a required document for your chosen program. Please upload it.', 400);
    }
    if (requireTertiaryTranscriptDoc && !userDocs.includes(DocumentType.TERTIARY_TRANSCRIPT)) {
        throw new AppError('TERTIARY TRANSCRIPT is a required document for your chosen program. Please upload it.', 400);
    }

    // If all checks pass, update application status to SUBMITTED
    const updatedProfile = await prisma.applicationProfile.update({
        where: { id },
        data: { applicationStatus: ApplicationStatus.SUBMITTED },
        select: profileFullSelection
    });

    return updatedProfile;
};

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
                jambRegNo: profile.jambRegNo,
                status: 'UNDER_REVIEW',
            }
        });

        return profile;
    });

    const fullUpdatedProfile = await prisma.applicationProfile.findUnique({
        where: { id: applicationProfileId },
        select: profileFullSelection,
    });

    return fullUpdatedProfile;
};