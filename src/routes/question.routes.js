import { Router } from 'express';
import * as QuestionController from '../controllers/question.controller.js';
import {
    authenticateToken,
    authorize
} from '../middlewares/auth.middleware.js';

const router = Router({ mergeParams: true }); // mergeParams allows access to :examId

const canManageQuestionsAuth = authorize(['admin', 'ictstaff', 'HOD', 'DEAN', 'EXAMINER', 'LECTURER']);

// --- Routes for managing questions within a specific exam ---

// Create a single question for a specific exam
router.post('/single', authenticateToken, canManageQuestionsAuth, QuestionController.createQuestion);

// Create multiple questions for a specific exam
router.post('/multiple', authenticateToken, canManageQuestionsAuth, QuestionController.createMultipleQuestions);

// Get all questions for a specific exam
router.get('/', authenticateToken, canManageQuestionsAuth, QuestionController.getQuestionsForExam);

// Update multiple questions for a specific exam
// This will expect an array of { id: questionId, data: { ...updateFields } } in the body
router.put('/multiple', authenticateToken, canManageQuestionsAuth, QuestionController.updateMultipleQuestions);


// --- Routes for a specific question by its own ID ---
// These are nested under /exams/:examId/questions/:questionId
router.route('/:questionId')
    .get(authenticateToken, canManageQuestionsAuth, QuestionController.getQuestionById)
    .put(authenticateToken, canManageQuestionsAuth, QuestionController.updateQuestion)
    .delete(authenticateToken, canManageQuestionsAuth, QuestionController.deleteQuestion);

export default router;