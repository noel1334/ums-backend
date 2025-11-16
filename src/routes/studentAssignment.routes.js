// src/routes/studentAssignment.routes.js
import { Router } from 'express';
import * as StudentAssignmentController from '../controllers/studentAssignment.controller.js';
import { authenticateToken, authorize } from '../middlewares/auth.middleware.js';

const router = Router();

// GET /api/v1/student-assignments/me
// Allows an authenticated student to view all their own exam assignments.
router.get('/me',
    authenticateToken,
    authorize(['student']), // Only students can access their own 'me' endpoint directly
    StudentAssignmentController.getMyAssignments
);

// GET /api/v1/student-assignments/:studentId
// Allows admins/staff to view all exam assignments for a specific student.
router.get('/:studentId',
    authenticateToken,
    authorize(['admin', 'ictstaff', 'HOD', 'DEAN', 'EXAMINER', 'LECTURER']), // Authorized staff roles
    StudentAssignmentController.getStudentAssignments
);

export default router;