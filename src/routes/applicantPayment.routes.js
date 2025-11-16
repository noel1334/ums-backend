// src/routes/applicantPayment.routes.js
import { Router } from 'express';
import {
    authenticateToken,
    authorizeAdmin,
    authenticateApplicantToken, 
    authorize
} from '../middlewares/auth.middleware.js';
import {
    // CHANGE THESE IMPORT NAMES:
    createStripePaymentSession,      // Changed from createStripeScreeningFeeSession
    completeStripePayment,           // Changed from completeStripeScreeningFeePayment
    verifyPaystackAndCreatePayment,
    verifyFlutterwaveAndCreatePayment,
    deleteIncompletePayment,
     getAllApplicantPayments as getAllApplicantPaymentsController
} from '../controllers/applicantPayment.controller.js';

import { getApplicantPaymentById as getApplicantPaymentByIdController } from '../controllers/applicantPayment.controller.js';
const router = Router();
const authorizeAdminOrICT = authorize(['admin', 'ictstaff']); 
router.get(
    '/',
    authenticateToken,
    authorizeAdminOrICT,
    getAllApplicantPaymentsController
);
router.get(
    '/:id', // This route matches e.g., /api/v1/applicant-payments/123
    authenticateToken,
    authorizeAdminOrICT,
    getApplicantPaymentByIdController
);
router.post('/create-stripe-session', authenticateApplicantToken, createStripePaymentSession);
router.post('/complete-stripe-payment', authenticateApplicantToken, completeStripePayment);
router.delete('/delete-incomplete/:reference', authenticateApplicantToken, deleteIncompletePayment);

// Paystack and Flutterwave use a one-step verification process from the frontend.
router.post('/verify-paystack', authenticateApplicantToken, verifyPaystackAndCreatePayment);
router.post('/verify-flutterwave', authenticateApplicantToken,verifyFlutterwaveAndCreatePayment);

export default router;