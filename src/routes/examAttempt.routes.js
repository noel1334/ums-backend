// src/routes/examAttempt.routes.js
import { Router } from 'express';
import * as ExamAttemptController from '../controllers/examAttempt.controller.js';
import {
    authenticateToken,
    authorize,
} from '../middlewares/auth.middleware.js';

const router = Router({ mergeParams: true });

// Route to start (or resume) an exam attempt.
router.post('/start',
    authenticateToken,
    authorize(['student']),
    ExamAttemptController.startExamAttempt
);

// Route to save an answer for a specific question within an attempt.
router.patch('/:attemptId/answers',
    authenticateToken,
    authorize(['student']),
    ExamAttemptController.saveStudentAnswer
);

// Route to finalize and submit the entire exam attempt.
router.post('/:attemptId/submit',
    authenticateToken,
    authorize(['student']),
    ExamAttemptController.submitExamAttempt
);

// Route to get the results of a completed attempt.
router.get('/:attemptId/result',
    authenticateToken,
    authorize(['student', 'admin', 'ictstaff', 'lecturer', 'HOD', 'DEAN', 'EXAMINER']),
    ExamAttemptController.getExamAttemptResult
);

router.get('/:attemptId/result',
    authenticateToken,
    authorize(['student', 'admin', 'ictstaff', 'lecturer', 'HOD', 'DEAN', 'EXAMINER']),
    ExamAttemptController.getExamAttemptResult
);

router.delete('/:attemptId',
    authenticateToken,
    authorize(['admin', 'ictstaff']), // Only admins/ICT staff can delete
    ExamAttemptController.deleteExamAttempt
);
export default router;