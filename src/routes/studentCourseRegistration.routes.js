import { Router } from 'express';
import * as RegistrationController from '../controllers/studentCourseRegistration.controller.js';
import {
    authenticateToken,
    authorize, // Generic authorize middleware (accepts array of roles)
} from '../middlewares/auth.middleware.js'; // Adjust path if necessary
import AppError from '../utils/AppError.js'; // Ensure AppError is imported if used directly in middleware

const router = Router();

// Define common authorized roles for staff and lecturer management
// Granular permissions (like ICT's canManageCourseRegistration, LecturerRole.HOD/EXAMINER)
// are handled within the service layer functions for better reusability and fine-grained control.
const staffManagementRoles = ['admin', 'ictstaff', 'lecturer'];
const canManageRegistrations = authorize(['admin', 'ictstaff', 'HOD', 'DEAN', 'LECTURER']);


// Route to Register Courses (by student themselves OR by staff for a student)
// Frontend must send studentId, courseId, semesterId, levelId, seasonId in payload.
router.post(
    '/',
    authenticateToken,
    authorize(['admin', 'student', 'ictstaff', 'lecturer']), // Allow lecturers to register (HOD/Examiner check in service)
    (req, res, next) => { // Additional check for ICT Staff specific permission
        if (req.user.type === 'ictstaff' && !req.user.canManageCourseRegistration) {
            return next(new AppError('ICT Staff not permitted for course registration.', 403));
        }
        next();
    },
    RegistrationController.registerStudentForCourse
);

router.get('/students-by-course',
    authenticateToken,
    canManageRegistrations,
    RegistrationController.getRegisteredStudents // This handler will now be correctly reached
);

// Route to Get All Registrations (for staff viewing, or student viewing their own)
router.get(
    '/',
    authenticateToken,
    authorize(['admin', 'student', 'lecturer', 'ictstaff']), // Allow all relevant roles to view
    (req, res, next) => { // Additional check for ICT Staff specific permission
        if (req.user.type === 'ictstaff' && !req.user.canManageCourseRegistration) {
            return next(new AppError('ICT Staff not permitted to view all registrations.', 403));
        }
        next();
    },
    RegistrationController.getAllRegistrations
);

// Route for Student to Get Their Own Registered Courses
router.get(
    '/me',
    authenticateToken,
    authorize(['student']), // Only a student can use this route
    RegistrationController.getMyRegisteredCourses
);

// Route for Student to Comprehensively Update Their Own Registrations for a Period
// This route is specifically for a student updating their own *collection* of registrations.
router.put(
    '/me', // PUT to /me to update the authenticated student's registrations for a period
    authenticateToken,
    authorize(['admin', 'student', 'ictstaff']), // Admin/ICT can also use this on behalf of themselves if authenticated as student, but mainly for self-student
    RegistrationController.updateMyRegistrationsForPeriod // Renamed controller
);


// Route to Get Course Registration Completion Count (Admin/ICT specific)
router.get(
    '/completion-count',
    authenticateToken,
    authorize(['admin', 'ictstaff']), // Assuming only Admin/ICT can see counts
    (req, res, next) => { // Additional check for ICT Staff specific permission
        if (req.user.type === 'ictstaff' && !req.user.canManageCourseRegistration) {
            return next(new AppError('ICT Staff not permitted for course registration counts.', 403));
        }
        next();
    },
    RegistrationController.getRegistrationCompletionCount
);

// Route to Get a Single Registration by ID
router.get(
    '/:id',
    authenticateToken,
    authorize(['admin', 'student', 'lecturer', 'ictstaff']), // Allow all relevant roles to view single registration
    RegistrationController.getRegistrationById
);

// Route to Update a Single Registration (e.g., Admin changing one course)
// This PUT /:id route is for updating *individual* registration records.
router.put(
    '/:id',
    authenticateToken,
    authorize(['admin', 'ictstaff', 'lecturer']), // Allow relevant staff roles to update individual
    (req, res, next) => { // Additional check for ICT Staff specific permission
        if (req.user.type === 'ictstaff' && !req.user.canManageCourseRegistration) {
            return next(new AppError('ICT Staff not permitted for course registration management.', 403));
        }
        next();
    },
    RegistrationController.updateRegistration
);

// Route to Delete Multiple Registrations (Batch Delete)
router.delete(
    '/batch', // Endpoint for deleting multiple registrations
    authenticateToken,
    authorize(['admin', 'student', 'ictstaff', 'lecturer']), // Allow relevant roles for batch delete
    (req, res, next) => { // Additional check for ICT Staff specific permission
        if (req.user.type === 'ictstaff' && !req.user.canManageCourseRegistration) {
            return next(new AppError('ICT Staff not permitted for course registration management.', 403));
        }
        next();
    },
    RegistrationController.deleteMultipleRegistrations
);

// Route to Delete a Single Registration
router.delete(
    '/:id',
    authenticateToken,
    authorize(['admin', 'student', 'ictstaff', 'lecturer']), // Allow relevant roles for individual delete
    (req, res, next) => { // Additional check for ICT Staff specific permission
        if (req.user.type === 'ictstaff' && !req.user.canManageCourseRegistration) {
            return next(new AppError('ICT Staff not permitted for course registration management.', 403));
        }
        next();
    },
    RegistrationController.deleteRegistration
);

// --- NEW ROUTE: Comprehensive Update of a Student's Registrations for a Period by Staff ---
// This route allows staff to update a student's entire course selection for a specific period.
router.put(
    '/:studentId/period-registrations', // E.g., PUT /api/v1/student-registrations/123/period-registrations
    authenticateToken,
    authorize(staffManagementRoles), // Only staff (Admin, ICT, Lecturer) can use this for other students
    RegistrationController.updateStudentRegistrationsByStaff
);


export default router;