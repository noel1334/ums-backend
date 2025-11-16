// src/routes/department.routes.js

import { Router } from 'express';
import * as DepartmentController from '../controllers/department.controller.js';
import { authenticateToken, authorizeAdmin, authorize } from '../middlewares/auth.middleware.js';
import { LecturerRole } from '../generated/prisma/index.js'; // Import the enum

const router = Router();

// CORRECTED: Use lowercase roles and the LecturerRole enum for consistency and accuracy.
const canView = authorize([
    'admin',
    'ictstaff',
    'student',
    LecturerRole.HOD,
    LecturerRole.EXAMINER,
    LecturerRole.LECTURER 
]);

const canManage = authorizeAdmin;

router.route('/')
    .post(authenticateToken, canManage, DepartmentController.createDepartment)
    .get(authenticateToken, canView, DepartmentController.getAllDepartments); // Now uses the corrected 'canView'

router.route('/:id')
    .get(authenticateToken, canView, DepartmentController.getDepartmentById)
    .put(authenticateToken, canManage, DepartmentController.updateDepartment)
    .delete(authenticateToken, canManage, DepartmentController.deleteDepartment);

export default router;