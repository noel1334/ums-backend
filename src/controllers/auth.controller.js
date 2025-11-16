
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
        next(error); // Pass error to global error handler
    }
};

// --- Student Login Controller ---
export const studentLogin = async (req, res, next) => {
    try {
        const { identifier, password } = req.body; // 'identifier' can be regNo or jambRegNo
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

// --- Lecturer Login Controller ---
export const lecturerLogin = async (req, res, next) => {
    try {
        const { identifier, password } = req.body; // 'identifier' can be email or staffId
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

// --- ICTStaff Login Controller ---
export const ictStaffLogin = async (req, res, next) => {
    try {
        const { identifier, password } = req.body; // 'identifier' can be email or staffId
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

export const logoutUser = async (req, res, next) => {
    try {
        // For a stateless JWT system without a denylist, logout is primarily a client-side action
        // (client deletes the token).
        // The server can acknowledge the logout request.

        // If you were using HTTP-only cookies for tokens, you would clear the cookie here:
        res.clearCookie('jwt', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' });

        // For now, we just send a success response.
        // The client is responsible for removing the token from its storage.
        res.status(200).json({
            status: 'success',
            message: 'You have been successfully logged out.',
        });
    } catch (error) {
        // This catch block is unlikely to be hit for a simple logout like this
        // unless there's an issue with sending the response.
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
