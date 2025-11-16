// src/routes/examAttempt.routes.js
import { Router } from 'express';
import * as ExamAttemptController from '../controllers/examAttempt.controller.js';
import {
    authenticateToken,
    authorize, // For student-only routes
    // Add other specific authorizations if needed for viewing results by lecturers/admins
    authorizeAdminOrPermittedICTStaff,
} from '../middlewares/auth.middleware.js';
import { authenticateExamAttemptToken } from '../middlewares/auth.middleware.js';
const router = Router({ mergeParams: true }); // mergeParams if nested under sessions
router.use(authenticateExamAttemptToken);
const canManageExams = authorizeAdminOrPermittedICTStaff('canManageExams');
router.post('/start', // Assuming examSessionId is in body or already in params from parent router
    authenticateToken,
    authorize(['student']),
    ExamAttemptController.startExamAttempt
);

router.patch('/:attemptId/answers',
    authenticateToken,
    authorize(['student']),
    ExamAttemptController.saveStudentAnswer
);

router.post('/:attemptId/submit',
    authenticateToken,
    authorize(['student']),
    ExamAttemptController.submitExamAttempt
);
router.get('/:attemptId/result',
    authenticateToken,
    authorize(['student', 'admin', 'ictstaff', 'lecturer', 'HOD', 'DEAN', 'EXAMINER']), // Broad, service handles specifics
    ExamAttemptController.getExamAttemptResult
);

// Future: Admin/Lecturer routes to list attempts for an exam/session
// router.get('/', authenticateToken, canManageExams, ExamAttemptController.listAttemptsForSessionOrExam);


export default router;