import * as AuthService from '../services/auth.service.js';
import AppError from '../utils/AppError.js';

export const adminLogin = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return next(new AppError('Please provide email and password', 400));
        }
        const result = await AuthService.loginAdmin(email, password);
        res.status(200).json({
            status: 'success',
            message: 'Admin logged in successfully',
            data: result,
        });
    } catch (error) {
        next(error); 
    }
};

export const studentLogin = async (req, res, next) => {
    try {
        const { identifier, password } = req.body; 
        if (!identifier || !password) {
            return next(new AppError('Please provide your identifier (RegNo/JambRegNo) and password.', 400));
        }
        const result = await AuthService.loginStudent(identifier, password);
        res.status(200).json({
            status: 'success',
            message: 'Student logged in successfully.',
            data: result,
        });
    } catch (error) {
        next(error);
    }
};

export const lecturerLogin = async (req, res, next) => {
    try {
        const { identifier, password } = req.body; 
        if (!identifier || !password) {
            return next(new AppError('Please provide your identifier (Email/Staff ID) and password.', 400));
        }
        const result = await AuthService.loginLecturer(identifier, password);
        res.status(200).json({
            status: 'success',
            message: 'Lecturer logged in successfully.',
            data: result,
        });
    } catch (error) {
        next(error);
    }
};

export const ictStaffLogin = async (req, res, next) => {
    try {
        const { identifier, password } = req.body; 
        if (!identifier || !password) {
            return next(new AppError('Please provide your identifier (Email/Staff ID) and password.', 400));
        }
        const result = await AuthService.loginICTStaff(identifier, password);
        res.status(200).json({
            status: 'success',
            message: 'ICT Staff logged in successfully.',
            data: result,
        });
    } catch (error) {
        next(error);
    }
};

// --- FORGOT PASSWORD CONTROLLER ---
export const forgotPassword = async (req, res, next) => {
    try {
        const { identifier } = req.body;
        if (!identifier) {
            return next(new AppError('Please provide your registered email, registration number, or staff ID.', 400));
        }

        const result = await AuthService.requestPasswordReset(identifier);
        res.status(200).json({
            status: 'success',
            message: result.message
        });
    } catch (error) {
        next(error);
    }
};

// --- RESET PASSWORD CONTROLLER ---
// --- RESET PASSWORD CONTROLLER ---
export const resetPassword = async (req, res, next) => {
    try {
        const { token, newPassword, password } = req.body;
        
        // SUPPORT BOTH FRONTEND NOMENCLATURES GRACEFULLY
        const targetPassword = newPassword || password;

        if (!token || !targetPassword) {
            return next(new AppError('Token and new password are required.', 400));
        }

        const result = await AuthService.resetPassword(token, targetPassword);
        res.status(200).json({
            status: 'success',
            message: result.message
        });
    } catch (error) {
        next(error);
    }
};

export const logoutUser = async (req, res, next) => {
    try {
        res.clearCookie('jwt', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' });
        res.status(200).json({
            status: 'success',
            message: 'You have been successfully logged out.',
        });
    } catch (error) {
        console.error("Error during logout:", error);
        next(new AppError('Logout failed unexpectedly.', 500));
    }
};

export const authenticateForExamSessionAccess = async (req, res, next) => {
    try {
        const { regNo, examSessionId, accessPassword } = req.body;
        if (!regNo || !examSessionId || !accessPassword) {
            return next(new AppError('Registration number, Exam Session ID, and Access Password are required.', 400));
        }
        const result = await AuthService.authenticateForExamSessionAccess(regNo, examSessionId, accessPassword);
        res.status(200).json({
            status: 'success',
            message: result.message,
            data: {
                examAccessToken: result.examAccessToken,
                student: result.student,
                exam: result.exam,
                examSession: result.examSession
            }
        });
    } catch (error) {
        next(error);
    }
};

export const loginToViewAccessibleExams = async (req, res, next) => {
    try {
        const { regNo, accessPassword } = req.body;
        if (!regNo || !accessPassword) {
            return next(new AppError('Registration number and Access Password are required.', 400));
        }
        const result = await AuthService.loginToViewAccessibleExams(regNo, accessPassword);
        res.status(200).json({
            status: 'success',
            message: result.message,
            data: {
                examViewerToken: result.examViewerToken,
                student: result.student,
                accessibleExamSessions: result.accessibleExamSessions
            }
        });
    } catch (error) {
        next(error);
    }
};

export const loginApplicantScreening = async (req, res, next) => {
    try {
        const { jambRegNo, password } = req.body;
        const result = await AuthService.loginApplicantScreening(jambRegNo, password);
        res.status(200).json({
            status: 'success',
            message: 'Applicant logged into screening portal successfully.',
            data: result
        });
    } catch (error) {
        next(error);
    }
};