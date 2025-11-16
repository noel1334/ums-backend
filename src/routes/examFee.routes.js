// src/routes/examFee.routes.js
import { Router } from 'express';
import * as ExamFeeController from '../controllers/examFee.controller.js';
import { authenticateToken, authorize } from '../middlewares/auth.middleware.js';

const router = Router();
const isAdmin = authorize(['admin', 'ictstaff']); // Staff who can manage exam finances
const isAuthorizedUser = authorize(['admin', 'ictstaff', 'student']); // Any logged-in user who can view

// A route to create or update a fee. Simple and singular.
router.post('/', authenticateToken, isAdmin, ExamFeeController.createOrUpdateExamFee);

// A route for anyone to get the fee details for a specific exam.
router.get('/exam/:examId', authenticateToken, isAuthorizedUser, ExamFeeController.getFeeForExam);

// A route to delete a fee config by its own unique ID.
router.delete('/:id', authenticateToken, isAdmin, ExamFeeController.deleteExamFee);

export default router;