// src/routes/staffCourse.routes.js (UPDATE THIS FILE)

import { Router } from 'express';
import * as StaffCourseController from '../controllers/staffCourse.controller.js';
import {
    authenticateToken,
    authorize,
    authorizeHOD,
    authorizeAnyLecturer // Assuming this covers LECTURER, HOD, DEAN, EXAMINER
} from '../middlewares/auth.middleware.js'; // Adjust path if necessary
import AppError from '../utils/AppError.js'; // Ensure AppError is imported if used in middleware

const router = Router();

// Admin or HOD can create, update, delete assignments.
// Service layer further restricts HOD to their department.
router.route('/')
    .post(authenticateToken, authorizeHOD, StaffCourseController.assignCourseToLecturer)
    .get(authenticateToken, authorizeAnyLecturer, StaffCourseController.getAllStaffCourseAssignments);

// --- NEW ROUTE: Get courses assigned to the authenticated lecturer ---
router.get(
    '/me/assigned-courses',
    authenticateToken,
    authorize(['lecturer', 'HOD', 'DEAN', 'EXAMINER']), // Only actual lecturers (of any role) can fetch their own
    StaffCourseController.getMyAssignedCourses
);
// --- END NEW ROUTE ---

router.route('/:id')
    .get(authenticateToken, authorizeAnyLecturer, StaffCourseController.getStaffCourseAssignmentById)
    .put(authenticateToken, authorizeHOD, StaffCourseController.updateStaffCourseAssignment)
    .delete(authenticateToken, authorizeHOD, StaffCourseController.removeCourseAssignment);

export default router;