// src/routes/level.routes.js

import { Router } from 'express';
import * as LevelController from '../controllers/level.controller.js';
import { authenticateToken, authorizeAdmin, authorize } from '../middlewares/auth.middleware.js';
import { LecturerRole } from '../generated/prisma/index.js'; // Import LecturerRole enum

const router = Router();

// Corrected: Use lowercase 'student', 'ictstaff', and actual enum values for LecturerRole
const canViewAllRoles = authorize([
    'admin',
    'ictstaff',
    LecturerRole.HOD,
    LecturerRole.EXAMINER,
    LecturerRole.LECTURER,
    'student' // <-- FIXED: Changed from 'STUDENT' to 'student'
]);
const canManage = authorizeAdmin; // Already correct

router.route('/')
    .post(authenticateToken, canManage, LevelController.createLevel)
    .get(authenticateToken, canViewAllRoles, LevelController.getAllLevels); // <-- Uses corrected canViewAllRoles

router.route('/:id')
    .get(authenticateToken, canViewAllRoles, LevelController.getLevelById) // <-- Uses corrected canViewAllRoles
    .put(authenticateToken, canManage, LevelController.updateLevel)
    .delete(authenticateToken, canManage, LevelController.deleteLevel);

export default router;