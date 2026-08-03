import * as AuthService from '../services/auth.service.js';
import catchAsync from '../utils/catchAsync.js';
import AppError from '../utils/AppError.js';
import * as TokenService from '../services/token.service.js';

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



export const loginToViewAccessibleExams = catchAsync(async (req, res, next) => {
    const { regNo, accessPassword, providedAccessPassword, password } = req.body;
    
    // Gracefully resolve target access password regardless of key name used by frontend
    const targetPassword = accessPassword || providedAccessPassword || password;

    if (!regNo || !targetPassword) {
        return next(new AppError('Registration number and Access Password are required.', 400));
    }

    const result = await AuthService.loginToViewAccessibleExams(regNo, targetPassword);
    res.status(200).json({
        status: 'success',
        message: result.message,
        data: {
            examViewerToken: result.examViewerToken,
            student: result.student,
            accessibleExamSessions: result.accessibleExamSessions
        }
    });
});

export const authenticateForExamSessionAccess = catchAsync(async (req, res, next) => {
    const { regNo, examSessionId, accessPassword, providedAccessPassword, password } = req.body;
    
    const targetPassword = accessPassword || providedAccessPassword || password;

    if (!regNo || !examSessionId || !targetPassword) {
        return next(new AppError('Registration number, Exam Session ID, and Access Password are required.', 400));
    }

    const result = await AuthService.authenticateForExamSessionAccess(regNo, examSessionId, targetPassword);
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
});

export const loginApplicantScreening = catchAsync(async (req, res, next) => {
    const { jambRegNo, identifier, password } = req.body;
    const targetIdentifier = jambRegNo || identifier;

    if (!targetIdentifier || !password) {
        return next(new AppError('Please provide your JAMB Reg No or email and password.', 400));
    }

    const result = await AuthService.loginApplicantScreening(targetIdentifier, password);
    res.status(200).json({
        status: 'success',
        message: 'Applicant logged into screening portal successfully.',
        data: result
    });
});


/**
 * Endpoint to issue a new Access Token using a valid Refresh Token
 */
export const refreshTokens = catchAsync(async (req, res, next) => {
    const { refreshToken } = req.body;
    
    // Verifies refresh token, rotates DB record, and returns a new token pair
    const tokens = await TokenService.refreshAuthTokens(refreshToken);

    res.status(200).json({
        status: 'success',
        message: 'Tokens refreshed successfully.',
        data: { tokens }
    });
});

/**
 * Logout user and revoke their refresh token in the DB
 */
export const logoutUser = catchAsync(async (req, res, next) => {
    // Support refresh token in body or cookie
    const refreshToken = req.body?.refreshToken || req.cookies?.refreshToken;

    if (refreshToken) {
        await TokenService.revokeRefreshToken(refreshToken);
    } else if (req.user && req.user.userId) {
        // No refresh token provided but user is authenticated: revoke all tokens for the user
        await TokenService.revokeRefreshToken(null, { userId: req.user.userId });
    }

    // Clear cookie if present
    try {
        res.clearCookie('refreshToken');
    } catch (err) {
        // ignore
    }

    res.status(200).json({
        status: 'success',
        message: 'Logged out successfully.'
    });
});
