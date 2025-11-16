// src/routes/semester.routes.js

import { Router } from 'express';
import * as SemesterController from '../controllers/semester.controller.js';
import { authenticateToken, authorizeAdmin, authorize } from '../middlewares/auth.middleware.js';
import { LecturerRole } from '../generated/prisma/index.js'; // Import LecturerRole enum

const router = Router();

// Reusable authorization constant for viewing semesters
const canViewAllRoles = authorize([
    'admin',
    LecturerRole.HOD,
    LecturerRole.EXAMINER,
    LecturerRole.LECTURER,
    'student',
    'ictstaff'
]);
// Reusable authorization constant for managing semesters (admin only)
const canManage = authorizeAdmin;

router.route('/')
    .post(authenticateToken, canManage, SemesterController.createSemester) // <-- This line should now work
    .get(authenticateToken, canViewAllRoles, SemesterController.getAllSemesters);

router.route('/:id')
    .get(authenticateToken, canViewAllRoles, SemesterController.getSemesterById)
    .put(authenticateToken, canManage, SemesterController.updateSemester)
    .delete(authenticateToken, canManage, SemesterController.deleteSemester);

export default router;