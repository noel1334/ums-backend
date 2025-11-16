import { Router } from 'express';
import * as ExamSessionController from '../controllers/examSession.controller.js';
import {
    authenticateToken,
    authorize // For broad role checks, service layer does finer grain
} from '../middlewares/auth.middleware.js';
import examAttemptRoutes from './examAttempt.routes.js';                // Import for nesting
import studentExamAssignmentRoutes from './studentExamAssignment.routes.js'; 

// This router is intended to be nested under /exams/:examId
const router = Router({ mergeParams: true });

// Use the same broad authorization, service layer will check specifics for fetching
const canManageSessionsAuth = authorize(['admin', 'ictstaff', 'HOD', 'DEAN', 'EXAMINER', 'LECTURER']);

router.post('/', authenticateToken, canManageSessionsAuth, ExamSessionController.createExamSession);
router.get('/', authenticateToken, canManageSessionsAuth, ExamSessionController.getSessionsForExam); 

router.route('/:sessionId')
    .get(authenticateToken, canManageSessionsAuth, ExamSessionController.getExamSessionById) 
    .put(authenticateToken, canManageSessionsAuth, ExamSessionController.updateExamSession)
    .delete(authenticateToken, canManageSessionsAuth, ExamSessionController.deleteExamSession);

// Nest student assignments under a specific session
router.use('/:examSessionId/attempts', examAttemptRoutes);
router.use('/:sessionId/assignments', studentExamAssignmentRoutes);


export default router;