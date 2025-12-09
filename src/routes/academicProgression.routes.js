import { Router } from 'express';
import * as AcademicProgressionController from '../controllers/academicProgression.controller.js';
import { authenticateToken, authorizeAdmin } from '../middlewares/auth.middleware.js'; // Only Admin

const router = Router();

// Endpoint for Admin to trigger student progression (existing)
router.post('/progress-students',
    authenticateToken,
    authorizeAdmin,
    AcademicProgressionController.progressStudents
);

// NEW/REPLACED: Endpoint for Admin to batch update students' current academic context
router.post('/batch-update-academic-context',
    authenticateToken,
    authorizeAdmin,
    AcademicProgressionController.batchUpdateStudentsAcademicContext // New controller function
);

router.post('/batch-graduate-students',
    authenticateToken,
    authorizeAdmin,
    AcademicProgressionController.batchGraduateStudents // New controller function
);

export default router;