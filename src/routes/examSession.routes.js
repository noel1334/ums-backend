// src/routes/examSession.routes.js
import { Router } from 'express';
import * as ExamSessionController from '../controllers/examSession.controller.js';
import {
    authenticateToken,
    authorize
} from '../middlewares/auth.middleware.js';
import examAttemptRoutes from './examAttempt.routes.js';
import studentExamAssignmentRoutes from './studentExamAssignment.routes.js';

const router = Router({ mergeParams: true });
const canManageSessionsAuth = authorize(['admin', 'ictstaff', 'HOD', 'DEAN', 'EXAMINER', 'LECTURER']);

// --- EXISTING ROUTES (NO CHANGE) ---
router.post('/', authenticateToken, canManageSessionsAuth, ExamSessionController.createExamSession);
router.get('/', authenticateToken, canManageSessionsAuth, ExamSessionController.getSessionsForExam);
router.route('/:sessionId')
    .get(authenticateToken, canManageSessionsAuth, ExamSessionController.getExamSessionById)
    .put(authenticateToken, canManageSessionsAuth, ExamSessionController.updateExamSession)
    .delete(authenticateToken, canManageSessionsAuth, ExamSessionController.deleteExamSession);
router.use('/:examSessionId/attempts', examAttemptRoutes);
router.use('/:sessionId/assignments', studentExamAssignmentRoutes);

// ===================================================================
// --- NEW ROUTES TO FETCH ATTEMPTS AND RESULTS FOR ADMINS ---
// ===================================================================
router.get(
    '/:sessionId/attempts-summary', // URL for the "Attempts" page
    authenticateToken,
    canManageSessionsAuth,
    ExamSessionController.getSessionAttemptsSummary
);

router.get(
    '/:sessionId/results-summary', // URL for the "Results" page
    authenticateToken,
    canManageSessionsAuth,
    ExamSessionController.getSessionResultsSummary
);
// ===================================================================

export default router;