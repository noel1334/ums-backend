import { Router } from 'express';
import * as StudentHistoryOnboardingController from '../controllers/studentHistoryOnboarding.controller.js';
import { authenticateToken, authorize } from '../middlewares/auth.middleware.js';

const router = Router();

// Only system administrators and backend ICT staff can execute raw historic student data imports
const canOnboardLegacyStudents = authorize(['admin', 'ictstaff']);

router.post(
    '/single',
    authenticateToken,
    canOnboardLegacyStudents,
    StudentHistoryOnboardingController.onboardSingleOldStudent
);

router.post(
    '/batch',
    authenticateToken,
    canOnboardLegacyStudents,
    StudentHistoryOnboardingController.batchOnboardOldStudents
);

export default router;