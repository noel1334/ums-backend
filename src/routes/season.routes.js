// src/routes/season.routes.js

import { Router } from 'express';
import * as SeasonController from '../controllers/season.controller.js';
import { authenticateToken, authorizeAdmin, authorize } from '../middlewares/auth.middleware.js';
import { LecturerRole } from '../generated/prisma/index.js'; // Import the enum

const router = Router();

// CORRECTED: Use a consistent, correct authorization constant.
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
    .post(authenticateToken, canManage, SeasonController.createSeason)
    .get(
        authenticateToken,
        canView, // CORRECTED: Added authorization middleware
        SeasonController.getAllSeasons
    );   

router.route('/:id')
    .get(authenticateToken, canView, SeasonController.getSeasonById)
    .put(authenticateToken, canManage, SeasonController.updateSeason)
    .delete(authenticateToken, canManage, SeasonController.deleteSeason);

router.patch('/:id/status',
    authenticateToken,
    canManage, 
    SeasonController.updateSeasonStatus
);

export default router;