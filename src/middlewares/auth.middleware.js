// src/middlewares/auth.middleware.js
import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import AppError from '../utils/AppError.js';
import prisma from '../config/prisma.js';
import { LecturerRole, ApplicationStatus } from '../generated/prisma/index.js'; // Ensure ApplicationStatus is imported

// --- CORE AUTHENTICATION ---

export const authenticateToken = async (req, res, next) => {
    console.log(`[AUTH_MIDDLEWARE_LOG] >>> Entering authenticateToken for ${req.method} ${req.originalUrl}`);
    
    try {
        let token;
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) {
            console.log(`[AUTH_MIDDLEWARE_LOG] No token found in authenticateToken.`);
            return next(new AppError('You are not logged in. Please log in to get access.', 401));
        }

        if (!config.jwtSecret) {
            console.error("[AUTH_MIDDLEWARE_LOG] !!! FATAL ERROR: JWT_SECRET is not configured!");
            return next(new AppError('Server configuration error. JWT secret missing.', 500));
        }

        const decoded = jwt.verify(token, config.jwtSecret);
        console.log(`[AUTH_MIDDLEWARE_LOG] Raw Decoded Token (main auth): `, JSON.stringify(decoded));

        let user;
        const { userId, type: tokenType } = decoded;

        console.log(`[AUTH_MIDDLEWARE_LOG] Type from token: '${tokenType}', UserID from token: ${userId}`);

        if (!userId) {
            return next(new AppError('Invalid token: Missing user identifier.', 401));
        }

        if (tokenType === 'admin') {
            console.log(`[AUTH_MIDDLEWARE_LOG] Matched tokenType 'admin'`);
            user = await prisma.admin.findUnique({ where: { id: userId } });
        }  else if (tokenType === 'student') {
            console.log(`[AUTH_MIDDLEWARE_LOG] Matched tokenType 'student'`);
            user = await prisma.student.findUnique({
                where: { id: userId },
                select: {
                    id: true,
                    regNo: true,
                    name: true,
                    email: true,
                    departmentId: true,
                    programId: true,
                    currentLevelId: true,
                    studentDetails: {
                        select: {
                            id: true,
                            dob: true,
                            gender: true,
                            address: true,
                            phone: true,
                            guardianName: true,
                            guardianPhone: true,
                            createdAt: true,
                            updatedAt: true,
                        },
                    },
                    department: {
                        select: {
                            id: true,
                            name: true,
                            faculty: {
                                select: {
                                    id: true,
                                },
                            },
                        },
                    },
                    currentLevel: {
                        select: {
                            id: true,
                            name: true,
                            value: true,
                        },
                    },
                    currentSemester: {
                        select: {
                            id: true,
                            name: true,
                            seasonId: true,
                            type: true,
                            semesterNumber: true,
                            isActive: true,
                            startDate: true,
                            endDate: true,
                            areStudentEditsLocked: true,
                            areLecturerScoreEditsLocked: true,
                            createdAt: true,
                            updatedAt: true,
                        },
                    },
                    currentSeason: {
                        select: {
                            id: true,
                            name: true,
                            isActive: true,
                            isComplete: false,
                            startDate: true,
                            endDate: true,
                            createdAt: true,
                            updatedAt: true,
                        },
                    },
                    admissionOfferDetails: {
                        select: {
                            id: true,
                            applicationProfileId: true,
                            physicalScreeningId: true,
                            offeredProgramId: true,
                            offeredLevelId: true,
                            admissionSeasonId: true,
                            admissionSemesterId: true,
                            offerDate: true,
                            acceptanceDeadline: true,
                            isAccepted: true,
                            acceptanceDate: true,
                            rejectionReason: true,
                            generatedStudentRegNo: true,
                            createdStudentId: true,
                            admissionLetterUrl: true,
                            acceptanceFeeListId: true,
                            hasPaidAcceptanceFee: true,
                            createdAt: true,
                            updatedAt: true,
                            applicationProfile: {
                                select: {
                                    id: true,
                                    jambRegNo: true,
                                    onlineScreeningListId: true,
                                    email: true,
                                    phone: true,
                                    applicationStatus: true,
                                    remarks: true,
                                    targetProgramId: true,
                                    hasPaidScreeningFee: true,
                                    createdAt: true,
                                    updatedAt: true,
                                    bioData: {
                                        select: {
                                            id: true,
                                            nationality: true,
                                            firstName: true,
                                            middleName: true,
                                            lastName: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            });
        } else if (tokenType === 'lecturer') {
            console.log(`[AUTH_MIDDLEWARE_LOG] Matched tokenType 'lecturer'`);
            user = await prisma.lecturer.findUnique({ where: { id: userId }, include: { department: true } });
        } else if (tokenType === 'ictstaff') {
            console.log(`[AUTH_MIDDLEWARE_LOG] Matched tokenType 'ictstaff'`);
            user = await prisma.iCTStaff.findUnique({ where: { id: userId } });
        }
        // As per the original comment and design choice, do not handle 'applicant' tokens here.
        // Routes needing applicant tokens should use `authenticateApplicantToken`.
        else if (tokenType === 'applicant') {
            console.log(`[AUTH_MIDDLEWARE_LOG] Token is of type 'applicant'. This authenticator does not handle 'applicant' tokens directly.`);
            return next(new AppError('Invalid token: Applicant tokens should use a dedicated authentication middleware.', 401));
        }
        else {
            console.log(`[AUTH_MIDDLEWARE_LOG] !!! Unknown or unhandled tokenType in authenticateToken: '${tokenType}'`);
            return next(new AppError('Invalid token: Unrecognized user type for this access point.', 401));
        }

        if (!user) {
            console.log(`[AUTH_MIDDLEWARE_LOG] User not found in DB for token. Decoded type: ${tokenType}, ID: ${userId}`);
            return next(new AppError('The user associated with this token no longer exists or is invalid.', 401));
        }

        if (user.hasOwnProperty('isActive') && user.isActive === false && tokenType !== 'admin') {
            console.log(`[AUTH_MIDDLEWARE_LOG] User ${userId} (type: ${tokenType}) is inactive.`);
            return next(new AppError('Your account is currently inactive. Please contact support.', 403));
        }

        req.user = user;
        req.user.type = tokenType;

        console.log(`[AUTH_MIDDLEWARE_LOG] Attaching user to req: id=${req.user.id}, email=${req.user.email || req.user.jambRegNo}, type=${req.user.type}, role=${req.user.role || 'N/A'}`);
        console.log(`[AUTH_MIDDLEWARE_LOG] <<< Exiting authenticateToken, calling next()`);
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            console.error(`[AUTH_MIDDLEWARE_LOG] !!! JsonWebTokenError: ${error.message}`);
            return next(new AppError('Invalid token. Please log in again.', 401));
        }
        if (error.name === 'TokenExpiredError') {
            console.error(`[AUTH_MIDDLEWARE_LOG] !!! TokenExpiredError: ${error.message}`);
            return next(new AppError('Your token has expired. Please log in again.', 401));
        }
        console.error(`[AUTH_MIDDLEWARE_LOG] !!! UNHANDLED ERROR in authenticateToken: ${error.message}`, error.stack);
        next(new AppError('Authentication failed.', 500));
    }
};

// MODIFIED: authenticateApplicantToken for nullable jambRegNo and full req.user population
export const authenticateApplicantToken = async (req, res, next) => {
    console.log(`[APPLICANT_AUTH_LOG] >>> Entering authenticateApplicantToken for ${req.method} ${req.originalUrl}`);
    try {
        let token;
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }
        if (!token) {
            console.log(`[APPLICANT_AUTH_LOG] Applicant access token is missing.`);
            return next(new AppError('Screening portal access token is missing.', 401));
        }

        if (!config.jwtSecret) {
            console.error("[APPLICANT_AUTH_LOG] !!! FATAL ERROR: JWT_SECRET is not configured!");
            return next(new AppError('Server configuration error. JWT secret missing.', 500));
        }

        const decoded = jwt.verify(token, config.jwtSecret);
        console.log(`[APPLICANT_AUTH_LOG] Raw Decoded Token (applicant auth): `, JSON.stringify(decoded));

        // CRITICAL CHANGE: jambRegNo is now nullable on ApplicationProfile, so don't check it in the token payload directly
        if (decoded.type !== 'applicant' || !decoded.userId) {
            console.log(`[APPLICANT_AUTH_LOG] Invalid token type or missing userId for applicant. Decoded: ${JSON.stringify(decoded)}`);
            return next(new AppError('Invalid or malformed applicant access token.', 401));
        }

        // Fetch the full ApplicationProfile, including required nested data
        const applicantProfile = await prisma.applicationProfile.findUnique({
            where: {
                id: decoded.userId,
                // Removed jambRegNo from where clause as it might not be in token or nullable in DB
            },
            include: {
                onlineScreeningList: {
                    select: {
                        isActive: true, // NEW: Check if the online screening account itself is active
                        jambApplicant: {
                            select: {
                                name: true,
                                entryMode: true,
                                jambSeasonId: true
                            }
                        }
                    }
                },
                bioData: { select: { firstName: true, lastName: true } }, // Include bioData for applicant name
                targetProgram: { select: { id: true, name: true, degreeType: true, onlineScreeningRequired: true } } // Include target program details
            }
        });

        if (!applicantProfile) {
            console.log(`[APPLICANT_AUTH_LOG] Applicant profile not found for token userId: ${decoded.userId}`);
            return next(new AppError('Applicant profile for this token not found or invalid.', 401));
        }
        // An applicant's online screening account (onlineScreeningList) should be active
        if (!applicantProfile.onlineScreeningList || !applicantProfile.onlineScreeningList.isActive) {
             console.log(`[APPLICANT_AUTH_LOG] Applicant's online screening account is inactive or missing.`);
             return next(new AppError('Your application account is inactive. Please contact support.', 403));
        }


        // Attach the full profile to the request for easy access in controllers/services
        req.applicantProfile = applicantProfile;
        
        // Populate req.user for consistency with other middlewares and `authorize`
        // Derive applicant name robustly: from bioData first, then JAMB data, fallback to "Applicant"
        const applicantName = applicantProfile.bioData 
            ? `${applicantProfile.bioData.firstName || ''} ${applicantProfile.bioData.lastName || ''}`.trim()
            : applicantProfile.onlineScreeningList?.jambApplicant?.name || 'Applicant';

        req.user = {
            id: applicantProfile.id,
            jambRegNo: applicantProfile.jambRegNo, // Can be null, still include for context
            type: 'applicant', // Explicitly set the type
            email: applicantProfile.email,
            name: applicantName,
            applicationStatus: applicantProfile.applicationStatus,
            targetProgram: applicantProfile.targetProgram // Add target program for easy access
        };

        console.log(`[APPLICANT_AUTH_LOG] Applicant authenticated: id=${req.user.id}, email=${req.user.email}, type=${req.user.type}`);
        console.log(`[APPLICANT_AUTH_LOG] <<< Exiting authenticateApplicantToken, calling next()`);
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            console.error(`[APPLICANT_AUTH_LOG] !!! Invalid or expired applicant access token: ${error.message}`);
            return next(new AppError('Invalid or expired applicant access token. Please log in again.', 401));
        }
        console.error("[APPLICANT_AUTH_LOG] !!! UNHANDLED ERROR in authenticateApplicantToken:", error.message, error.stack);
        next(new AppError('Applicant authentication failed.', 500));
    }
};


export const authenticateExamAttemptToken = async (req, res, next) => {
    console.log(`[EXAM_AUTH_LOG] >>> Entering authenticateExamAttemptToken for ${req.method} ${req.originalUrl}`);
    try {
        let token;
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }
        if (!token) return next(new AppError('Exam access token is missing.', 401));
        if (!config.jwtSecret) throw new AppError('Server configuration error: JWT secret missing.', 500);

        const decoded = jwt.verify(token, config.jwtSecret);
        console.log(`[EXAM_AUTH_LOG] Decoded exam access token: `, JSON.stringify(decoded));


        if (decoded.type !== 'exam_attempt_access' || !decoded.studentId || !decoded.examId || !decoded.examSessionId) {
            return next(new AppError('Invalid or malformed exam access token. Expected type "exam_attempt_access".', 401));
        }

        const student = await prisma.student.findUnique({
             where: { id: decoded.studentId, isActive: true }
        });
        if(!student){
             return next(new AppError('Student account for this exam token is inactive or not found.', 401));
        }

        req.examContext = {
            studentId: decoded.studentId,
            examId: decoded.examId,
            examSessionId: decoded.examSessionId,
        };
        req.user = student;
        req.user.type = 'student';

        const routeSessionIdParam = req.params.examSessionId || req.params.sessionId || req.params.attemptId;
        if (routeSessionIdParam) {
            const attempt = req.params.attemptId ? await prisma.examAttempt.findUnique({where: {id: parseInt(req.params.attemptId)}, select: {examSessionId:true}}) : null;
            const sessionContextId = attempt ? attempt.examSessionId : (req.params.examSessionId || req.params.sessionId);

            if (sessionContextId && parseInt(sessionContextId, 10) !== decoded.examSessionId) {
                console.log(`[EXAM_AUTH_LOG] Token session ID (${decoded.examSessionId}) mismatch with route session ID (${sessionContextId})`);
                return next(new AppError('Exam access token not valid for the targeted session or attempt.', 403));
            }
        }
        console.log(`[EXAM_AUTH_LOG] Exam access authenticated for studentId: ${decoded.studentId}, examSessionId: ${decoded.examSessionId}`);
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return next(new AppError('Invalid or expired exam access token.', 401));
        }
        console.error("[EXAM_AUTH_LOG] !!! UNHANDLED ERROR in authenticateExamAttemptToken:", error.message, error.stack);
        next(new AppError('Exam access authentication failed.', 500));
    }
};


// --- GENERIC AUTHORIZATION ---

export const authorize = (allowedTypesOrRoles) => {
    return (req, res, next) => {
        console.log(`[GENERIC_AUTHORIZE_LOG] >>> Entering for ${req.method} ${req.originalUrl}`);
        console.log(`[GENERIC_AUTHORIZE_LOG] Allowed: `, allowedTypesOrRoles);


        if (!req.user) {
            console.log(`[GENERIC_AUTHORIZE_LOG] No req.user in authorize. Authentication middleware might have failed or was skipped.`);
            return next(new AppError('Authentication required. Please log in.', 401));
        }
        console.log(`[GENERIC_AUTHORIZE_LOG] User type: ${req.user.type}, User role: ${req.user.role || 'N/A'}`);


        const userType = req.user.type;
        const userRole = req.user.role; // Directly from lecturer DB record or undefined for others

        const allowed = Array.isArray(allowedTypesOrRoles) ? allowedTypesOrRoles : [allowedTypesOrRoles];

        let isAuthorized = false;
        if (allowed.includes(userType)) {
            console.log(`[GENERIC_AUTHORIZE_LOG] Matched on userType: ${userType}`);
            isAuthorized = true;
        } else if (userType === 'lecturer' && userRole && allowed.includes(userRole)) {
            console.log(`[GENERIC_AUTHORIZE_LOG] Checking lecturer role condition. User role: ${userRole}, Is role in allowed? ${allowed.includes(userRole)}`);
            if (allowed.includes(userRole)) {
                 isAuthorized = true;
            }
        }
        // NEW: Explicitly handle 'applicant' type here
        else if (userType === 'applicant' && allowed.includes('applicant')) {
            console.log(`[GENERIC_AUTHORIZE_LOG] Matched on userType: applicant`);
            isAuthorized = true;
        }


        if (!isAuthorized) {
            console.log(`[GENERIC_AUTHORIZE_LOG] !!! Authorization DENIED by generic authorize. User type '${userType}', Role '${userRole}' not in [${allowed.join(', ')}]`);
            return next(new AppError('You do not have permission to perform this action.', 403));
        }
        console.log(`[GENERIC_AUTHORIZE_LOG] <<< Authorization GRANTED by generic authorize.`);
        next();
    };
};

// --- HIGHER-ORDER & SPECIFIC AUTHORIZATION HELPERS ---

export const authorizeAdminOrPermittedICTStaff = (permissionFlagField) => {
    return (req, res, next) => {
        if (!req.user) {
            return next(new AppError('Authentication required.', 401));
        }
        const isAdmin = req.user.type === 'admin';
        const isPermittedICTStaff = req.user.type === 'ictstaff' && req.user[permissionFlagField] === true;

        if (isAdmin || isPermittedICTStaff) {
            return next();
        }
        console.log(`[AUTH_DENIED] User type: ${req.user.type}, Lacks flag: ${permissionFlagField} or is not admin.`);
        return next(new AppError('You do not have permission for this operation.', 403));
    };
};

// --- DERIVED AUTHORIZERS ---
export const authorizeAdmin = authorize(['admin']);
export const authorizeHOD = authorize(['admin', 'HOD']);
export const authorizeDean = authorize(['admin', 'DEAN']);
export const authorizeLecturerOnly = authorize(['LECTURER']);
export const authorizeAnyLecturer = authorize(['admin', 'LECTURER', 'HOD', 'DEAN', 'EXAMINER']);
export const authorizeStudent = authorize(['admin', 'student']);
export const authorizeICTStaff = authorize(['admin', 'ictstaff']);

// For exam system
export const authorizeExamManager = authorizeAdminOrPermittedICTStaff('canManageExams');
export const authorizeDepartmentalExamPersonnel = authorize(['admin', 'HOD', 'DEAN', 'EXAMINER']);

// For course system
export const authorizeCourseManager = (req, res, next) => {
    if (!req.user) return next(new AppError('Authentication required.', 401));
    const isAdmin = req.user.type === 'admin';
    const isPermittedICTStaff = req.user.type === 'ictstaff' && req.user.canManageCourses === true;
    if (isAdmin || isPermittedICTStaff) return next();
    return next(new AppError('You do not have permission to manage courses.', 403));
};


// --- SPECIALIZED ROLE-BASED AUTHORIZERS (Examples) ---

export const authorizeAnalyticsViewer = (req, res, next) => {
    if (!req.user) return next(new AppError('Authentication required.', 401));
    const isAdmin = req.user.type === 'admin';
    const isPermittedICT = req.user.type === 'ictstaff' && req.user.canViewAnalytics === true;
    const isHOD = req.user.type === 'lecturer' && req.user.role === LecturerRole.HOD;
    const isDean = req.user.type === 'lecturer' && req.user.role === LecturerRole.DEAN;
    if (isAdmin || isPermittedICT || isHOD || isDean) return next();
    return next(new AppError('You do not have permission to view analytics.', 403));
};

export const authorizeScoreManager = (req, res, next) => {
    if (!req.user) return next(new AppError('Authentication required.', 401));
    const isAdmin = req.user.type === 'admin';
    const isPermittedICT = req.user.type === 'ictstaff' && req.user.canManageScores === true;
    const isLecturer = req.user.type === 'lecturer';
    if (isAdmin || isPermittedICT || isLecturer) return next();
    return next(new AppError('You do not have permission to manage scores.', 403));
};

export const authorizeResultManager = (req, res, next) => {
    if (!req.user) return next(new AppError('Authentication required.', 401));
    const isAdmin = req.user.type === 'admin';
    const isPermittedICT = req.user.type === 'ictstaff' && req.user.canManageResults === true;
    const isHOD = req.user.type === 'lecturer' && req.user.role === LecturerRole.HOD;
    if (isAdmin || isPermittedICT || isHOD) return next();
    return next(new AppError('You do not have permission to manage results.', 403));
};

export const authorizeResultViewer = (req, res, next) => {
    if (!req.user) return next(new AppError('Authentication required.', 401));
    const allowedTypes = ['admin', 'student'];
    const allowedLecturerRoles = [LecturerRole.HOD, LecturerRole.DEAN, LecturerRole.EXAMINER];

    if (allowedTypes.includes(req.user.type)) return next();
    if (req.user.type === 'lecturer' && allowedLecturerRoles.includes(req.user.role)) return next();
    if (req.user.type === 'ictstaff' && req.user.canManageResults) return next();
    // Applicant can view their *own* application status, but generally not "results"
    // in the context of academic performance, which this middleware implies.
    // If an applicant needs to view *their specific screening status or admission offer*,
    // it's best handled by a dedicated `getMyApplicationProfile` endpoint that
    // specifically checks `req.user.id` against the profile ID, not a generic `authorizeResultViewer`.
    return next(new AppError('You do not have permission to view these results.', 403));
};