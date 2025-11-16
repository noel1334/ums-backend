import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import { hashPassword } from '../utils/password.utils.js';
import { ApplicationStatus, Gender, DocumentUploadStatus, OLevelGrade, TertiaryQualificationType, DocumentType } from '../generated/prisma/index.js';


const profileFullSelection = {
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
    targetProgram: { // This is the program the applicant applied for, not necessarily the one they were offered
        select: {
            id: true,
            name: true,
            programCode: true,
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
    // --- IMPORTANT FIX FOR ADMISSION LETTER DATA ---
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
                    // levelCode: true,
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
const profileSummarySelection = {
    id: true,
    jambRegNo: true,
    email: true, // Keep this for email
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
        select: { name: true }
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

    const transformedProfile = {
        ...rawProfile,
        jambNameFromRecord: rawProfile.onlineScreeningList?.jambApplicant?.name || rawProfile.jambRegNo,
        profileImg: rawProfile.uploadedDocuments?.find(doc => doc.documentType === 'PROFILE_PHOTO')?.fileUrl || null,
        // Removed the 'delete' statements here, as they were the cause of missing data
    };
    
    return transformedProfile;
}

// --- EXPORTED SERVICE FUNCTIONS ---

export const getMyApplicationProfile = async (applicationProfileId) => {
    return fetchFullProfile(applicationProfileId);
};

export const createApplicantProfile = async (profileData) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const trimmedJambRegNo = String(jambRegNo).trim();

        // Find the screening account and check for a linked application profile ID
        const screeningAccount = await prisma.onlineScreeningList.findUnique({
            where: { jambRegNo: trimmedJambRegNo },
            select: { id: true, password: true, isActive: true, applicationProfile: { select: { id: true } } }
        });

        if (!screeningAccount) throw new AppError('Invalid JAMB RegNo or you are not shortlisted.', 404);
        if (!screeningAccount.isActive) throw new AppError('Screening account is inactive.', 403);
        if (!screeningAccount.applicationProfile?.id) {
            throw new AppError('Critical Error: No application profile linked.', 500);
        }

        const isPasswordMatch = await comparePassword(password, screeningAccount.password);
        if (!isPasswordMatch) throw new AppError('Incorrect password.', 401);

        await prisma.onlineScreeningList.update({
            where: { id: screeningAccount.id },
            data: { lastLogin: new Date() }
        });

        // The original logic for returning full profile on login should already be calling getMyApplicationProfile
        // Ensure this part is correct in your auth.service.js
        // For example, in auth.service.js:
        // const fullApplicationProfile = await getMyApplicationProfile(screeningAccount.applicationProfile.id);


        // THIS IS NOT THE loginApplicantScreening function itself, but a helper.
        // This file is applicantProfile.service.js.
        // The actual loginApplicantScreening function (likely in auth.service.js) should call this getMyApplicationProfile.
        // The return of createApplicantProfile should not fetch the full profile like this.
        const hashedPassword = await hashPassword(password);
        const newProfile = await prisma.applicationProfile.create({
            data: {
                jambRegNo,
                email,
                phone,
                onlineScreeningList: {
                    create: { // Create the linked OnlineScreeningList record
                        jambRegNo: jambRegNo,
                        email: email,
                        password: hashedPassword,
                        // Other fields if necessary like isActive: true etc.
                    }
                },
                applicationStatus: ApplicationStatus.PENDING_SUBMISSION,
            },
            select: {
                id: true,
                jambRegNo: true,
                email: true,
                applicationStatus: true
            }
        });
        return newProfile;
    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2002') {
             const target = error.meta?.target;
             if (target?.includes('jambRegNo')) throw new AppError(`Profile for ${profileData.jambRegNo} already exists (P2002).`, 409);
             if (target?.includes('email')) throw new AppError('Email already in use by another applicant (P2002).', 409);
             if (target?.includes('phone')) throw new AppError('Phone number already in use by another applicant (P2002).', 409);
             throw new AppError('Failed to create profile due to a conflict.', 409);
        }
        console.error("Error creating applicant profile:", error.message, error.stack);
        throw new AppError('Could not create applicant profile.', 500);
    }
};

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
                { jambRegNo: { contains: search } },
                { onlineScreeningList: { jambApplicant: { name: { contains: search } } } },
                { email: { contains: search } },
            ]
        });
    }
    if (status && status !== 'all') { filters.push({ applicationStatus: status }); }
    if (programId && programId !== 'all') { filters.push({ targetProgramId: parseInt(programId, 10) }); }
    const jambApplicantWhere = {};
    if (entryMode && entryMode !== 'all') { jambApplicantWhere.entryMode = entryMode; }
    if (seasonId && seasonId !== 'all') {
        const sId = parseInt(seasonId, 10);
        if (!isNaN(sId)) { jambApplicantWhere.jambSeasonId = sId; }
    }
    if (Object.keys(jambApplicantWhere).length > 0) {
        filters.push({ onlineScreeningList: { jambApplicant: jambApplicantWhere } });
    }
    if (filters.length > 0) { where.AND = filters; }

    const [profiles, totalProfiles] = await prisma.$transaction([
        prisma.applicationProfile.findMany({
            where,
            select: profileSummarySelection, // Ensure this selects all necessary fields
            skip,
            take: limitNum,
            orderBy: { createdAt: 'desc' },
        }),
        prisma.applicationProfile.count({ where }),
    ]);

    return {
        profiles: profiles, // Directly return the profiles array from Prisma
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
            include: { bioData: true, contactInfo: true, nextOfKin: true, guardianInfo: true }
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
        }
        if (phone && phone !== existingProfile.phone) {
             const phoneInUse = await prisma.applicationProfile.findFirst({where: {phone: phone, id: {not: id}}});
            if(phoneInUse) throw new AppError('Phone number already in use.', 409);
            profileUpdates.phone = phone;
        }
        if (targetProgramId !== undefined) {
            const pTProgramId = targetProgramId === null ? null : parseInt(targetProgramId, 10);
            if (targetProgramId !== null && isNaN(pTProgramId)) throw new AppError('Invalid Target Program ID.', 400);
            if (pTProgramId && !(await prisma.program.findUnique({where: {id: pTProgramId}}))) {
                throw new AppError(`Target Program ID ${pTProgramId} not found.`, 404);
            }
            profileUpdates.targetProgramId = pTProgramId;
        }
        if (password) {
            profileUpdates.password = await hashPassword(password);
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
                if (phone) profileUpdates.phone = phone;
                if (email) profileUpdates.email = email;

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
                status: 'UPLOADED',
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
            }
        });
    }

    return getMyApplicationProfile(applicationProfileId);
};

export const submitApplicationProfile = async (applicationProfileId) => {
    const id = parseInt(applicationProfileId, 10);
    
    const profile = await prisma.applicationProfile.findUnique({
        where: { id },
        include: {
            bioData: true, 
            contactInfo: true, 
            oLevelResults: { include: { subjects: true } },
            uploadedDocuments: true
        }
    });

    if (!profile) {
        throw new AppError('Application profile not found.', 404);
    }
    if (profile.applicationStatus !== 'PENDING_SUBMISSION') {
        throw new AppError(`Application cannot be submitted. Current status: '${profile.applicationStatus}'`, 400);
    }
    
    const requiredDocs = [
        'PROFILE_PHOTO', 
        'BIRTH_CERTIFICATE',
        'OLEVEL_CERTIFICATE_FIRST_SITTING',
        'CERTIFICATE_OF_ORIGIN',
        'JAMB_RESULT_SLIP'
    ];
    
    const userDocs = profile.uploadedDocuments.map(d => d.documentType);

    for (const docType of requiredDocs) {
        if (!userDocs.includes(docType)) {
            const friendlyName = docType.replace(/_/g, ' ');
            throw new AppError(`${friendlyName} is a required document. Please go back and upload it.`, 400);
        }
    }

    const updatedProfile = await prisma.applicationProfile.update({
        where: { id },
        data: { applicationStatus: 'SUBMITTED' },
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
            update: {}, 
            create: {
                applicationProfileId: applicationProfileId,
                jambRegNo: profile.jambRegNo,
                status: 'UNDER_REVIEW',
                remarks: 'Added to screening list by admin.',
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