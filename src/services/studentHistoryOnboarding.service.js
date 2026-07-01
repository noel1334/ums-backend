import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import { hashPassword } from '../utils/password.utils.js';
import { EntryMode, Gender, GradeLetter, ResultRemark } from '../generated/prisma/index.js';
import config from '../config/index.js';

// Helper to determine registration code modifiers
const getEntryModeAbbreviation = (entryMode) => {
    switch (entryMode) {
        case EntryMode.UTME: return 'U';
        case EntryMode.DIRECT_ENTRY: return 'D';
        case EntryMode.TRANSFER: return 'T';
        default: return 'X';
    }
};

const getDegreeTypeAbbreviation = (degreeType) => {
    switch (degreeType) {
        case 'ND': return 'ND';
        case 'NCE': return 'NCE';
        case 'HND': return 'HND';
        case 'POSTGRADUATE_DIPLOMA': return 'PGD';
        case 'MASTERS': return 'M';
        case 'PHD': return 'PHD';
        case 'CERTIFICATE': return 'CRT';
        case 'DIPLOMA': return 'DIP';
        default: return '';
    }
};

/**
 * Onboard a single legacy student along with their historical semesters, results, and scores.
 */
export const onboardOldStudent = async (studentData) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);

        const {
            name, email, regNo, jambRegNo, entryMode, yearOfAdmission,
            admissionSeasonId, admissionSemesterId, departmentId, programId,
            entryLevelId, currentLevelId, currentSeasonId, currentSemesterId,
            dob, gender, address, phone, guardianName, guardianPhone,
            password: providedPassword,
            academicHistory = []
        } = studentData;

        // --- 1. Validation & Data Preparation ---
        if (!name || !email || !entryMode || !yearOfAdmission || !departmentId || !programId || !entryLevelId || !currentLevelId) {
            throw new AppError('Required core student fields are missing.', 400);
        }

        const pDepartmentId = parseInt(String(departmentId), 10);
        const pProgramId = parseInt(String(programId), 10);
        const pEntryLevelId = parseInt(String(entryLevelId), 10);
        const pCurrentLevelId = parseInt(String(currentLevelId), 10);
        const pAdmissionSeasonId = parseInt(String(admissionSeasonId), 10);
        const pAdmissionSemesterId = parseInt(String(admissionSemesterId), 10);
        const pYearOfAdmission = parseInt(String(yearOfAdmission), 10);

        // Fetch related references to ensure data integrity
        const [departmentRecord, programRecord, entryLevel, currentLevel, admissionSeason, admissionSemester] = await Promise.all([
            prisma.department.findUnique({ where: { id: pDepartmentId } }),
            prisma.program.findUnique({ where: { id: pProgramId, departmentId: pDepartmentId } }),
            prisma.level.findUnique({ where: { id: pEntryLevelId } }),
            prisma.level.findUnique({ where: { id: pCurrentLevelId } }),
            prisma.season.findUnique({ where: { id: pAdmissionSeasonId } }),
            prisma.semester.findUnique({ where: { id: pAdmissionSemesterId, seasonId: pAdmissionSeasonId } })
        ]);

        if (!departmentRecord) throw new AppError(`Department ID ${pDepartmentId} not found.`, 404);
        if (!programRecord) throw new AppError(`Program ID ${pProgramId} not found or mismatch with department.`, 404);
        if (!entryLevel) throw new AppError(`Entry Level ID ${pEntryLevelId} not found.`, 404);
        if (!currentLevel) throw new AppError(`Current Level ID ${pCurrentLevelId} not found.`, 404);
        if (!admissionSeason) throw new AppError(`Admission Season ID ${pAdmissionSeasonId} not found.`, 404);
        if (!admissionSemester) throw new AppError(`Admission Semester ID ${pAdmissionSemesterId} not found.`, 404);

        // Standardize legacy student uniqueness attributes
        const trimmedEmail = email.trim();
        const trimmedRegNo = regNo && String(regNo).trim() !== "" ? String(regNo).trim() : null;
        const trimmedJambRegNo = jambRegNo && String(jambRegNo).trim() !== "" ? String(jambRegNo).trim() : null;
        const trimmedPhone = phone && String(phone).trim() !== "" ? String(phone).trim() : null;

        const checkPromises = [prisma.student.findUnique({ where: { email: trimmedEmail } })];
        if (trimmedRegNo) checkPromises.push(prisma.student.findUnique({ where: { regNo: trimmedRegNo } }));
        if (trimmedJambRegNo) checkPromises.push(prisma.student.findUnique({ where: { jambRegNo: trimmedJambRegNo } }));
        if (trimmedPhone) checkPromises.push(prisma.studentDetails.findFirst({ where: { phone: trimmedPhone } }));

        const checkResults = await Promise.all(checkPromises);
        if (checkResults[0]) throw new AppError(`Student with email '${trimmedEmail}' already exists in the system.`, 409);
        if (trimmedRegNo && checkResults[1]) throw new AppError(`Registration number '${trimmedRegNo}' is already assigned to a student.`, 409);
        if (trimmedJambRegNo && checkResults[trimmedRegNo ? 2 : 1]) throw new AppError(`JAMB registration number '${trimmedJambRegNo}' already exists in the system.`, 409);
        if (trimmedPhone && checkResults[checkResults.length - 1]) throw new AppError(`Phone number '${trimmedPhone}' is already in use.`, 409);

        // Hash Legacy Password outside the database transaction block
        let passwordToHash = providedPassword && String(providedPassword).trim() !== ''
            ? String(providedPassword).trim()
            : config.studentDefaultPassword || '123456';
        const hashedPassword = await hashPassword(passwordToHash);

        // Retrieve school acronym for fallback regNo generation
        const setting = await prisma.universitySetting.findFirst({ select: { acronym: true } });
        const schoolAcronym = setting?.acronym ? setting.acronym.trim().toUpperCase() : '';
        const acronymPrefix = schoolAcronym ? `${schoolAcronym}/` : '';

        // --- 2. Write Database Transaction ---
        const result = await prisma.$transaction(async (tx) => {
            // Create Student Record (using existing regNo if provided)
            const createdStudent = await tx.student.create({
                data: {
                    name: name.trim(),
                    email: trimmedEmail,
                    jambRegNo: trimmedJambRegNo,
                    regNo: trimmedRegNo || null, // Write directly if already exists in your old system
                    entryMode,
                    yearOfAdmission: pYearOfAdmission,
                    admissionSeasonId: pAdmissionSeasonId,
                    admissionSemesterId: pAdmissionSemesterId,
                    departmentId: pDepartmentId,
                    programId: pProgramId,
                    entryLevelId: pEntryLevelId,
                    currentLevelId: pCurrentLevelId,
                    currentSeasonId: currentSeasonId ? parseInt(String(currentSeasonId), 10) : pAdmissionSeasonId,
                    currentSemesterId: currentSemesterId ? parseInt(String(currentSemesterId), 10) : pAdmissionSemesterId,
                    password: hashedPassword,
                    isActive: true,
                    isGraduated: false
                }
            });

            // Assign generated Registration Number ONLY if not provided from your old system
            if (!trimmedRegNo) {
                const yearAbbr = String(createdStudent.yearOfAdmission).slice(-2);
                const entryModeAbbr = getEntryModeAbbreviation(createdStudent.entryMode);
                const sequencePart = createdStudent.id.toString().padStart(5, '0');
                const degreeTypeAbbr = getDegreeTypeAbbreviation(programRecord.degreeType);
                
                const generatedRegNo = degreeTypeAbbr
                    ? `${acronymPrefix}${yearAbbr}/${sequencePart}${entryModeAbbr}/${pDepartmentId}/${degreeTypeAbbr}`
                    : `${acronymPrefix}${yearAbbr}/${sequencePart}${entryModeAbbr}/${pDepartmentId}`;

                await tx.student.update({
                    where: { id: createdStudent.id },
                    data: { regNo: generatedRegNo }
                });
            }

            // Create Student Physical Details
            await tx.studentDetails.create({
                data: {
                    studentId: createdStudent.id,
                    dob: dob ? new Date(dob) : null,
                    gender: gender || Gender.MALE,
                    address: address ? address.trim() : null,
                    phone: trimmedPhone,
                    guardianName: guardianName ? guardianName.trim() : null,
                    guardianPhone: guardianPhone ? guardianPhone.trim() : null
                }
            });

            // --- 3. Process Legacy Academic Records ---
            if (Array.isArray(academicHistory) && academicHistory.length > 0) {
                for (const semesterResult of academicHistory) {
                    const {
                        seasonId, semesterId, levelId, gpa, cgpa,
                        cuAttempted, cuPassed, cuTotal, remarks, courses = []
                    } = semesterResult;

                    const pSeasonId = parseInt(String(seasonId), 10);
                    const pSemesterId = parseInt(String(semesterId), 10);
                    const pLevelId = parseInt(String(levelId), 10);

                    // Create semester result summary
                    const createdResultSummary = await tx.result.create({
                        data: {
                            studentId: createdStudent.id,
                            semesterId: pSemesterId,
                            seasonId: pSeasonId,
                            departmentId: pDepartmentId,
                            programId: pProgramId,
                            levelId: pLevelId,
                            gpa: gpa ? parseFloat(String(gpa)) : null,
                            cgpa: cgpa ? parseFloat(String(cgpa)) : null,
                            cuAttempted: cuAttempted ? parseInt(String(cuAttempted), 10) : null,
                            cuPassed: cuPassed ? parseInt(String(cuPassed), 10) : null,
                            cuTotal: cuTotal ? parseInt(String(cuTotal), 10) : null,
                            remarks: remarks ? remarks : null,
                            isApprovedForStudentRelease: true,
                            studentReleaseApprovedAt: new Date()
                        }
                    });

                    // Add registered courses & scores
                    for (const courseHistory of courses) {
                        const { courseId, firstCA, secondCA, examScore, totalScore, grade, point } = courseHistory;
                        const pCourseId = parseInt(String(courseId), 10);

                        // Save Course Registration Record
                        const courseRegistration = await tx.studentCourseRegistration.create({
                            data: {
                                studentId: createdStudent.id,
                                courseId: pCourseId,
                                semesterId: pSemesterId,
                                levelId: pLevelId,
                                seasonId: pSeasonId,
                                isScoreRecorded: true
                            }
                        });

                        // Calculate unit Grade Points
                        let cuGp = null;
                        const courseRecord = await tx.course.findUnique({ where: { id: pCourseId }, select: { creditUnit: true } });
                        if (courseRecord && point !== undefined) {
                            cuGp = parseFloat(String(point)) * courseRecord.creditUnit;
                        }

                        // Save Course Score Breakdown
                        await tx.score.create({
                            data: {
                                studentCourseRegistrationId: courseRegistration.id,
                                firstCA: firstCA !== undefined ? parseFloat(String(firstCA)) : null,
                                secondCA: secondCA !== undefined ? parseFloat(String(secondCA)) : null,
                                examScore: examScore !== undefined ? parseFloat(String(examScore)) : null,
                                totalScore: totalScore !== undefined ? parseFloat(String(totalScore)) : null,
                                grade: grade ? grade : null,
                                point: point !== undefined ? parseFloat(String(point)) : null,
                                cuGp: cuGp,
                                resultId: createdResultSummary.id,
                                isApprovedByExaminer: true,
                                examinerApprovedAt: new Date(),
                                isAcceptedByHOD: true,
                                hodAcceptedAt: new Date()
                            }
                        });
                    }
                }
            }

            return createdStudent.id;
        }, {
            timeout: 25000 // Extended interactive execution window
        });

        // Retrieve fully constructed legacy student profile
        return await prisma.student.findUnique({
            where: { id: result },
            include: {
                studentDetails: true,
                results: {
                    include: {
                        scores: {
                            include: {
                                studentCourseRegistration: {
                                    include: { course: true }
                                }
                            }
                        }
                    }
                }
            }
        });

    } catch (error) {
        if (error instanceof AppError) throw error;
        // Parse raw database constraint errors to provide clear spreadsheet feedback
        if (error.code === 'P2002' && error.meta?.target) {
            const target = error.meta.target;
            let fieldName = Array.isArray(target) ? target.join(', ') : String(target);
            if (fieldName.includes('regNo')) fieldName = 'registration number';
            else if (fieldName.includes('email')) fieldName = 'email address';
            else if (fieldName.includes('jambRegNo')) fieldName = 'JAMB registration number';
            else if (fieldName.includes('phone')) fieldName = 'phone number';
            throw new AppError(`Migration failed: This student's ${fieldName} already exists in the system database.`, 409);
        }
        console.error("[LEGACY_STUDENT_ONBOARD_ERROR]:", error.message, error.stack);
        throw new AppError(`Migration failed: ${error.message}`, 500);
    }
};

/**
 * Onboard multiple legacy students sequentially from spreadsheet JSON objects.
 */
export const batchOnboardOldStudents = async (studentsArray) => {
    if (!Array.isArray(studentsArray) || studentsArray.length === 0) {
        throw new AppError('Legacy student array must not be empty.', 400);
    }

    const successfulCreations = [];
    const failedCreations = [];

    for (const [index, studentData] of studentsArray.entries()) {
        try {
            const studentProfile = await onboardOldStudent(studentData);
            successfulCreations.push({
                index,
                regNo: studentProfile.regNo,
                name: studentProfile.name,
                id: studentProfile.id
            });
        } catch (error) {
            failedCreations.push({
                index,
                name: studentData.name || 'Unknown student',
                error: error.message
            });
            console.error(`[Legacy Batch Onboard Failed] Index: ${index}`, error.message);
        }
    }

    const createdCount = successfulCreations.length;
    const skippedCount = failedCreations.length;
    
    return {
        status: skippedCount > 0 ? 'partial_success' : 'success',
        message: `Batch onboard complete. Created: ${createdCount}. Failed: ${skippedCount}.`,
        data: {
            createdCount,
            skippedCount,
            successfulCreations,
            failedCreations
        }
    };
};