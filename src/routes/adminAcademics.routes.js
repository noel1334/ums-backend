// src/routes/adminAcademics.routes.js (NEW FILE)

import { Router } from 'express';
import * as StudentAcademicsController from '../controllers/studentAcademics.controller.js'; // The new controller
import {
    authenticateToken,
    authorize,
    authorizeAdminOrPermittedICTStaff
} from '../middlewares/auth.middleware.js'; // Adjust path if necessary
import { LecturerRole } from '../generated/prisma/index.js'; // For HOD/Examiner roles

const router = Router();

const canAccessAdminRegistrableCourses = authorize([
    'admin',
    'ictstaff',
    LecturerRole.HOD,
    LecturerRole.EXAMINER
]);

// Route to get registrable courses for a specific student (for admin-like roles)
router.get(
    '/registrable-courses',
    authenticateToken,
    canAccessAdminRegistrableCourses,
    // Add specific ICT staff permission check if 'ictstaff' is too broad for the authorize middleware
    (req, res, next) => {
        if (req.user.type === 'ictstaff' && !req.user.canManageCourseRegistration) {
            return next(new AppError('ICT Staff not permitted to access this resource.', 403));
        }
        next();
    },
    StudentAcademicsController.getRegistrableCoursesByAdmin
);

export default router;