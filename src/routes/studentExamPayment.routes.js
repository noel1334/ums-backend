// src/routes/studentExamPayment.routes.js

import { Router } from 'express';
import * as StudentExamPaymentController from '../controllers/studentExamPayment.controller.js';
import { authenticateToken, authorize } from '../middlewares/auth.middleware.js';

const router = Router();

const isStudent = authorize(['student']);

/**
 * @route GET /api/v1/student-exam-payments/my-status/exam/:examId
 * @desc Student gets their payment status for a specific exam. This is used by the frontend
 *       to determine if the "Pay Now" button should be shown.
 * @access Private (Student)
 */
router.get('/my-status/exam/:examId',
    authenticateToken,
    isStudent,
    StudentExamPaymentController.getMyPaymentStatusForExam
);

/**
 * @route POST /api/v1/student-exam-payments/verify-paystack
 * @desc Receives a reference from the frontend after a Paystack transaction,
 *       verifies it with Paystack, and creates the payment record.
 * @access Private (Student)
 */
router.post('/verify-paystack',
    authenticateToken,
    isStudent,
    StudentExamPaymentController.verifyPaystackPayment
);

/**
 * @route POST /api/v1/student-exam-payments/verify-flutterwave
 * @desc Receives transaction details from the frontend after a Flutterwave transaction,
 *       verifies them, and creates the payment record.
 * @access Private (Student)
 */
router.post('/verify-flutterwave',
    authenticateToken,
    isStudent,
    StudentExamPaymentController.verifyFlutterwavePayment
);

export default router;