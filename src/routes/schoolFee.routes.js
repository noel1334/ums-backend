// src/routes/schoolFee.routes.js

import { Router } from 'express';
import {
    authenticateToken,
    authorize, // We only need the generic authorize middleware
} from '../middlewares/auth.middleware.js';
import {
    getAllSchoolFeePayments,
    getSchoolFeePaymentById,
    createSchoolFeeStripeSession,
    completeSchoolFeeStripePayment,
    verifyPaystackSchoolFeePayment,
    verifyFlutterwaveSchoolFeePayment,
    deleteIncompleteSchoolFeePayment,
    handleStripeCancellationRequest,
    getMySchoolFeeRecordsController,
    deletePendingSchoolFeeRecordController,
} from '../controllers/schoolFee.controller.js';

const router = Router();

// --- Define specific authorization groups for clarity ---
const authorizeAdminOrICT = authorize(['admin', 'ictstaff']);
const authorizeStudent = authorize(['student']); // <-- Authorize rule for students

// ==========================================================
// --- THIS IS THE ROUTE THAT WAS CAUSING THE ERROR ---
// Get the LOGGED-IN student's own records.
// It is now correctly configured to only require authentication and then
// check if the user's type is 'student'.
router.get(
    '/my-records',
    authenticateToken,
    authorizeStudent, // FIX: Apply the rule that ONLY allows students
    getMySchoolFeeRecordsController
);
// ==========================================================


// --- Admin/ICT Staff Routes ---
router.get(
    '/',
    authenticateToken,
    authorizeAdminOrICT, // Correct: Only admins/ICT can see all payments
    getAllSchoolFeePayments
);

router.get(
    '/:id',
    authenticateToken,
    authorizeAdminOrICT, // Correct: Only admins/ICT can look up a payment by ID
    getSchoolFeePaymentById
);

// --- Payment Processing Routes (Accessible by any authenticated user) ---
router.post('/create-stripe-session', authenticateToken, createSchoolFeeStripeSession);
router.post('/complete-stripe-payment', authenticateToken, completeSchoolFeeStripePayment);
router.post('/handle-stripe-cancellation', authenticateToken, handleStripeCancellationRequest);
router.post('/verify-paystack', authenticateToken, verifyPaystackSchoolFeePayment);
router.post('/verify-flutterwave', authenticateToken, verifyFlutterwaveSchoolFeePayment);
router.delete('/delete-incomplete/:reference', authenticateToken, deleteIncompleteSchoolFeePayment);
router.delete(
    '/pending/:id', // e.g., /api/v1/school-fee/pending/123
    authenticateToken,
    authorizeAdminOrICT, // Only admin/ictstaff should be able to delete
    deletePendingSchoolFeeRecordController
);

export default router;