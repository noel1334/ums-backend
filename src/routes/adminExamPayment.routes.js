import { Router } from 'express';
import * as AdminController from '../controllers/adminExamPayment.controller.js';
import { authenticateToken, authorize } from '../middlewares/auth.middleware.js';

const router = Router();

// Middleware to protect routes for Admins only
const isAdmin = authorize(['admin', 'ictstaff']);

/**
 * @route GET /api/v1/admin/exam-payments
 * @desc Admin gets a list of all exam payments.
 * @access Private (Admin)
 */
router.get('/',
    authenticateToken,
    isAdmin,
    AdminController.getAllPayments
);

/**
 * @route DELETE /api/v1/admin/exam-payments/:paymentId
 * @desc Admin deletes a specific exam payment record.
 * @access Private (Admin)
 */
router.delete('/:paymentId',
    authenticateToken,
    isAdmin,
    AdminController.deletePayment
);

router.get('/stats',
    authenticateToken,
    isAdmin,
    AdminController.getPaymentStats
);
export default router;