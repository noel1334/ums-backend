// src/routes/payment.routes.js
import { Router } from 'express';
import * as PaymentController from '../controllers/payment.controller.js'; // Create this
import { authenticateToken, authorizeAdmin, authorize } from '../middlewares/auth.middleware.js';

const router = Router();

// Endpoint for recording a hostel payment
// Who can call this? Admin, or student after successful payment gateway redirect, or webhook.
router.post(
    '/hostel',
    authenticateToken,
    // If student calls this, it's more like a confirmation. If admin, it's manual entry.
    authorize(['admin', 'student']), // Or just admin if student payment is via webhook only
    PaymentController.recordHostelPayment // Ensure this controller exists
);

router.post(
    '/school-fee', // New route for school fee payments
    authenticateToken,
    authorize(['admin', 'student']), // Admin or Student (confirming their payment)
    PaymentController.recordSchoolFeePayment
);


export default router;