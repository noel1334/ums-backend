import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import { hashPassword } from '../utils/password.utils.js'; 
import { EntryMode, Gender, LecturerRole, DocumentType } from '../generated/prisma/index.js'; 

import { SemesterType, CourseType } from '../generated/prisma/index.js'; 
import config from '../config/index.js'; 

const studentPublicSelection = {
    id: true,
    regNo: true,
    jambRegNo: true,
    name: true,
    email: true,
    entryMode: true,
    yearOfAdmission: true,
    admissionSeasonId: true,
    admissionSemesterId: true,
    departmentId: true,
    programId: true,
    entryLevelId: true,
    currentLevelId: true,
    isGraduated: true,
    graduationSeasonId: true,
    graduationSemesterId: true,
    currentSeasonId: true,
    currentSemesterId: true,
    isActive: true,
    profileImg: true,
    createdAt: true,
    updatedAt: true,
    entryLevel: { select: { id: true, name: true, value: true } },
    currentLevel: { select: { id: true, name: true, value: true } },
    department: { select: { id: true, name: true, faculty: { select: { id: true, name: true, facultyCode: true } } } }, // Add this
    program: { select: { id: true, name: true, programCode: true, degree: true, duration: true, modeOfStudy: true } }, // Add this
    admissionSeason: { select: { id: true, name: true } },
    admissionSemester: { select: { id: true, name: true, type: true } },
    graduationSeason: { select: { id: true, name: true } },
    graduationSemester: { select: { id: true, name: true, type: true } },
    currentSeason: { select: { id: true, name: true } },
    currentSemester: { select: { id: true, name: true, type: true } },
    studentDetails: true, // This includes dob, gender, address, phone, guardian info
    _count: { select: { registrations: true, results: true } }
};

// Comprehensive selection for individual student profiles (Admin/ICT view)
const studentFullSelection = {
    ...studentPublicSelection, // Start with everything in public selection
    // Add additional comprehensive details below:
    admissionOfferDetails: {
        select: {
            id: true,
            hasPaidAcceptanceFee: true,
            admissionLetterUrl: true,
            isAccepted: true,
            acceptanceDate: true,
            offeredProgram: {
                select: {
                    id: true, name: true, programCode: true, degreeType: true, duration: true, modeOfStudy: true,
                    department: { select: { id: true, name: true, faculty: { select: { id: true, name: true } } } }
                }
            },
            offeredLevel: { select: { id: true, name: true } },
            admissionSeason: { select: { id: true, name: true } },
            admissionSemester: { select: { id: true, name: true } }
        }
    },
    // Link back to original application profile for detailed applicant data
    admissionOfferDetails: {
        select: {
            applicationProfile: {
                select: {
                    id: true,
                    jambRegNo: true,
                    email: true, // Original applicant email
                    phone: true, // Original applicant phone
                    applicationStatus: true,
                    bioData: {  // <--- Include bioData with nationality
                        select: {
                            nationality: true, // Include nationality
                        }
                    },
                    contactInfo: true,
                    nextOfKin: true,
                    guardianInfo: true,
                    oLevelResults: {
                        include: { subjects: true },
                        orderBy: { sittingNumber: 'asc' }
                    },
                    tertiaryQualifications: {
                        orderBy: { graduationYear: 'desc' }
                    },
                    uploadedDocuments: {
                        select: {
                            documentType: true, fileUrl: true, fileName: true, fileType: true,
                            fileSize: true, status: true, rejectionReason: true,
                            verifiedBy: true, verifiedAt: true, uploadedAt: true, updatedAt: true,
                        },
                        orderBy: { documentType: 'asc' }
                    },
                    onlineScreeningList: {
                        select: {
                            jambApplicant: {
                                select: {
                                    jambRegNo: true, name: true, email: true, programName: true,
                                    entryMode: true, jambScore: true, gender: true,
                                    jambYear: true, // Added jambYear for more info
                                    jambSeason: { select: { id: true, name: true } }
                                }
                            }
                        }
                    }
                }
            }
        }
    },
};
const registrationStudentSelection = {
    id: true, // <-- THIS IS THE CRITICAL FK (studentCourseRegistrationId)
    studentId: true,
    courseId: true,
    semesterId: true,
    seasonId: true,
    // Include the student's details
    student: {
        select: {
            id: true,
            regNo: true,
            name: true,
            email: true,
            department: { select: { name: true } },
            currentLevel: { select: { value: true } },
            // Add any other required fields here (e.g., currentLevelId)
        }
    },
    course: { select: { id: true, code: true, title: true, creditUnit: true } },
    // Add other fields if needed, like level, semester, season details for display
};

// Make sure these are properly imported and defined if used in the existing functions
const studentSelfEditableStudentFields = ['password', 'profileImg'];
const studentSelfEditableDetailsFields = ['dob', 'gender', 'address', 'phone', 'guardianName', 'guardianPhone'];
const adminEditableStudentFields = [
    'jambRegNo', 'name', 'email', 'entryMode', 'yearOfAdmission',
    'admissionSeasonId', 'admissionSemesterId', 'departmentId', 'programId',
    'entryLevelId', 'currentLevelId', 'currentSeasonId', 'currentSemesterId',
    'isActive', 'isGraduated', 'password', 'profileImg',
    'graduationSeasonId', 'graduationSemesterId'
];

const getEntryModeAbbreviation = (entryMode) => {
    switch (entryMode) {
        case EntryMode.UTME: return 'U';
        case EntryMode.DIRECT_ENTRY: return 'D';
        case EntryMode.TRANSFER: return 'T';
        default:
            console.warn(`[StudentService] Invalid entry mode for abbreviation: ${entryMode}`);
            return 'X'; // Fallback or throw error depending on strictness
    }
};

export const createStudent = async (studentData) => {
    console.log("[createStudent Service] Called with data:", studentData);
    try {
        if (!prisma) {
            console.error("[createStudent Service] Prisma client not available.");
            throw new AppError('Prisma client is not available.', 500);
        }

        const {
            applicationProfileId, // NEW: Expect applicationProfileId in studentData
            jambRegNo, name, email: studentEmail, entryMode,
            yearOfAdmission, admissionSeasonId, admissionSemesterId,
            departmentId, programId, password: providedPassword, profileImg,
            isActive, isGraduated,
            dob, gender, address, phone, guardianName, guardianPhone,
            entryLevelId: entryLevelIdInput
        } = studentData;

        // --- Password Handling ---
        let passwordToHash;
        if (providedPassword && String(providedPassword).trim() !== '') {
            passwordToHash = String(providedPassword).trim();
            console.log(`[createStudent DEBUG] Using provided password.`);
        } else if (config.studentDefaultPassword) {
            console.log(`[createStudent DEBUG] No password provided, using STUDENT_DEFAULT_PASSWORD: "${config.studentDefaultPassword}"`);
            passwordToHash = config.studentDefaultPassword;
        } else {
            throw new AppError('Password is required for student, and no default student password is configured.', 400);
        }
        const hashedPassword = await hashPassword(passwordToHash);
        console.log(`[createStudent DEBUG] Password to be hashed: "${passwordToHash}"`);

        // --- Core Validations ---
        if (!name || !studentEmail || !entryMode || yearOfAdmission === undefined ||
            admissionSeasonId === undefined || admissionSemesterId === undefined ||
            departmentId === undefined || programId === undefined ||
            !applicationProfileId) { // NEW: Validate applicationProfileId
            throw new AppError('Required student fields (name, email, entryMode, admission year/season/semester, department, program, applicationProfileId) are missing.', 400);
        }
        if (!Object.values(EntryMode).includes(entryMode)) throw new AppError(`Invalid entry mode: ${entryMode}.`, 400);
        if (gender && gender !== null && gender !== "" && !Object.values(Gender).includes(gender)) throw new AppError(`Invalid gender: ${gender}.`, 400);

        const pDepartmentId = parseInt(String(departmentId), 10);
        const pProgramId = parseInt(String(programId), 10);
        const pAdmissionSeasonId = parseInt(String(admissionSeasonId), 10);
        const pAdmissionSemesterId = parseInt(String(admissionSemesterId), 10);
        const pYearOfAdmission = parseInt(String(yearOfAdmission), 10);
        const pApplicationProfileId = parseInt(String(applicationProfileId), 10); // NEW: Parse applicationProfileId

        if (isNaN(pDepartmentId) || isNaN(pProgramId) || isNaN(pAdmissionSeasonId) || isNaN(pAdmissionSemesterId) || isNaN(pYearOfAdmission) || isNaN(pApplicationProfileId)) { // NEW: Include applicationProfileId
            throw new AppError('Invalid ID format for department, program, season, semester, year of admission, or application profile ID.', 400);
        }

        // --- Existence Checks ---
        const [departmentExists, programExists, adSeasonExists, adSemesterExists, admissionOfferExists] = await Promise.all([ // NEW: Check for admission offer
            prisma.department.findUnique({ where: { id: pDepartmentId } }),
            prisma.program.findUnique({ where: { id: pProgramId, departmentId: pDepartmentId } }),
            prisma.season.findUnique({ where: { id: pAdmissionSeasonId } }),
            prisma.semester.findUnique({ where: { id: pAdmissionSemesterId, seasonId: pAdmissionSeasonId } }),
            prisma.admissionOffer.findUnique({ where: { applicationProfileId: pApplicationProfileId } }) // NEW: Check for existing admission offer
        ]);
        if (!departmentExists) throw new AppError(`Department ID ${pDepartmentId} not found.`, 404);
        if (!programExists) throw new AppError(`Program ID ${pProgramId} not found or not in department ${pDepartmentId}.`, 404);
        if (!adSeasonExists) throw new AppError(`Admission Season ID ${pAdmissionSeasonId} not found.`, 404);
        if (!adSemesterExists) throw new AppError(`Admission Semester ID ${pAdmissionSemesterId} (for season ${pAdmissionSeasonId}) not found.`, 404);
        if (!admissionOfferExists) throw new AppError(`Admission Offer for Application Profile ID ${pApplicationProfileId} not found. A student can only be created from an existing offer.`, 404); // NEW: Error if no offer

        // --- Determine Entry Level ID ---
        let determinedEntryLevelId;
        if (entryLevelIdInput !== undefined && entryLevelIdInput !== null && String(entryLevelIdInput).trim() !== '') {
            determinedEntryLevelId = parseInt(String(entryLevelIdInput), 10);
            if (isNaN(determinedEntryLevelId)) throw new AppError('Invalid entryLevelId provided.', 400);
            const entryLevelRecord = await prisma.level.findUnique({ where: { id: determinedEntryLevelId } });
            if (!entryLevelRecord) throw new AppError(`Provided Entry Level ID ${determinedEntryLevelId} not found.`, 404);
        } else {
            let entryLevelName;
            if (entryMode === EntryMode.UTME) entryLevelName = "100 Level";
            else if (entryMode === EntryMode.DIRECT_ENTRY) entryLevelName = "200 Level";
            else if (entryMode === EntryMode.TRANSFER) throw new AppError('For TRANSFER entry mode, an explicit entryLevelId is required.', 400);
            else throw new AppError('Cannot determine entry level for the given entry mode.', 400);
            const entryLevelRecord = await prisma.level.findUnique({ where: { name: entryLevelName } });
            if (!entryLevelRecord) throw new AppError(`Default entry level '${entryLevelName}' for mode '${entryMode}' not found. Please configure levels.`, 500);
            determinedEntryLevelId = entryLevelRecord.id;
        }

        // --- Uniqueness Checks (Email, JambRegNo, Phone in details) ---
        const trimmedEmail = String(studentEmail).trim();
        const trimmedJambRegNo = jambRegNo ? String(jambRegNo).trim() : null;
        const trimmedPhone = phone ? String(phone).trim() : null;

        const [existingByEmail, existingByJambRegNo, existingByDetailsPhone] = await Promise.all([
            prisma.student.findUnique({ where: { email: trimmedEmail } }),
            trimmedJambRegNo ? prisma.student.findUnique({ where: { jambRegNo: trimmedJambRegNo } }) : null,
            trimmedPhone ? prisma.studentDetails.findFirst({ where: { phone: trimmedPhone } }) : null,
        ]);
        if (existingByEmail) throw new AppError(`A student with email '${trimmedEmail}' already exists.`, 409);
        if (existingByJambRegNo) throw new AppError(`A student with JAMB RegNo '${trimmedJambRegNo}' already exists.`, 409);
        if (existingByDetailsPhone) throw new AppError(`A student with phone number '${trimmedPhone}' in details already exists.`, 409);

        console.log("[createStudent DEBUG] Proceeding to transaction for RegNo generation.");
        const newStudent = await prisma.$transaction(async (tx) => {
            console.log("[createStudent DEBUG] Inside transaction - Step 1: Creating student record without regNo.");
            const studentCreateDataBase = {
                jambRegNo: trimmedJambRegNo, name: String(name).trim(), email: trimmedEmail, entryMode,
                profileImg: profileImg ? String(profileImg).trim() : null,
                yearOfAdmission: pYearOfAdmission, admissionSeasonId: pAdmissionSeasonId,
                admissionSemesterId: pAdmissionSemesterId, departmentId: pDepartmentId, programId: pProgramId,
                entryLevelId: determinedEntryLevelId, currentLevelId: determinedEntryLevelId,
                currentSeasonId: pAdmissionSeasonId, currentSemesterId: pAdmissionSemesterId,
                password: hashedPassword,
                isActive: isActive === undefined ? true : Boolean(isActive),
                isGraduated: isGraduated === undefined ? false : Boolean(isGraduated),
                // regNo is NOT set here initially
            };

            let studentDetailsCreatePayload;
            if (dob || gender || address || phone || guardianName || guardianPhone) {
                // Assuming `gender` can be explicitly `null` if that's intended by the schema.
                // Otherwise, it might be required if other details are provided.
                if (gender === undefined || gender === "") { // If gender is truly optional and not provided or empty string
                   // No check needed, Prisma will use default/null based on schema
                } else if (!Object.values(Gender).includes(gender)) {
                    throw new AppError('Gender is required and must be a valid enum (MALE/FEMALE) if providing other student details.', 400);
                }

                studentDetailsCreatePayload = {
                    dob: dob ? new Date(dob) : null,
                    gender: gender || null, // Ensure `null` is used for empty string or undefined
                    address: address ? String(address).trim() : null,
                    phone: trimmedPhone,
                    guardianName: guardianName ? String(guardianName).trim() : null,
                    guardianPhone: guardianPhone ? String(guardianPhone).trim() : null,
                };
            }

            const createdStudent = await tx.student.create({
                data: {
                    ...studentCreateDataBase,
                    ...(studentDetailsCreatePayload && { studentDetails: { create: studentDetailsCreatePayload } })
                },
                select: { id: true, yearOfAdmission: true, entryMode: true, departmentId: true } // Select fields needed for regNo generation
            });
            console.log("[createStudent DEBUG] Step 1 complete. Student created with DB ID:", createdStudent.id);

            // --- Step 2: Generate Registration Number ---
            const yearAbbr = String(createdStudent.yearOfAdmission).slice(-2);
            const entryModeAbbr = getEntryModeAbbreviation(createdStudent.entryMode);
            const sequencePart = createdStudent.id.toString().padStart(5, '0'); // Pad ID to 5 digits
            const finalRegNo = `${yearAbbr}/${sequencePart}${entryModeAbbr}/${createdStudent.departmentId}`;
            console.log("[createStudent DEBUG] Step 2: Generated finalRegNo:", finalRegNo);

            // --- Step 3: Update Student Record with Generated RegNo ---
            console.log("[createStudent DEBUG] Step 3: Updating student record with finalRegNo.");
            const studentWithRegNo = await tx.student.update({
                where: { id: createdStudent.id },
                data: { regNo: finalRegNo },
                select: studentPublicSelection // Select all public fields for the final return
            });
            console.log("[createStudent DEBUG] Step 3 complete.");
            
            // --- Step 4: Update AdmissionOffer with Generated RegNo and Created Student ID ---
            console.log("[createStudent DEBUG] Step 4: Updating AdmissionOffer.");
            await tx.admissionOffer.update({
                where: { applicationProfileId: pApplicationProfileId }, // Use the applicationProfileId to find the offer
                data: {
                    generatedStudentRegNo: finalRegNo, // Set the generated registration number
                    createdStudentId: studentWithRegNo.id, // Link the newly created student's ID
                }
            });
            console.log("[createStudent DEBUG] Step 4 complete. AdmissionOffer updated for Application Profile ID:", pApplicationProfileId);

            return studentWithRegNo; // Return the fully updated student object
        });

        console.log(`[STUDENT_CREATE] Student '${newStudent.name}' (RegNo: ${newStudent.regNo}) created successfully and Admission Offer updated.`);
        return newStudent;

    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2002' && error.meta?.target) {
            const target = error.meta.target;
            let fieldName = Array.isArray(target) ? target.join(', ') : String(target);
            if (fieldName.includes('regNo')) fieldName = 'registration number (conflict after generation)';
            else if (fieldName.includes('jambRegNo')) fieldName = 'JAMB registration number';
            else if (fieldName.includes('email')) fieldName = 'email address';
            else if (fieldName.includes('StudentDetails_phone_key')) fieldName = 'phone number in details';
            throw new AppError(`This ${fieldName} is already in use.`, 409);
        }
        console.error("[STUDENT_SERVICE_ERROR] CreateStudent:", error.message, error.stack);
        throw new AppError('Could not create student profile due to an internal server error.', 500);
    }
};

export const getStudentById = async (id, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const studentIdNum = parseInt(String(id), 10);
        if (isNaN(studentIdNum)) throw new AppError('Invalid student ID format.', 400);

        // Fetch student using studentFullSelection instead of studentPublicSelection
        const student = await prisma.student.findUnique({
            where: { id: studentIdNum },
            select: studentFullSelection // Use the full selection here
        });

        if (!student) throw new AppError('Student not found.', 404);

        // Authorization check
        // Keep existing authorization logic for getStudentById as it applies to both public and full views
        if (requestingUser) {
            if (requestingUser.type === 'student' && requestingUser.id !== studentIdNum) {
                throw new AppError('You are not authorized to view this student profile.', 403);
            }
        }

        // Logic for profileImg fallback (from student model or applicant document)
        let finalProfileImg = student.profileImg;
        let avatarLetter = student.name ? student.name.charAt(0).toUpperCase() : 'S';

        if (!finalProfileImg && student.admissionOfferDetails?.applicationProfile?.uploadedDocuments) {
            const profileDocument = student.admissionOfferDetails.applicationProfile.uploadedDocuments.find(doc => doc.documentType === DocumentType.PROFILE_PHOTO);
            if (profileDocument && profileDocument.fileUrl) {
                finalProfileImg = profileDocument.fileUrl;
            }
        }

        const studentInfo = {
            ...student,
            profileImg: finalProfileImg,
            avatarLetter: avatarLetter
        };

        return studentInfo;

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error(`[STUDENT_SERVICE_ERROR] GetStudentById (ID: ${id}):`, error.message, error.stack);
        throw new AppError('Could not retrieve student information.', 500);
    }
};

export const getAllStudents = async (query, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);

        const {
            departmentId: queryDeptId,
            programId,
            currentLevelId, // Correctly destructured from query
            entryLevelId,
            admissionSeasonId, // Correctly destructured from query
            admissionSemesterId, // Correctly destructured from query
            yearOfAdmission,
            status: statusQuery, // Use a distinct name for the incoming status query parameter
            search,
            name, regNo, jambRegNo, email,
            page: queryPage = "1", limit: queryLimit = "20"
        } = query;

        const where = {};

        // Authorization and Department Filter
        if (requestingUser.type === 'admin') {
            if (queryDeptId && String(queryDeptId).trim()) {
                const pDeptId = parseInt(String(queryDeptId), 10);
                if (!isNaN(pDeptId)) where.departmentId = pDeptId;
            }
        } else if (requestingUser.type === 'lecturer' && requestingUser.role === LecturerRole.HOD) {
            if (!requestingUser.departmentId) throw new AppError('HOD department info missing.', 500);
            where.departmentId = requestingUser.departmentId;
            // If HOD tries to query outside their department, return empty
            if (queryDeptId && String(queryDeptId).trim() && parseInt(String(queryDeptId), 10) !== requestingUser.departmentId) {
                 return { students: [], totalPages: 0, currentPage: parseInt(queryPage,10), limit: parseInt(queryLimit,10), totalStudents: 0 };
            }
        } else {
            throw new AppError("Not authorized to view this student list.", 403);
        }

        // --- Apply Filters from Frontend Query ---
        
        // Program Filter
        if (programId && String(programId).trim()) {
            const pId = parseInt(String(programId), 10);
            if (!isNaN(pId)) where.programId = pId;
        }

        // Current Level Filter
        if (currentLevelId && String(currentLevelId).trim()) {
            const pId = parseInt(String(currentLevelId), 10);
            if (!isNaN(pId)) where.currentLevelId = pId;
        }

        // Entry Level Filter
        if (entryLevelId && String(entryLevelId).trim()) {
            const pId = parseInt(String(entryLevelId), 10);
            if (!isNaN(pId)) where.entryLevelId = pId;
        }

        // Admission Season Filter - Now correctly handled by frontend sending `admissionSeasonId`
        if (admissionSeasonId && String(admissionSeasonId).trim()) {
            const pId = parseInt(String(admissionSeasonId), 10);
            if (!isNaN(pId)) where.admissionSeasonId = pId;
        }

        // Admission Semester Filter - Now correctly handled by frontend sending `admissionSemesterId`
        if (admissionSemesterId && String(admissionSemesterId).trim()) {
            const pId = parseInt(String(admissionSemesterId), 10);
            if (!isNaN(pId)) where.admissionSemesterId = pId;
        }

        // Year of Admission Filter
        if (yearOfAdmission && String(yearOfAdmission).trim()) {
            const pVal = parseInt(String(yearOfAdmission), 10);
            if (!isNaN(pVal)) where.yearOfAdmission = pVal;
        }

        // Status Filter: Map frontend 'status' string to isActive/isGraduated booleans
        if (statusQuery && String(statusQuery).trim() !== '') {
            const lowerCaseStatus = String(statusQuery).toLowerCase();
            if (lowerCaseStatus === 'active') {
                where.isActive = true;
                where.isGraduated = false;
            } else if (lowerCaseStatus === 'inactive') {
                where.isActive = false;
                where.isGraduated = false;
            } else if (lowerCaseStatus === 'graduated') {
                where.isGraduated = true;
                where.isActive = false; // A graduated student is no longer active
            }
        }

    const trimmedSearch = search ? String(search).trim() : null;
        if (trimmedSearch) {
            where.OR = [
                // REMOVE mode: 'insensitive' from here and all following string filters
                { name: { contains: trimmedSearch } },
                { regNo: { contains: trimmedSearch } },
                { email: { contains: trimmedSearch } },
                { jambRegNo: { contains: trimmedSearch } },
            ];
        } else {
            // If no generic search term, apply individual field filters if they exist
            if (name && String(name).trim()) where.name = { contains: String(name).trim() };
            if (regNo && String(regNo).trim()) where.regNo = { equals: String(regNo).trim() };
            if (jambRegNo && String(jambRegNo).trim()) where.jambRegNo = { equals: String(jambRegNo).trim() };
            if (email && String(email).trim()) where.email = { contains: String(email).trim() };
        }

        let pageNum = parseInt(queryPage, 10);
        let limitNum = parseInt(queryLimit, 10);
        if (isNaN(pageNum) || pageNum < 1) pageNum = 1;
        if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) limitNum = 20;
        const skip = (pageNum - 1) * limitNum;

        // Perform the query
        const students = await prisma.student.findMany({
            where,
            select: studentPublicSelection,
            orderBy: { name: 'asc' }, // Or any other default order
            skip,
            take: limitNum,
        });

        const totalStudents = await prisma.student.count({ where });

        return { students, totalPages: Math.ceil(totalStudents / limitNum), currentPage: pageNum, limit: limitNum, totalStudents };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("[STUDENT_SERVICE_ERROR] GetAllStudents:", error.message, error.stack, error.code ? `Prisma Code: ${error.code}`: '');
        throw new AppError('Could not retrieve student list.', 500);
    }
};

export const updateStudent = async (id, updateData, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const studentIdToUpdate = parseInt(String(id), 10);
        if (isNaN(studentIdToUpdate)) throw new AppError('Invalid student ID format.', 400);

        const studentToUpdate = await prisma.student.findUnique({
            where: { id: studentIdToUpdate },
            include: { studentDetails: true }
        });
        if (!studentToUpdate) throw new AppError('Student not found for update.', 404);

        const studentDataForDb = {};
        const studentDetailsDataForDb = {};

        if (requestingUser.type === 'admin') {
            for (const key of adminEditableStudentFields) {
                if (updateData.hasOwnProperty(key)) {
                    const value = updateData[key];
                    if (key === 'regNo') { continue; } // Admins cannot directly change system-generated regNo

                    if (key === 'password' && value && String(value).trim()) {
                        studentDataForDb.password = await hashPassword(String(value).trim());
                    } else if (key === 'jambRegNo') {
                        const newJambRegNo = value ? String(value).trim() : null;
                        if (newJambRegNo && newJambRegNo !== studentToUpdate.jambRegNo) {
                            const existing = await prisma.student.findFirst({ where: { jambRegNo: newJambRegNo, id: { not: studentIdToUpdate } } });
                            if (existing) throw new AppError('Jamb Reg No already exists.', 409);
                        }
                        studentDataForDb.jambRegNo = newJambRegNo;
                    } else if (key === 'email' && value && String(value).trim() !== studentToUpdate.email) {
                        const newEmail = String(value).trim();
                        const existing = await prisma.student.findFirst({ where: { email: newEmail, id: { not: studentIdToUpdate } } });
                        if (existing) throw new AppError('Email already exists.', 409);
                        studentDataForDb.email = newEmail;
                    } else if (key === 'entryMode' && value) {
                        if (!Object.values(EntryMode).includes(String(value))) throw new AppError('Invalid entry mode.', 400);
                        studentDataForDb.entryMode = String(value);
                        if (!updateData.hasOwnProperty('entryLevelId')) {
                            let entryLevelName = (studentDataForDb.entryMode === EntryMode.UTME) ? "100 Level" : (studentDataForDb.entryMode === EntryMode.DIRECT_ENTRY) ? "200 Level" : null;
                            if(entryLevelName) {
                                const entryLevelRec = await prisma.level.findUnique({where: {name: entryLevelName}});
                                if(entryLevelRec) studentDataForDb.entryLevelId = entryLevelRec.id; else console.warn(`Default level ${entryLevelName} not found for entry mode update.`);
                            }
                        }
                    } else if (['yearOfAdmission'].includes(key) && value != null) {
                        const parsedVal = parseInt(String(value), 10);
                        if (isNaN(parsedVal)) throw new AppError(`Invalid ${key}.`, 400);
                        studentDataForDb[key] = parsedVal;
                    } else if (['admissionSeasonId', 'admissionSemesterId', 'departmentId', 'programId', 'entryLevelId', 'currentLevelId', 'currentSeasonId', 'currentSemesterId', 'graduationSeasonId', 'graduationSemesterId'].includes(key)) {
                        studentDataForDb[key] = (value === null || String(value).trim() === "") ? null : parseInt(String(value), 10);
                        if (studentDataForDb[key] !== null && isNaN(studentDataForDb[key])) throw new AppError(`Invalid ID for ${key}.`, 400);
                    } else if (key === 'isActive' || key === 'isGraduated') {
                        studentDataForDb[key] = Boolean(value);
                        if (key === 'isGraduated') { // Special handling for graduation fields
                            if (Boolean(value) === true) { // If marking as graduated
                                studentDataForDb.isActive = updateData.hasOwnProperty('isActive') ? Boolean(updateData.isActive) : false;
                                if (!updateData.graduationSeasonId || !updateData.graduationSemesterId) throw new AppError('Graduation Season & Semester ID required when graduating.', 400);
                                const gradSeasonId = parseInt(String(updateData.graduationSeasonId), 10);
                                const gradSemesterId = parseInt(String(updateData.graduationSemesterId), 10);
                                if (isNaN(gradSeasonId) || isNaN(gradSemesterId)) throw new AppError('Invalid graduation season/semester ID.', 400);
                                studentDataForDb.graduationSeasonId = gradSeasonId;
                                studentDataForDb.graduationSemesterId = gradSemesterId;
                            } else { // If un-graduating
                                studentDataForDb.graduationSeasonId = null;
                                studentDataForDb.graduationSemesterId = null;
                            }
                        }
                    } else if (key !== 'password') {
                        studentDataForDb[key] = (value === '' && key !== 'name' && key !== 'email') ? null : String(value);
                    }
                }
            }
            const adminEditableDetails = ['dob', 'gender', 'address', 'phone', 'guardianName', 'guardianPhone'];
            for (const key of adminEditableDetails) {
                if (updateData.hasOwnProperty(key)) {
                    const value = updateData[key];
                    if (key === 'dob') studentDetailsDataForDb.dob = value ? new Date(String(value)) : null;
                    else if (key === 'gender') {
                        if (value && !Object.values(Gender).includes(String(value))) throw new AppError('Invalid gender.', 400);
                        studentDetailsDataForDb.gender = value || studentToUpdate.studentDetails?.gender || undefined;
                    } else if (key === 'phone') {
                        const phoneVal = value ? String(value).trim() : null;
                        if (phoneVal && phoneVal !== studentToUpdate.studentDetails?.phone) {
                            const existing = await prisma.studentDetails.findFirst({ where: { phone: phoneVal, studentId: { not: studentIdToUpdate } } });
                            if (existing) throw new AppError('Phone in details already in use.', 409);
                        }
                        studentDetailsDataForDb.phone = phoneVal;
                    } else { studentDetailsDataForDb[key] = (value === '' || value === null) ? null : String(value); }
                }
            }
            if (Object.keys(studentDetailsDataForDb).length > 0 && !studentDetailsDataForDb.gender && !studentToUpdate.studentDetails?.gender) {
                throw new AppError('Gender required for student details.', 400);
            }
        } else if (requestingUser.type === 'student' && requestingUser.id === studentIdToUpdate) {
            for (const key of Object.keys(updateData)) {
                let isAllowed = false; const value = updateData[key];
                if (studentSelfEditableStudentFields.includes(key)) {
                    isAllowed = true;
                    if (key === 'password' && value && String(value).trim()) studentDataForDb.password = await hashPassword(String(value).trim());
                    else if (key === 'profileImg') studentDataForDb.profileImg = String(value).trim() || null;
                } else if (studentSelfEditableDetailsFields.includes(key)){
                    isAllowed = true;
                    if (key === 'dob') studentDetailsDataForDb.dob = value ? new Date(String(value)) : null;
                    else if (key === 'gender') { /* ... gender validation ... */ studentDetailsDataForDb.gender = String(value) || studentToUpdate.studentDetails?.gender || undefined; }
                    else if (key === 'phone') { /* ... phone validation & uniqueness ... */ studentDetailsDataForDb.phone = value ? String(value).trim() : null; }
                    else { studentDetailsDataForDb[key] = (value === '' || value === null) ? null : String(value); }
                }
                if (updateData.hasOwnProperty(key) && !isAllowed) throw new AppError(`Not allowed to update '${key}'.`, 403);
            }
            if (Object.keys(studentDetailsDataForDb).length > 0 && !studentDetailsDataForDb.gender && !studentToUpdate.studentDetails?.gender) {
                throw new AppError('Gender required for student details.', 400);
            }
        } else {
            throw new AppError('Not authorized to update this student profile.', 403);
        }

        if (Object.keys(studentDataForDb).length === 0 && Object.keys(studentDetailsDataForDb).length === 0) {
            throw new AppError('No valid fields provided for update.', 400);
        }

        await prisma.$transaction(async (tx) => {
            if (Object.keys(studentDataForDb).length > 0) await tx.student.update({ where: { id: studentIdToUpdate }, data: studentDataForDb });
            if (Object.keys(studentDetailsDataForDb).length > 0) {
                const finalDetailsData = {...studentDetailsDataForDb};
                if (!finalDetailsData.gender && studentToUpdate.studentDetails?.gender) finalDetailsData.gender = studentToUpdate.studentDetails.gender;
                else if (!finalDetailsData.gender && !studentToUpdate.studentDetails?.gender) throw new AppError('Gender required for details.', 400);
                await tx.studentDetails.upsert({
                    where: { studentId: studentIdToUpdate },
                    create: { studentId: studentIdToUpdate, gender: finalDetailsData.gender, ...finalDetailsData }, // Ensure gender is present for create
                    update: studentDetailsDataForDb,
                });
            }
        });
        return prisma.student.findUnique({ where: { id: studentIdToUpdate }, select: studentPublicSelection });
    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2002' && error.meta?.target) { /* ... unique constraint handling ... */ }
        console.error("[STUDENT_SERVICE_ERROR] UpdateStudent:", error.message, error.stack);
        throw new AppError('Could not update student profile.', 500);
    }
};

export const deleteStudent = async (id) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const studentIdNum = parseInt(String(id), 10);
        if (isNaN(studentIdNum)) throw new AppError('Invalid student ID format.', 400);
        const student = await prisma.student.findUnique({ where: { id: studentIdNum } });
        if (!student) throw new AppError('Student not found for deletion.', 404);
        // Add more dependency checks based on ON DELETE RESTRICT rules
        const regCount = await prisma.studentCourseRegistration.count({ where: { studentId: studentIdNum } });
        if (regCount > 0) throw new AppError(`Cannot delete. Student has ${regCount} course registrations.`, 400);

        await prisma.student.delete({ where: { id: studentIdNum } }); // StudentDetails cascades
        return { message: `Student '${student.name}' deleted.` };
    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2003') throw new AppError('Cannot delete student. Still referenced by other records.', 400);
        console.error("[STUDENT_SERVICE_ERROR] DeleteStudent:", error.message, error.stack);
        throw new AppError('Could not delete student profile.', 500);
    }
};

export const getMyCourseStudentsList = async (requestingLecturer, query) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const { courseId, semesterId, seasonId, currentLevelId, page = "1", limit = "1000" } = query;

        const lecturerId = requestingLecturer.id;

        // 1. Find courses assigned to this lecturer matching the filters
        const staffCourseWhere = { lecturerId: lecturerId };
        if (courseId) staffCourseWhere.courseId = parseInt(String(courseId), 10);
        if (semesterId) staffCourseWhere.semesterId = parseInt(String(semesterId), 10);
        if (seasonId) staffCourseWhere.seasonId = parseInt(String(seasonId), 10);

        const staffCourses = await prisma.staffCourse.findMany({
            where: staffCourseWhere,
            select: { courseId: true, semesterId: true, seasonId: true }
        });

        if (staffCourses.length === 0) {
            return { students: [], totalPages: 0, currentPage: 1, limit: parseInt(limit, 10), totalStudents: 0 };
        }

        // 2. Build Registration Query
        const registrationWhereClause = {
            OR: staffCourses.map(sc => ({
                courseId: sc.courseId,
                semesterId: sc.semesterId,
                seasonId: sc.seasonId
            })),
            student: {
                isActive: true,
                isGraduated: false,
                ...(currentLevelId && { currentLevelId: parseInt(String(currentLevelId), 10) })
            }
        };

        // 3. Fetch Registrations
        // We include the 'score' here so the frontend can see if a score exists immediately
        // (Optional optimization, but helpful)
        const [registrations, totalStudents] = await prisma.$transaction([
            prisma.studentCourseRegistration.findMany({
                where: registrationWhereClause,
                select: {
                    ...registrationStudentSelection,
                    // Optionally select score if you want to verify existence on the server side
                    score: { 
                        select: { 
                            id: true, 
                            totalScore: true, 
                            grade: true,
                            firstCA: true,   // <--- Added
                            secondCA: true,  // <--- Added
                            examScore: true  // <--- Added
                        } 
                    } 
                },
                orderBy: { student: { name: 'asc' } },
                take: 1000, 
            }),
            prisma.studentCourseRegistration.count({
                where: registrationWhereClause,
            })
        ]);

        // 4. Map Output to Frontend Format
        const students = registrations.map(reg => ({
            id: reg.student.id,
            regNo: reg.student.regNo,
            jambRegNo: reg.student.jambRegNo,
            name: reg.student.name,
            email: reg.student.email,
            profileImg: reg.student.profileImg,
            department: reg.student.department,
            currentLevel: reg.student.currentLevel,
            
            // IMPORTANT: Passing the FK back to frontend
            studentCourseRegistration: {
                id: reg.id, 
                // Passing the score snippet helps the frontend know if data exists
                score: reg.score 
            }
        }));

        return {
            students: students,
            totalPages: Math.ceil(totalStudents / 1000),
            currentPage: 1,
            limit: 1000,
            totalStudents: totalStudents
        };

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("[STUDENT_SERVICE_ERROR] GetMyCourseStudentsList:", error.message, error.stack);
        throw new AppError('Could not retrieve students for your courses.', 500);
    }
};

export const getDepartmentStudents = async (requestingUser, query) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);

        // Authorization Check: Must be HOD or Admin
        if (requestingUser.type !== 'admin' && requestingUser.role !== LecturerRole.HOD) {
            throw new AppError("You are not authorized to view your department's students.", 403);
        }
        if (!requestingUser.departmentId) {
            throw new AppError("Your user profile is missing department information.", 500);
        }

        const {
            programId, currentLevelId, isActive, name, regNo,
            page: queryPage = "1", limit: queryLimit = "20"
        } = query;

        // Core filter: Only get students from the requesting user's department
        const where = {
            departmentId: requestingUser.departmentId
        };

        // --- Additional optional filters ---
        if (programId && String(programId).trim()) {
            const pId = parseInt(String(programId), 10);
            if (!isNaN(pId)) where.programId = pId;
        }
        if (currentLevelId && String(currentLevelId).trim()) {
            const pId = parseInt(String(currentLevelId), 10);
            if (!isNaN(pId)) where.currentLevelId = pId;
        }
        if (isActive !== undefined && isActive !== "") {
            where.isActive = isActive === 'true';
        }
        if (name && String(name).trim()) {
            where.name = { contains: String(name).trim(), mode: 'insensitive' };
        }
        if (regNo && String(regNo).trim()) {
            where.regNo = { equals: String(regNo).trim(), mode: 'insensitive' };
        }

        // --- Pagination ---
        let pageNum = parseInt(queryPage, 10);
        let limitNum = parseInt(queryLimit, 10);
        if (isNaN(pageNum) || pageNum < 1) pageNum = 1;
        if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) limitNum = 20;
        const skip = (pageNum - 1) * limitNum;

        // --- Database Query ---
        const [students, totalStudents] = await prisma.$transaction([
            prisma.student.findMany({
                where,
                select: studentPublicSelection,
                orderBy: { name: 'asc' },
                skip,
                take: limitNum,
            }),
            prisma.student.count({ where })
        ]);

        return {
            students,
            totalPages: Math.ceil(totalStudents / limitNum),
            currentPage: pageNum,
            limit: limitNum,
            totalStudents
        };

    } catch (error) {
        console.error("[STUDENT_SERVICE_ERROR] GetDepartmentStudents:", error.message, error.stack);
        if (error instanceof AppError) throw error;
        throw new AppError('Could not retrieve departmental student list.', 500);
    }
};

export const getStudentsForAssignedCourse = async (requestingLecturer, query) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);

        const {
            courseId, semesterId, seasonId,
            page = "1", limit = "20"
        } = query;

        // --- 1. Input Validation ---
        if (!courseId || !semesterId || !seasonId) {
            throw new AppError('courseId, semesterId, and seasonId are required query parameters.', 400);
        }

        const pCourseId = parseInt(String(courseId), 10);
        const pSemesterId = parseInt(String(semesterId), 10);
        const pSeasonId = parseInt(String(seasonId), 10);

        if (isNaN(pCourseId) || isNaN(pSemesterId) || isNaN(pSeasonId)) {
            throw new AppError('Invalid ID format for course, semester, or season.', 400);
        }

        // --- 2. Authorization Check ---
        // Verify that this lecturer is actually assigned to this course for this period.
        const staffAssignment = await prisma.staffCourse.findFirst({
            where: {
                lecturerId: requestingLecturer.id,
                courseId: pCourseId,
                semesterId: pSemesterId,
                seasonId: pSeasonId,
            }
        });

        if (!staffAssignment) {
            throw new AppError("You are not assigned to teach this course for the specified semester and season, or the assignment does not exist.", 403);
        }

        // --- 3. Data Fetching ---
        // If authorization passes, find all students registered for this course.
        const whereClause = {
            courseId: pCourseId,
            semesterId: pSemesterId,
            seasonId: pSeasonId,
            student: {
                isActive: true, // It's good practice to only fetch active students
            }
        };

        // --- Pagination ---
        let pageNum = parseInt(page, 10);
        let limitNum = parseInt(limit, 10);
        if (isNaN(pageNum) || pageNum < 1) pageNum = 1;
        if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) limitNum = 20;
        const skip = (pageNum - 1) * limitNum;

        const [registrations, totalStudents] = await prisma.$transaction([
            prisma.studentCourseRegistration.findMany({
                where: whereClause,
                select: {
                    // We only need the student data, so we select it specifically
                    student: {
                        select: studentPublicSelection // Use the existing detailed selection
                    }
                },
                orderBy: {
                    student: {
                        name: 'asc'
                    }
                },
                skip,
                take: limitNum,
            }),
            prisma.studentCourseRegistration.count({ where: whereClause })
        ]);

        // Extract the student objects from the registration results
        const students = registrations.map(reg => reg.student);

        return {
            students,
            totalPages: Math.ceil(totalStudents / limitNum),
            currentPage: pageNum,
            limit: limitNum,
            totalStudents
        };

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("[STUDENT_SERVICE_ERROR] getStudentsForAssignedCourse:", error.message, error.stack);
        throw new AppError("Could not retrieve the list of students for your assigned course.", 500);
    }
};

// NEW SERVICE FUNCTION: Batch create students and update admission offers
export const batchCreateStudents = async (studentDataArray, requestingUser) => {
    if (!prisma) throw new AppError('Prisma client unavailable', 500);
    if (!Array.isArray(studentDataArray) || studentDataArray.length === 0) {
        throw new AppError('Student data must be a non-empty array.', 400);
    }

    const successfulCreations = [];
    const failedCreations = [];

    // Pre-fetch all levels, departments, programs, seasons, semesters for efficiency and validation
    // This avoids N+1 queries inside the loop for common lookups.
    const [allLevels, allDepartments, allPrograms, allSeasons, allSemesters] = await Promise.all([
        prisma.level.findMany({ select: { id: true, name: true, value: true } }),
        prisma.department.findMany({ select: { id: true, name: true } }),
        prisma.program.findMany({ select: { id: true, name: true, departmentId: true } }),
        prisma.season.findMany({ select: { id: true, name: true } }),
        prisma.semester.findMany({ select: { id: true, name: true, seasonId: true } }),
    ]);

    // Create maps for quick lookups
    const levelMapByName = new Map(allLevels.map(level => [level.name, level.id]));
    const levelMapById = new Map(allLevels.map(level => [level.id, level.name]));
    const departmentMapById = new Map(allDepartments.map(dept => [dept.id, dept]));
    const programMapById = new Map(allPrograms.map(prog => [prog.id, prog]));
    const seasonMapById = new Map(allSeasons.map(season => [season.id, season]));
    const semesterMapById = new Map(allSemesters.map(semester => [semester.id, semester]));


    // Pre-fetch existing students/details to check for unique constraint violations (email, jambRegNo, phone, regNo)
    // This provides better error messages than a generic P2002.
    const existingStudentUniques = await prisma.student.findMany({
        select: { jambRegNo: true, email: true, regNo: true, studentDetails: { select: { phone: true } } }
    });
    const existingJambRegNos = new Set(existingStudentUniques.map(s => s.jambRegNo).filter(Boolean));
    const existingEmails = new Set(existingStudentUniques.map(s => s.email).filter(Boolean));
    const existingRegNos = new Set(existingStudentUniques.map(s => s.regNo).filter(Boolean));
    const existingPhones = new Set(existingStudentUniques.map(s => s.studentDetails?.phone).filter(Boolean));


    // Loop through each student record to create them individually within a transaction
    for (const [index, studentData] of studentDataArray.entries()) {
        try {
            // Use a transaction for each student to ensure atomicity (student, regNo update, offer update)
            const studentCreationResult = await prisma.$transaction(async (tx) => {
                const {
                    applicationProfileId, // Required to link to AdmissionOffer
                    jambRegNo, name, email: studentEmail, entryMode,
                    yearOfAdmission, admissionSeasonId, admissionSemesterId,
                    departmentId, programId, password: providedPassword, profileImg,
                    isActive, isGraduated,
                    dob, gender, address, phone, guardianName, guardianPhone,
                    entryLevelId: entryLevelIdInput // Optional: If provided, use it
                } = studentData;

                let rowErrors = []; // Collect errors specific to this student's data

                // --- Input Validation & Coercion ---
                // Trim and normalize string fields
                const sName = String(name || '').trim();
                const sStudentEmail = String(studentEmail || '').trim();
                const sEntryMode = String(entryMode || '').trim();
                const sJambRegNo = jambRegNo ? String(jambRegNo).trim() : null;
                const sPhone = phone ? String(phone).trim() : null;
                const sAddress = address ? String(address).trim() : null;
                const sGuardianName = guardianName ? String(guardianName).trim() : null;
                const sGuardianPhone = guardianPhone ? String(guardianPhone).trim() : null;
                const sProfileImg = profileImg ? String(profileImg).trim() : null;
                const sDeGrade = studentData.deGrade ? String(studentData.deGrade).trim() : null; // Assuming deGrade might come in studentData

                // Parse and validate numeric IDs
                const pYearOfAdmission = parseInt(String(yearOfAdmission), 10);
                const pAdmissionSeasonId = parseInt(String(admissionSeasonId), 10);
                const pAdmissionSemesterId = parseInt(String(admissionSemesterId), 10);
                const pDepartmentId = parseInt(String(departmentId), 10);
                const pProgramId = parseInt(String(programId), 10);
                
                // Date of Birth
                let pDob = dob ? new Date(dob) : null;
                if (pDob && isNaN(pDob.getTime())) {
                    rowErrors.push('Invalid Date of Birth format.');
                    pDob = null;
                }

                // --- Core Required Fields Check ---
                if (!applicationProfileId) rowErrors.push('Missing applicationProfileId.');
                if (!sName) rowErrors.push('Name is missing.');
                if (!sStudentEmail) rowErrors.push('Email is missing.');
                if (!sEntryMode) rowErrors.push('Entry Mode is missing.');
                if (isNaN(pYearOfAdmission)) rowErrors.push('Year of Admission is missing or invalid.');
                if (isNaN(pAdmissionSeasonId)) rowErrors.push('Admission Season ID is missing or invalid.');
                if (isNaN(pAdmissionSemesterId)) rowErrors.push('Admission Semester ID is missing or invalid.');
                if (isNaN(pDepartmentId)) rowErrors.push('Department ID is missing or invalid.');
                if (isNaN(pProgramId)) rowErrors.push('Program ID is missing or invalid.');

                // --- Enum Validations ---
                if (!Object.values(EntryMode).includes(sEntryMode)) rowErrors.push(`Invalid Entry Mode: ${sEntryMode}.`);
                if (gender && !Object.values(Gender).includes(gender)) rowErrors.push(`Invalid Gender: ${gender}.`);
                
                // --- Uniqueness Checks (against existing DB records & records in previous batch iterations) ---
                if (sStudentEmail && existingEmails.has(sStudentEmail)) rowErrors.push(`Email '${sStudentEmail}' already exists.`);
                if (sJambRegNo && existingJambRegNos.has(sJambRegNo)) rowErrors.push(`JAMB RegNo '${sJambRegNo}' already exists.`);
                if (sPhone && existingPhones.has(sPhone)) rowErrors.push(`Phone number '${sPhone}' already exists.`);

                // --- Existence Checks (IDs refer to actual records in DB) ---
                if (!departmentMapById.has(pDepartmentId)) rowErrors.push(`Department ID ${pDepartmentId} not found.`);
                const programRecord = programMapById.get(pProgramId);
                if (!programRecord || programRecord.departmentId !== pDepartmentId) rowErrors.push(`Program ID ${pProgramId} not found or not in department ${pDepartmentId}.`);
                if (!seasonMapById.has(pAdmissionSeasonId)) rowErrors.push(`Admission Season ID ${pAdmissionSeasonId} not found.`);
                const semesterRecord = semesterMapById.get(pAdmissionSemesterId);
                if (!semesterRecord || semesterRecord.seasonId !== pAdmissionSeasonId) rowErrors.push(`Admission Semester ID ${pAdmissionSemesterId} (for season ${pAdmissionSeasonId}) not found.`);
                
                // --- Determine Entry Level ID ---
                let determinedEntryLevelId;
                if (entryLevelIdInput !== undefined && entryLevelIdInput !== null && String(entryLevelIdInput).trim() !== '') {
                    determinedEntryLevelId = parseInt(String(entryLevelIdInput), 10);
                    if (isNaN(determinedEntryLevelId) || !levelMapById.has(determinedEntryLevelId)) {
                        rowErrors.push(`Provided Entry Level ID ${determinedEntryLevelId} is invalid or not found.`);
                    }
                } else {
                    let defaultEntryLevelName;
                    if (sEntryMode === EntryMode.UTME) defaultEntryLevelName = "100 Level";
                    else if (sEntryMode === EntryMode.DIRECT_ENTRY) defaultEntryLevelName = "200 Level";
                    else if (sEntryMode === EntryMode.TRANSFER) rowErrors.push('For TRANSFER entry mode, an explicit entryLevelId is required.');
                    else rowErrors.push('Cannot determine entry level for the given entry mode.');
                    
                    if (defaultEntryLevelName) {
                        determinedEntryLevelId = levelMapByName.get(defaultEntryLevelName);
                        if (!determinedEntryLevelId) rowErrors.push(`Default entry level '${defaultEntryLevelName}' for mode '${sEntryMode}' not found. Please configure levels.`);
                    }
                }
                if (!determinedEntryLevelId) rowErrors.push('Entry Level could not be determined.'); // Final check after all attempts

                // --- Password Handling ---
                let passwordToHash;
                if (providedPassword && String(providedPassword).trim() !== '') {
                    passwordToHash = String(providedPassword).trim();
                } else if (config.studentDefaultPassword) {
                    passwordToHash = config.studentDefaultPassword;
                } else {
                    rowErrors.push('Password is required for student, and no default student password is configured.');
                }
                let hashedPassword;
                if (passwordToHash) {
                    hashedPassword = await hashPassword(passwordToHash);
                } else {
                    rowErrors.push('Failed to hash password.');
                }

                // If any errors accumulated for this row, throw an AppError to trigger transaction rollback
                if (rowErrors.length > 0) {
                    throw new AppError(rowErrors.join(' '), 400); 
                }

                // --- Step 1: Create Student Record (without regNo initially) ---
                const studentCreateDataBase = {
                    jambRegNo: sJambRegNo,
                    name: sName,
                    email: sStudentEmail,
                    entryMode: sEntryMode,
                    profileImg: sProfileImg,
                    yearOfAdmission: pYearOfAdmission,
                    admissionSeasonId: pAdmissionSeasonId,
                    admissionSemesterId: pAdmissionSemesterId,
                    departmentId: pDepartmentId,
                    programId: pProgramId,
                    entryLevelId: determinedEntryLevelId,
                    currentLevelId: determinedEntryLevelId, // Current level is same as entry level initially
                    currentSeasonId: pAdmissionSeasonId,
                    currentSemesterId: pAdmissionSemesterId,
                    password: hashedPassword,
                    isActive: isActive === undefined ? true : Boolean(isActive),
                    isGraduated: isGraduated === undefined ? false : Boolean(isGraduated),
                };

                let studentDetailsCreatePayload;
                if (pDob || gender || sAddress || sPhone || sGuardianName || sGuardianPhone) {
                    if (!gender && gender !== null) { // If gender isn't explicitly null, it's required for details creation
                        rowErrors.push('Gender is required if providing other student details unless explicitly set to null.');
                    }
                    studentDetailsCreatePayload = {
                        dob: pDob,
                        gender: gender || undefined,
                        address: sAddress,
                        phone: sPhone,
                        guardianName: sGuardianName,
                        guardianPhone: sGuardianPhone,
                    };
                }
                
                const createdStudent = await tx.student.create({
                    data: {
                        ...studentCreateDataBase,
                        ...(studentDetailsCreatePayload && { studentDetails: { create: studentDetailsCreatePayload } })
                    },
                    // Select fields needed for regNo generation and subsequent updates
                    select: { id: true, yearOfAdmission: true, entryMode: true, departmentId: true, email: true, jambRegNo: true }
                });

                // Update sets for intra-batch validation to prevent duplicates within the same batch
                existingEmails.add(createdStudent.email);
                if (createdStudent.jambRegNo) existingJambRegNos.add(createdStudent.jambRegNo);


                // --- Step 2: Generate and Update RegNo ---
                const yearAbbr = String(createdStudent.yearOfAdmission).slice(-2);
                const entryModeAbbr = getEntryModeAbbreviation(createdStudent.entryMode);
                const sequencePart = createdStudent.id.toString().padStart(5, '0'); // Pad ID to 5 digits
                const finalRegNo = `${yearAbbr}/${sequencePart}${entryModeAbbr}/${createdStudent.departmentId}`;

                const studentWithRegNo = await tx.student.update({
                    where: { id: createdStudent.id },
                    data: { regNo: finalRegNo },
                    select: { id: true, regNo: true } // Select only needed fields for successfulCreations array
                });
                existingRegNos.add(studentWithRegNo.regNo); // Add to set for intra-batch validation


                // --- Step 3: Update AdmissionOffer (if linked by applicationProfileId) ---
                // Find the admission offer by applicationProfileId
                const admissionOffer = await tx.admissionOffer.findUnique({
                    where: { applicationProfileId: applicationProfileId },
                    select: { id: true } // Only need the ID of the offer to update it
                });

                if (admissionOffer) {
                    await tx.admissionOffer.update({
                        where: { id: admissionOffer.id },
                        data: {
                            generatedStudentRegNo: finalRegNo, // Set the generated regNo
                            createdStudentId: createdStudent.id, // Link the new student's ID
                        }
                    });
                } else {
                    // Log a warning if no offer found. Depending on your business logic,
                    // this might also be an error that prevents student creation.
                    console.warn(`[BatchCreateStudents] Student created (ID: ${createdStudent.id}, RegNo: ${finalRegNo}) but no AdmissionOffer found for applicationProfileId: ${applicationProfileId}.`);
                }

                return { student: studentWithRegNo, message: 'Student created and offer updated successfully.' };

            });
            successfulCreations.push(studentCreationResult); // Push the result of the successful transaction
        } catch (error) {
            // Catch specific validation errors for the current student
            const errorMessage = error instanceof AppError ? error.message : 'An unexpected error occurred during creation for this record.';
            failedCreations.push({ index, data: studentData, error: errorMessage });
            console.error(`[BatchCreateStudents] Failed to create student at index ${index}:`, errorMessage, error.stack);
        }
    }

    const createdCount = successfulCreations.length;
    const skippedCount = failedCreations.length;
    let message = `Batch processing complete. Successfully created: ${createdCount}. Failed: ${skippedCount}.`;
    let status = 'success';
    if (skippedCount > 0 && createdCount > 0) {
        status = 'partial_success'; // Some records failed, some succeeded
    } else if (createdCount === 0 && skippedCount > 0) {
        status = 'fail'; // All records failed
        message = `Batch import failed. All ${skippedCount} students had errors.`;
    }

    return {
        status,
        message,
        data: {
            createdCount,
            skippedCount,
            successfulCreations, // Optionally return details of successful ones
            failedCreations // Detailed errors for failed ones
        }
    };
};