// src/middlewares/auth.middleware.js
import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import AppError from '../utils/AppError.js';
import prisma from '../config/prisma.js';
import { LecturerRole } from '../generated/prisma/index.js'; // Ensure this path is correct

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
        const { userId, type: tokenType } = decoded; // Use a distinct variable for token's type

        console.log(`[AUTH_MIDDLEWARE_LOG] Type from token: '${tokenType}', UserID from token: ${userId}`);

        if (!userId) { // Should be caught by JWT verify if malformed, but good check
            return next(new AppError('Invalid token: Missing user identifier.', 401));
        }

        if (tokenType === 'admin') {
            console.log(`[AUTH_MIDDLEWARE_LOG] Matched tokenType 'admin'`);
            user = await prisma.admin.findUnique({ where: { id: userId } });
        }  else if (tokenType === 'student') {
            console.log(`[AUTH_MIDDLEWARE_LOG] Matched tokenType 'student'`);
            // Use `select` instead of include and build the correct relationship
             user = await prisma.student.findUnique({
                where: { id: userId },
                select: {  // Use select instead of include and build the correct relationship
                    id: true,
                    regNo: true,
                    name: true,
                    email: true, // Added email, include any other fields directly on Student you need
                    // type: true,  // <<== REMOVE THIS LINE
                    departmentId: true,
                    programId: true,
                    currentLevelId: true,
                    studentDetails: { // keep these for your other details
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
                            applicationProfile: { // <---  ADD THIS NESTING
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
                                    bioData: {  // <--- ADD THIS NESTING AND `nationality: true`
                                        select: {
                                            id: true,
                                            nationality: true, // <---  *THE KEY CHANGE: Fetch nationality*
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
        // DO NOT handle 'applicant' or 'exam_access' tokens here. They have their own authenticators.
        // If an applicant or exam_access token reaches here, it means the wrong authenticator was used on the route.
        else {
            console.log(`[AUTH_MIDDLEWARE_LOG] !!! Unknown or unhandled tokenType in authenticateToken: '${tokenType}'`);
            return next(new AppError('Invalid token: Unrecognized user type for this access point.', 401));
        }

        if (!user) {
            console.log(`[AUTH_MIDDLEWARE_LOG] User not found in DB for token. Decoded type: ${tokenType}, ID: ${userId}`);
            return next(new AppError('The user associated with this token no longer exists or is invalid.', 401));
        }

        // Check isActive for non-admin UMS users
        if (user.hasOwnProperty('isActive') && user.isActive === false && tokenType !== 'admin') {
            console.log(`[AUTH_MIDDLEWARE_LOG] User ${userId} (type: ${tokenType}) is inactive.`);
            return next(new AppError('Your account is currently inactive. Please contact support.', 403));
        }

        req.user = user;
        req.user.type = tokenType; // Set type from token for consistent authorization checks

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

export const authenticateApplicantToken = async (req, res, next) => {
    try {
        let token;
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }
        if (!token) {
            return next(new AppError('Screening portal access token is missing.', 401));
        }

        const decoded = jwt.verify(token, config.jwtSecret);

        if (decoded.type !== 'applicant' || !decoded.userId || !decoded.jambRegNo) {
            return next(new AppError('Invalid or malformed applicant access token.', 401));
        }

        const applicantProfile = await prisma.applicationProfile.findUnique({
            where: {
                id: decoded.userId,
                jambRegNo: decoded.jambRegNo
            },
            // This include is crucial and correct for your schema
            include: {
                onlineScreeningList: {
                    select: {
                        jambApplicant: {
                            select: {
                                name: true,
                                entryMode: true,
                                jambSeasonId: true // Also include seasonId for fee lookup
                            }
                        }
                    }
                }
            }
        });

        if (!applicantProfile) {
            return next(new AppError('Applicant profile for this token not found or invalid.', 401));
        }

        // Attach the full profile with nested data to the request
        req.applicantProfile = applicantProfile;
        
        // Populate req.user for other potential uses
        req.user = {
            id: applicantProfile.id,
            jambRegNo: applicantProfile.jambRegNo,
            type: 'applicant',
            email: applicantProfile.email,
            name: applicantProfile.onlineScreeningList?.jambApplicant?.name
        };

        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return next(new AppError('Invalid or expired applicant access token.', 401));
        }
        console.error("[APPLICANT_AUTH_LOG] Error in authenticateApplicantToken:", error);
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


        // Ensure the token type matches what you set during exam login (e.g., 'exam_access')
        if (decoded.type !== 'exam_access' || !decoded.studentId || !decoded.examId || !decoded.examSessionId) {
            return next(new AppError('Invalid or malformed exam access token. Expected type "exam_access".', 401));
        }

        const student = await prisma.student.findUnique({
             where: { id: decoded.studentId, isActive: true } // Ensure student is still active
        });
        if(!student){
             return next(new AppError('Student account for this exam token is inactive or not found.', 401));
        }

        req.examContext = { // Attach exam-specific context to the request
            studentId: decoded.studentId,
            examId: decoded.examId,
            examSessionId: decoded.examSessionId,
        };
        // For convenience, also set req.user if subsequent general authorize middlewares might be used
        // (though for exam attempts, specific checks against req.examContext might be better)
        req.user = student;
        req.user.type = 'student'; // The actor is a student

        // Optional: Validate token's session ID against route's session ID if applicable
        const routeSessionIdParam = req.params.examSessionId || req.params.sessionId || req.params.attemptId; // AttemptId might be in route
        if (routeSessionIdParam) { // If route implies a session context
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
        console.error("[EXAM_AUTH_LOG] Error in authenticateExamAttemptToken:", error.message, error.stack);
        next(new AppError('Exam access authentication failed.', 500));
    }
};


// --- GENERIC AUTHORIZATION ---

export const authorize = (allowedTypesOrRoles) => {
    return (req, res, next) => {
        console.log(`[GENERIC_AUTHORIZE_LOG] >>> Entering for ${req.method} ${req.originalUrl}`);
        console.log(`[GENERIC_AUTHORIZE_LOG] Allowed: `, allowedTypesOrRoles);


        if (!req.user) {
            // This should ideally be caught by an authentication middleware before this.
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
        // Add specific check for 'applicant' type if your generic authorize needs to handle it
        // else if (userType === 'applicant' && allowed.includes('applicant')) {
        //     isAuthorized = true;
        // }


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
export const authorizeHOD = authorize(['admin', 'HOD']); // Assumes HOD is a role on Lecturer user object
export const authorizeDean = authorize(['admin', 'DEAN']); // Assumes DEAN is a role on Lecturer
export const authorizeLecturerOnly = authorize(['LECTURER']); // For only base lecturers
export const authorizeAnyLecturer = authorize(['admin', 'LECTURER', 'HOD', 'DEAN', 'EXAMINER']);
export const authorizeStudent = authorize(['admin', 'student']);
export const authorizeICTStaff = authorize(['admin', 'ictstaff']); // For general ICT staff access

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
    const isLecturer = req.user.type === 'lecturer'; // Further checks in service layer for specific course
    if (isAdmin || isPermittedICT || isLecturer) return next();
    return next(new AppError('You do not have permission to manage scores.', 403));
};

export const authorizeResultManager = (req, res, next) => {
    if (!req.user) return next(new AppError('Authentication required.', 401));
    const isAdmin = req.user.type === 'admin';
    const isPermittedICT = req.user.type === 'ictstaff' && req.user.canManageResults === true;
    const isHOD = req.user.type === 'lecturer' && req.user.role === 'HOD'; // Prisma enum uses uppercase 'HOD'
    if (isAdmin || isPermittedICT || isHOD) return next();
    return next(new AppError('You do not have permission to manage results.', 403));
};

export const authorizeResultViewer = (req, res, next) => {
    if (!req.user) return next(new AppError('Authentication required.', 401));
    const allowedTypes = ['admin', 'student']; // Student can view their own
    const allowedLecturerRoles = ['HOD', 'DEAN', 'EXAMINER']; // Specific lecturer roles

    if (allowedTypes.includes(req.user.type)) return next();
    if (req.user.type === 'lecturer' && allowedLecturerRoles.includes(req.user.role)) return next();
    if (req.user.type === 'ictstaff' && req.user.canManageResults) return next(); // If ICT can view results
    if (req.user.type === 'applicant' && req.applicantProfile?.applicationStatus === ApplicationStatus.ADMITTED) {
        // Example: An admitted applicant might view some preliminary result/status if your system allows
        // This is highly specific and usually not needed for general result viewing.
        // For now, applicants typically don't view "Results" in the same way as enrolled students.
    }
    return next(new AppError('You do not have permission to view these results.', 403));
};