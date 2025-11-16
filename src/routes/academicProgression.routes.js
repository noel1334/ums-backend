// src/routes/academicProgression.routes.js
import { Router } from 'express';
import * as AcademicProgressionController from '../controllers/academicProgression.controller.js';
import { authenticateToken, authorizeAdmin } from '../middlewares/auth.middleware.js'; // Only Admin

const router = Router();

// Endpoint for Admin to trigger student progression
router.post('/progress-students',
    authenticateToken,
    authorizeAdmin,
    AcademicProgressionController.progressStudents
);

export default router;