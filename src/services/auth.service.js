
import prisma from '../config/prisma.js';
import { hashPassword, comparePassword } from '../utils/password.utils.js';
import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import AppError from '../utils/AppError.js';
import { ExamStatus } from '../generated/prisma/index.js'; 
import { getMyApplicationProfile } from './applicationProfile.service.js';
import { toZonedTime } from 'date-fns-tz';
import { sendEmail } from '../utils/email.js';

export const createInitialAdmin = async () => {
    try {
        if (!prisma) {
            console.error('Prisma client is not available in createInitialAdmin.');
            return;
        }
        if (
            !config.admin ||
            !config.admin.email || // Email must exist and be non-empty
            !config.admin.password || // Password must exist and be non-empty
            !config.admin.name // Name must exist and be non-empty (as per your current config loading)
        ) {
            console.error('Initial admin configuration (ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME) is missing or empty in .env file or config/index.js.');
            return;
        }

        const existingAdmin = await prisma.admin.findUnique({
            where: { email: config.admin.email },
        });

        if (!existingAdmin) {
            const hashedPassword = await hashPassword(config.admin.password);

            const adminDataToCreate = {
                email: config.admin.email,
                password: hashedPassword,
                name: config.admin.name,
                // Fields with schema defaults or loaded from config with defaults:
                role: config.admin.role, // From config, which has a default if .env is missing
                isPermittedToAddAdmin: config.admin.isPermittedToAddAdmin, // From config, handles string 'true'
                // Optional fields, will be null if not in config
                phone: config.admin.phone || null,
                location: config.admin.location || null,
                profileImg: config.admin.profileImg || null, // Assuming you might add ADMIN_PROFILE_IMG
            };

            await prisma.admin.create({
                data: adminDataToCreate,
            });
            console.log('Initial admin account created with specified/default values.');
        } else {
            console.log('Initial admin account already exists.');
        }
    } catch (error) {
        if (error.code === 'P2002' && error.meta?.target?.includes('phone')) {
            console.error('Error creating initial admin: The phone number from ADMIN_PHONE is already in use.', error);
        } else {
            console.error('Error creating/checking initial admin:', error.message, error.stack); // Log full stack for other errors
        }
    }
};


export const loginAdmin = async (email, password) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);

        const admin = await prisma.admin.findUnique({ where: { email } });
        if (!admin) {
            throw new AppError('Invalid email or password.', 401);
        }

        const isMatch = await comparePassword(password, admin.password);
        if (!isMatch) {
            throw new AppError('Invalid email or password.', 401);
        }

        const token = jwt.sign(
            { userId: admin.id, type: 'admin' }, // Payload
            config.jwtSecret,
            { expiresIn: '1d' } // Token expiration
        );

        // Exclude password from the returned admin object
        const { password: _, ...adminData } = admin;
        return { token, admin: adminData };
        

    } catch (error) {
        // Re-throw AppError instances, otherwise wrap in a generic error
        if (error instanceof AppError) throw error;
        console.error("Error in loginAdmin service:", error);
        throw new AppError('Login failed due to an internal error.', 500);
    }
};

// Add loginStudent, loginLecturer services here if needed, following similar pattern
export const loginStudent = async (identifier, password) => {
try {
if (!prisma) throw new AppError('Prisma client is not available.', 500);
if (!identifier || !password) {
throw new AppError('Identifier (RegNo/JambRegNo) and password are required.', 400);
}

let student;
    // Try finding by regNo first, then by jambRegNo
    student = await prisma.student.findUnique({
        where: { regNo: identifier },
    });

    if (!student && identifier) { // Assuming jambRegNo is a string and unique
        student = await prisma.student.findUnique({
            where: { jambRegNo: identifier },
        });
    }

    if (!student || !student.isActive) {
        throw new AppError('Invalid credentials or account inactive.', 401);
    }

    const isMatch = await comparePassword(password, student.password);
    if (!isMatch) {
        throw new AppError('Invalid credentials.', 401);
    }

    const payload = {
        userId: student.id,
        type: 'student',
        // Add any other student-specific info needed in JWT, but keep it minimal
    };

    const token = jwt.sign(payload, config.jwtSecret, { expiresIn: '1d' });
    const { password: _, ...studentData } = student;
    return { token, student: studentData };

} catch (error) {
    if (error instanceof AppError) throw error;
    console.error("Error in loginStudent service:", error);
    throw new AppError('Student login failed.', 500);
}

};

// --- Lecturer Login ---
export const loginLecturer = async (identifier, password) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        if (!identifier || !password) {
            throw new AppError('Identifier (Email/Staff ID) and password are required.', 400);
        }

        let lecturer;
        // Check if identifier looks like an email
        if (identifier.includes('@')) {
            lecturer = await prisma.lecturer.findUnique({
                where: { email: identifier },
                include: { department: true } // Include department for HOD context
            });
        } else {
            lecturer = await prisma.lecturer.findUnique({
                where: { staffId: identifier },
                include: { department: true } // Include department for HOD context
            });
        }

        if (!lecturer || !lecturer.isActive) {
            throw new AppError('Invalid credentials or account inactive.', 401);
        }

        const isMatch = await comparePassword(password, lecturer.password);
        if (!isMatch) {
            throw new AppError('Invalid credentials.', 401);
        }

        const payload = {
            userId: lecturer.id,
            type: 'lecturer', // Should be 'lecturer'
            role: lecturer.role,
        };

        const token = jwt.sign(payload, config.jwtSecret, { expiresIn: '1d' });
        const { password: _, ...lecturerData } = lecturer;
        return { token, lecturer: lecturerData };

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error in loginLecturer service:", error);
        throw new AppError('Lecturer login failed.', 500);
    }
};

// --- ICTStaff Login ---
export const loginICTStaff = async (identifier, password) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        if (!identifier || !password) {
            throw new AppError('Identifier (Email/Staff ID) and password are required.', 400);
        }

        let staff;
        if (identifier.includes('@')) {
            staff = await prisma.iCTStaff.findUnique({
                where: { email: identifier },
            });
        } else {
            staff = await prisma.iCTStaff.findUnique({
                where: { staffId: identifier },
            });
        }

        if (!staff || !staff.isActive) {
            throw new AppError('Invalid credentials or account inactive.', 401);
        }

        const isMatch = await comparePassword(password, staff.password);
        if (!isMatch) {
            throw new AppError('Invalid credentials.', 401);
        }

        const payload = {
            userId: staff.id,
            type: 'ictstaff',
        };

        const token = jwt.sign(payload, config.jwtSecret, { expiresIn: '1d' });
        const { password: _, ...staffData } = staff;
        return { token, staff: staffData };

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error in loginICTStaff service:", error);
        throw new AppError('ICT Staff login failed.', 500);
    }
};

export const authenticateForExamSessionAccess = async (regNo, examSessionId, providedAccessPassword) => {
    // ... (this function remains exactly as the one where password is on ExamSession,
    //          and it returns an examAccessToken specific to that session and exam) ...
    // ... (see previous correct version of this function)
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        if (!regNo || !examSessionId || !providedAccessPassword) {
            throw new AppError('Registration number, Exam Session ID, and Access Password are required.', 400);
        }
        const pExamSessionId = parseInt(examSessionId, 10);
        if (isNaN(pExamSessionId)) throw new AppError('Invalid Exam Session ID format.', 400);
        const student = await prisma.student.findUnique({
            where: { regNo: regNo, isActive: true },
            select: { id: true, name: true, regNo: true }
        });
        if (!student) throw new AppError('Invalid registration number or student account is inactive.', 401);
        const session = await prisma.examSession.findUnique({
            where: { id: pExamSessionId },
            include: { exam: { select: { id: true, title: true, status: true, durationMinutes: true, courseId: true, semesterId: true, seasonId: true } } }
        });
        if (!session) throw new AppError('Exam session not found.', 404);
        if (!session.exam) throw new AppError('Internal error: Exam details missing for the session.', 500);
        if (!session.isActive) throw new AppError('This exam session is not currently active.', 403);
        if (session.exam.status !== ExamStatus.ACTIVE) {
            throw new AppError(`The exam '${session.exam.title}' is not currently active (status: ${session.exam.status}).`, 403);
        }
        const now = new Date();
        if (now < new Date(session.startTime)) throw new AppError('This exam session has not started yet.', 403);
        if (now > new Date(session.endTime)) throw new AppError('This exam session has already ended.', 403);
        const assignment = await prisma.studentExamSessionAssignment.findUnique({
            where: { studentId_examSessionId: { studentId: student.id, examSessionId: pExamSessionId } }
        });
        if (!assignment) throw new AppError('You are not assigned to this specific exam session.', 403);
        const isRegistered = await prisma.studentCourseRegistration.findFirst({
            where: { studentId: student.id, courseId: session.exam.courseId, semesterId: session.exam.semesterId, seasonId: session.exam.seasonId }
        });
        if (!isRegistered) throw new AppError(`You are not registered for the course associated with this exam session.`, 403);
        if (!session.accessPassword) {
            throw new AppError(`Exam session '${session.sessionName || session.id}' is not configured with an access password.`, 400);
        }
        const isPasswordMatch = await comparePassword(providedAccessPassword, session.accessPassword);
        if (!isPasswordMatch) throw new AppError('Invalid access password for this exam session.', 401);
        const examAccessTokenPayload = { studentId: student.id, examId: session.exam.id, examSessionId: session.id, type: 'exam_attempt_access' };
        const examAccessToken = jwt.sign(examAccessTokenPayload, config.jwtSecret, { expiresIn: `${session.exam.durationMinutes + 30}m` });
        return {
            message: `Access granted for exam: '${session.exam.title}' (Session: ${session.sessionName || session.id}).`,
            examAccessToken,
            student: { id: student.id, regNo: student.regNo, name: student.name },
            exam: { id: session.exam.id, title: session.exam.title, durationMinutes: session.exam.durationMinutes },
            examSession: { id: session.id, name: session.sessionName, startTime: session.startTime, endTime: session.endTime }
        };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error in authenticateForExamSessionAccess service:", error.message, error.stack);
        throw new AppError('Exam session access authentication failed.', 500);
    }
};


// --- NEW: Login to View Accessible Exams (using RegNo + a generic ExamSession.accessPassword) ---

export const loginToViewAccessibleExams = async (regNo, providedAccessPassword) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        if (!regNo || !providedAccessPassword) {
            throw new AppError('Registration number and Access Password are required.', 400);
        }

        const student = await prisma.student.findUnique({
            where: { regNo, isActive: true },
            select: { id: true, name: true, regNo: true, email: true }
        });

        if (!student) {
            throw new AppError('Invalid registration number or student account inactive.', 401);
        }

        // --- 2. USE YOUR PROVEN TIMEZONE LOGIC ---
        // I have set the timezone to 'Africa/Lagos' as in your example.
        // This is the most crucial part of the fix.
        const timeZone = 'Africa/Lagos';
        const now = toZonedTime(new Date(), timeZone);

        // This Prisma query will now work correctly because `now` accurately represents
        // the current time in the target timezone for comparison.
        const assignedAndActiveSessions = await prisma.studentExamSessionAssignment.findMany({
            where: {
                studentId: student.id,
                examSession: {
                    isActive: true,
                    startTime: { lte: now },
                    endTime: { gte: now },
                    accessPassword: { not: null },
                    exam: {
                        status: ExamStatus.ACTIVE
                    }
                }
            },
            include: {
                examSession: {
                    include: {
                        exam: {
                            select: { 
                                id: true, 
                                title: true, 
                                examType: true, 
                                durationMinutes: true, 
                                course: { select: { code: true, title: true } } 
                            }
                        },
                        venue: { select: { id: true, name: true, location: true } }
                    }
                }
            }
        });

        if (assignedAndActiveSessions.length === 0) {
            throw new AppError('No currently active and assigned exam sessions found for you that require an access password.', 404);
        }
        
        const accessibleExamSessionsList = [];
        for (const assignment of assignedAndActiveSessions) {
            if (assignment.examSession.accessPassword) {
                const isPasswordMatch = await comparePassword(providedAccessPassword, assignment.examSession.accessPassword);
                if (isPasswordMatch) {
                    accessibleExamSessionsList.push({
                        examId: assignment.examSession.exam.id,
                        examTitle: assignment.examSession.exam.title,
                        examType: assignment.examSession.exam.examType,
                        courseCode: assignment.examSession.exam.course.code,
                        courseTitle: assignment.examSession.exam.course.title,
                        examSessionId: assignment.examSession.id,
                        sessionName: assignment.examSession.sessionName,
                        startTime: assignment.examSession.startTime,
                        endTime: assignment.examSession.endTime,
                        durationMinutes: assignment.examSession.exam.durationMinutes,
                        venueName: assignment.examSession.venue?.name,
                        venueLocation: assignment.examSession.venue?.location,
                        seatNumber: assignment.seatNumber
                    });
                }
            }
        }

        if (accessibleExamSessionsList.length === 0) {
            throw new AppError('Invalid access password or no exam sessions match this password for your current assignments.', 401);
        }

       // Change the token payload to use `userId` and a standard `type`.
        const examViewerTokenPayload = {
            userId: student.id,    // Use 'userId' instead of 'studentId'
            type: 'student',       // Use the standard 'student' type
        };
        const examViewerToken = jwt.sign(
            examViewerTokenPayload,
            config.jwtSecret,
            { expiresIn: '4h' } 
        );

        return {
            message: `Login successful. You have ${accessibleExamSessionsList.length} exam session(s) currently accessible with this password.`,
            examViewerToken,
            student: { id: student.id, regNo: student.regNo, name: student.name, email: student.email },
            accessibleExamSessions: accessibleExamSessionsList
        };

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error in loginToViewAccessibleExams service:", error.message, error.stack);
        throw new AppError('Exam schedule platform login failed.', 500);
    }
};

export const loginApplicantScreening = async (identifier, password) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const trimmedIdentifier = String(identifier).trim();

        if (!trimmedIdentifier || !password) {
            throw new AppError('Identifier (JAMB RegNo or Email) and password are required.', 400);
        }

        let screeningAccount;
        // Attempt to find by jambRegNo first
        screeningAccount = await prisma.onlineScreeningList.findUnique({
            where: { jambRegNo: trimmedIdentifier },
            select: { id: true, password: true, isActive: true, applicationProfile: { select: { id: true, jambRegNo: true } } }
        });

        // If not found by jambRegNo, try by email
        if (!screeningAccount) {
            screeningAccount = await prisma.onlineScreeningList.findUnique({
                where: { email: trimmedIdentifier },
                select: { id: true, password: true, isActive: true, applicationProfile: { select: { id: true, jambRegNo: true } } }
            });
        }
        
        if (!screeningAccount) {
            throw new AppError('Invalid credentials or no screening account found.', 404);
        }
        if (!screeningAccount.isActive) {
            throw new AppError('Screening account is inactive.', 403);
        }
        if (!screeningAccount.applicationProfile?.id) {
            throw new AppError('Critical Error: No application profile linked to this screening account. Please contact support.', 500);
        }

        const isPasswordMatch = await comparePassword(password, screeningAccount.password);
        if (!isPasswordMatch) {
            throw new AppError('Incorrect password.', 401);
        }

        await prisma.onlineScreeningList.update({
            where: { id: screeningAccount.id },
            data: { lastLogin: new Date() }
        });

        const fullApplicationProfile = await getMyApplicationProfile(screeningAccount.applicationProfile.id);

        const applicantTokenPayload = {
            userId: fullApplicationProfile.id,
            type: 'applicant',
            jambRegNo: fullApplicationProfile.jambRegNo || null 
        };

        const token = jwt.sign(applicantTokenPayload, config.jwtSecret, { expiresIn: '8h' });

        return {
            token,
            applicantProfile: fullApplicationProfile
        };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("[AUTH_SERVICE_ERROR] LoginApplicantScreening:", error.message, error.stack);
        throw new AppError('Applicant screening login failed.', 500);
    }
};

export const logout = async (token) => {
    // For stateless JWT auth, logout is typically handled client-side by deleting the token.
    // If you need to invalidate tokens server-side, consider a token blacklist or similar mechanism.
    return { message: 'Logged out successfully.' };
};

// --- PASSWORD RESET SERVICE FUNCTIONS ---

/**
 * Scan all models for a registered identifier, generate a secure token, and email a reset link.
 * Uses dynamic university configurations for branding and dynamic redirection.
 */
export const requestPasswordReset = async (identifier) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);

        const trimmed = String(identifier).trim();
        if (!trimmed) throw new AppError('Identifier is required.', 400);

        let user = null;
        let userType = null;
        let emailAddress = null;

        // 1. Scan Admin (by Email)
        if (trimmed.includes('@')) {
            user = await prisma.admin.findUnique({ where: { email: trimmed } });
            if (user) {
                userType = 'admin';
                emailAddress = user.email;
            }
        }

        // 2. Scan Student (by Email, RegNo, or JAMB RegNo)
        if (!user) {
            user = await prisma.student.findFirst({
                where: {
                    OR: [
                        { email: trimmed },
                        { regNo: trimmed },
                        { jambRegNo: trimmed }
                    ]
                }
            });
            if (user) {
                userType = 'student';
                emailAddress = user.email;
            }
        }

        // 3. Scan Lecturer (by Email or StaffID)
        if (!user) {
            user = await prisma.lecturer.findFirst({
                where: {
                    OR: [
                        { email: trimmed },
                        { staffId: trimmed }
                    ]
                }
            });
            if (user) {
                userType = 'lecturer';
                emailAddress = user.email;
            }
        }

        // 4. Scan ICTStaff (by Email or StaffID)
        if (!user) {
            user = await prisma.iCTStaff.findFirst({
                where: {
                    OR: [
                        { email: trimmed },
                        { staffId: trimmed }
                    ]
                }
            });
            if (user) {
                userType = 'ictstaff';
                emailAddress = user.email;
            }
        }

        // 5. Scan OnlineScreeningList - Applicants (by Email or JAMB RegNo)
        if (!user) {
            user = await prisma.onlineScreeningList.findFirst({
                where: {
                    OR: [
                        { email: trimmed },
                        { jambRegNo: trimmed }
                    ]
                }
            });
            if (user) {
                userType = 'applicant';
                emailAddress = user.email;
            }
        }

        if (!user) {
            throw new AppError('No account found matching the provided details.', 404);
        }
        if (!emailAddress) {
            throw new AppError('This account does not have a registered email address. Please contact support.', 400);
        }

        // --- FETCH DYNAMIC UNIVERSITY SETTINGS ---
        const uniSettings = await prisma.universitySetting.findFirst();
        const uniName = uniSettings?.name || 'Royalty College of Education, Health Sciences and Technology';
        const uniAcronym = uniSettings?.acronym || 'RCOEHST';
        const uniEmail = uniSettings?.email || 'info@royaltycollege.edu.ng';
        const uniPhone = uniSettings?.phone || '';
        const uniAddress = uniSettings?.address || '';
        const uniLogo = uniSettings?.logoUrl || '';

        // Create a stateless reset token using the current password hash as part of the secret.
        const tokenSecret = config.jwtSecret + user.password;
        const payload = {
            userId: user.id,
            email: emailAddress,
            type: userType
        };

        const token = jwt.sign(payload, tokenSecret, { expiresIn: '15m' });

        // Build target portal redirect paths
        let portalUrl = '';
        if (userType === 'student') {
            portalUrl = config.studentPortalUrl.replace('/student-login', '') + '/reset-password';
        } else if (userType === 'applicant') {
            portalUrl = config.screeningPortalUrl.replace('/screening-login', '') + '/reset-password';
        } else if (userType === 'lecturer') {
            portalUrl = (process.env.LECTURER_URL || 'http://localhost:8081') + '/reset-password';
        } else if (userType === 'ictstaff') {
            portalUrl = (process.env.ICT_URL || 'http://localhost:8082') + '/reset-password';
        } else {
            portalUrl = (process.env.ADMIN_URL || 'http://localhost:8083') + '/reset-password';
        }

        const resetLink = `${portalUrl}?token=${token}`;

        // Build dynamic header logo if available
        const headerLogoHtml = uniLogo 
            ? `<div style="text-align: center; margin-bottom: 20px;"><img src="${uniLogo}" alt="${uniAcronym}" style="max-height: 80px; object-fit: contain;" /></div>`
            : '';

        // Construct HTML email notification
        const subject = `${uniAcronym} Portal - Password Reset Request`;
        const text = `Hello ${user.name || 'User'},\n\nYou requested to reset your password for your account at ${uniName}. Click the link below to set a new password:\n\n${resetLink}\n\nThis link is valid for 15 minutes. If you did not request this, please ignore this email.`;
        
        const html = `
            <div style="font-family: sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; padding: 25px; border-radius: 8px;">
                ${headerLogoHtml}
                <h2 style="color: #2c3e50; text-align: center; margin-top: 0;">${uniName}</h2>
                <p>Hello <strong>${user.name || 'User'}</strong>,</p>
                <p>You requested a password reset for your portal account. Click the button below to set your new password:</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${resetLink}" style="background-color: #3498db; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">Reset Password</a>
                </div>
                <p style="color: #7f8c8d; font-size: 0.9em; text-align: center;">This link will expire in 15 minutes. If you did not request a password reset, please ignore this email.</p>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 25px 0;" />
                <div style="color: #95a5a6; font-size: 0.85em; text-align: center; line-height: 1.5;">
                    <strong>${uniName}</strong><br />
                    ${uniAddress ? `${uniAddress}<br />` : ''}
                    ${uniPhone ? `Tel: ${uniPhone} | ` : ''} Email: ${uniEmail}
                </div>
            </div>
        `;

        await sendEmail({
            from: `${uniAcronym} Support <${config.email.from}>`, // Custom dynamic sender display name
            to: emailAddress,
            subject,
            text,
            html
        });

        return { message: 'A secure password reset link has been sent to your registered email address.' };

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("[AUTH_SERVICE_ERROR] requestPasswordReset:", error.message, error.stack);
        throw new AppError('Could not process password reset request due to an internal error.', 500);
    }
};

/**
 * Verify token authenticity, decode type, and securely hash/update the target password.
 */
export const resetPassword = async (token, newPassword) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);

        const decoded = jwt.decode(token);
        if (!decoded || !decoded.userId || !decoded.type) {
            throw new AppError('The password reset token is invalid or malformed.', 400);
        }

        let user = null;
        if (decoded.type === 'admin') {
            user = await prisma.admin.findUnique({ where: { id: decoded.userId } });
        } else if (decoded.type === 'student') {
            user = await prisma.student.findUnique({ where: { id: decoded.userId } });
        } else if (decoded.type === 'lecturer') {
            user = await prisma.lecturer.findUnique({ where: { id: decoded.userId } });
        } else if (decoded.type === 'ictstaff') {
            user = await prisma.iCTStaff.findUnique({ where: { id: decoded.userId } });
        } else if (decoded.type === 'applicant') {
            user = await prisma.onlineScreeningList.findUnique({ where: { id: decoded.userId } });
        }

        if (!user) {
            throw new AppError('The account associated with this token was not found.', 404);
        }

        const tokenSecret = config.jwtSecret + user.password;
        try {
            jwt.verify(token, tokenSecret);
        } catch (err) {
            throw new AppError('The password reset link has expired or has already been used.', 400);
        }

        const hashedPassword = await hashPassword(newPassword);

        if (decoded.type === 'admin') {
            await prisma.admin.update({ where: { id: decoded.userId }, data: { password: hashedPassword } });
        } else if (decoded.type === 'student') {
            await prisma.student.update({ where: { id: decoded.userId }, data: { password: hashedPassword } });
        } else if (decoded.type === 'lecturer') {
            await prisma.lecturer.update({ where: { id: decoded.userId }, data: { password: hashedPassword } });
        } else if (decoded.type === 'ictstaff') {
            await prisma.iCTStaff.update({ where: { id: decoded.userId }, data: { password: hashedPassword } });
        } else if (decoded.type === 'applicant') {
            await prisma.onlineScreeningList.update({ where: { id: decoded.userId }, data: { password: hashedPassword } });
        }

        return { message: 'Your password has been successfully updated.' };

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("[AUTH_SERVICE_ERROR] resetPassword:", error.message, error.stack);
        throw new AppError('Could not reset password. Please try requesting a new link.', 500);
    }
};