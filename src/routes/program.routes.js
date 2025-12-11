// src/routes/program.routes.js

import { Router } from 'express';
import * as ProgramController from '../controllers/program.controller.js';
import { authenticateToken, authorizeAdmin, authorize } from '../middlewares/auth.middleware.js';
import { LecturerRole } from '../generated/prisma/index.js'; // Import the enum

const router = Router();

// CORRECTED: Use lowercase roles and the LecturerRole enum.
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
    .post(authenticateToken, canManage, ProgramController.createProgram)
    .get( ProgramController.getAllPrograms); // Now uses the corrected 'canView'

router.route('/:id')
    .get(authenticateToken, canView, ProgramController.getProgramById)
    .put(authenticateToken, canManage, ProgramController.updateProgram)
    .delete(authenticateToken, canManage, ProgramController.deleteProgram);

export default router;