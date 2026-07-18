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
 * Onboard or update a legacy student along with their historical semesters, results, and scores.
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

        const trimmedEmail = email.trim();
        const trimmedRegNo = regNo && String(regNo).trim() !== "" ? String(regNo).trim() : null;
        const trimmedJambRegNo = jambRegNo && String(jambRegNo).trim() !== "" ? String(jambRegNo).trim() : null;
        const trimmedPhone = phone && String(phone).trim() !== "" ? String(phone).trim() : null;

        // Check if student already exists
        const existingStudent = await prisma.student.findFirst({
            where: {
                OR: [
                    { email: trimmedEmail },
                    trimmedRegNo ? { regNo: trimmedRegNo } : undefined
                ].filter(Boolean)
            },
            include: { studentDetails: true }
        });

        // Hash Legacy Password outside transaction if creating new student or updating password
        let hashedPassword = null;
        if (!existingStudent || (providedPassword && String(providedPassword).trim() !== '')) {
            let passwordToHash = providedPassword && String(providedPassword).trim() !== ''
                ? String(providedPassword).trim()
                : config.studentDefaultPassword || '123456';
            hashedPassword = await hashPassword(passwordToHash);
        }

        // Retrieve school acronym for fallback regNo generation
        const setting = await prisma.universitySetting.findFirst({ select: { acronym: true } });
        const schoolAcronym = setting?.acronym ? setting.acronym.trim().toUpperCase() : '';
        const acronymPrefix = schoolAcronym ? `${schoolAcronym}/` : '';

        // --- 2. Write Database Transaction ---
        const finalStudentId = await prisma.$transaction(async (tx) => {
            let studentId;

            if (existingStudent) {
                studentId = existingStudent.id;

                // Update Student Core Record
                await tx.student.update({
                    where: { id: studentId },
                    data: {
                        name: name.trim(),
                        jambRegNo: trimmedJambRegNo,
                        regNo: trimmedRegNo || existingStudent.regNo,
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
                        ...(hashedPassword && { password: hashedPassword })
                    }
                });

                // Upsert Details
                await tx.studentDetails.upsert({
                    where: { studentId },
                    create: {
                        studentId,
                        dob: dob ? new Date(dob) : null,
                        gender: gender || Gender.MALE,
                        address: address ? address.trim() : null,
                        phone: trimmedPhone,
                        guardianName: guardianName ? guardianName.trim() : null,
                        guardianPhone: guardianPhone ? guardianPhone.trim() : null
                    },
                    update: {
                        dob: dob ? new Date(dob) : null,
                        gender: gender || Gender.MALE,
                        address: address ? address.trim() : null,
                        phone: trimmedPhone,
                        guardianName: guardianName ? guardianName.trim() : null,
                        guardianPhone: guardianPhone ? guardianPhone.trim() : null
                    }
                });

            } else {
                // Create brand new Student Record
                const createdStudent = await tx.student.create({
                    data: {
                        name: name.trim(),
                        email: trimmedEmail,
                        jambRegNo: trimmedJambRegNo,
                        regNo: trimmedRegNo || null,
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

                studentId = createdStudent.id;

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
                        where: { id: studentId },
                        data: { regNo: generatedRegNo }
                    });
                }

                // Create Student Physical Details
                await tx.studentDetails.create({
                    data: {
                        studentId,
                        dob: dob ? new Date(dob) : null,
                        gender: gender || Gender.MALE,
                        address: address ? address.trim() : null,
                        phone: trimmedPhone,
                        guardianName: guardianName ? guardianName.trim() : null,
                        guardianPhone: guardianPhone ? guardianPhone.trim() : null
                    }
                });
            }

            // --- 3. Process/Upsert Legacy Academic Records ---
            if (Array.isArray(academicHistory) && academicHistory.length > 0) {
                for (const semesterResult of academicHistory) {
                    const {
                        seasonId, semesterId, levelId, gpa, cgpa,
                        cuAttempted, cuPassed, cuTotal, remarks, courses = []
                    } = semesterResult;

                    const pSeasonId = parseInt(String(seasonId), 10);
                    const pSemesterId = parseInt(String(semesterId), 10);
                    const pLevelId = parseInt(String(levelId), 10);

                    // Upsert semester result summary
                    const createdResultSummary = await tx.result.upsert({
                        where: {
                            unique_student_semester_season_result: {
                                studentId,
                                semesterId: pSemesterId,
                                seasonId: pSeasonId
                            }
                        },
                        create: {
                            studentId,
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
                        },
                        update: {
                            departmentId: pDepartmentId,
                            programId: pProgramId,
                            levelId: pLevelId,
                            gpa: gpa ? parseFloat(String(gpa)) : null,
                            cgpa: cgpa ? parseFloat(String(cgpa)) : null,
                            cuAttempted: cuAttempted ? parseInt(String(cuAttempted), 10) : null,
                            cuPassed: cuPassed ? parseInt(String(cuPassed), 10) : null,
                            cuTotal: cuTotal ? parseInt(String(cuTotal), 10) : null,
                            remarks: remarks ? remarks : null
                        }
                    });

                    // Add/Upsert registered courses & scores
                    for (const courseHistory of courses) {
                        const { courseId, firstCA, secondCA, examScore, totalScore, grade, point } = courseHistory;
                        const pCourseId = parseInt(String(courseId), 10);

                        // Upsert Course Registration Record
                        const courseRegistration = await tx.studentCourseRegistration.upsert({
                            where: {
                                unique_student_course_semester_season_registration: {
                                    studentId,
                                    courseId: pCourseId,
                                    semesterId: pSemesterId,
                                    seasonId: pSeasonId
                                }
                            },
                            create: {
                                studentId,
                                courseId: pCourseId,
                                semesterId: pSemesterId,
                                levelId: pLevelId,
                                seasonId: pSeasonId,
                                isScoreRecorded: true
                            },
                            update: {
                                levelId: pLevelId
                            }
                        });

                        // Calculate unit Grade Points
                        let cuGp = null;
                        const courseRecord = await tx.course.findUnique({ where: { id: pCourseId }, select: { creditUnit: true } });
                        if (courseRecord && point !== undefined) {
                            cuGp = parseFloat(String(point)) * courseRecord.creditUnit;
                        }

                        // Upsert Course Score Breakdown
                        await tx.score.upsert({
                            where: { studentCourseRegistrationId: courseRegistration.id },
                            create: {
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
                            },
                            update: {
                                firstCA: firstCA !== undefined ? parseFloat(String(firstCA)) : null,
                                secondCA: secondCA !== undefined ? parseFloat(String(secondCA)) : null,
                                examScore: examScore !== undefined ? parseFloat(String(examScore)) : null,
                                totalScore: totalScore !== undefined ? parseFloat(String(totalScore)) : null,
                                grade: grade ? grade : null,
                                point: point !== undefined ? parseFloat(String(point)) : null,
                                cuGp: cuGp,
                                resultId: createdResultSummary.id
                            }
                        });
                    }
                }
            }

            return studentId;
        }, {
            timeout: 30000 // Extended interactive execution window
        });

        // Retrieve fully constructed legacy student profile
        return await prisma.student.findUnique({
            where: { id: finalStudentId },
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