// src/routes/hostelBooking.routes.js
import { Router } from 'express';
import * as HostelBookingController from '../controllers/hostelBooking.controller.js';
import { authenticateToken, authorize } from '../middlewares/auth.middleware.js';

const router = Router();

// --- Student Prepares Hostel Booking for Payment ---
router.post('/prepare-payment', authenticateToken, authorize(['student']), HostelBookingController.validateHostelBookingForPayment);

// --- Student Views Their Bookings ---
router.get('/my-bookings', authenticateToken, authorize(['student']), HostelBookingController.getMyHostelBookings);

// --- NEW ROUTE: Get a student's roommates (MUST BE BEFORE /:id) ---
router.get('/my-roommates', authenticateToken, authorize(['student']), HostelBookingController.getRoommatesController); // <<< MOVED UP >>>

// --- Student or Admin Cancels Booking (for existing PAID or PENDING bookings) ---
router.patch('/cancel/:id', authenticateToken, authorize(['student', 'admin']), HostelBookingController.cancelHostelBooking);

// --- Admin Views All Bookings (with Filters) ---
router.get('/', authenticateToken, authorize(['admin', 'ictstaff']), HostelBookingController.getAllHostelBookings);

// --- Admin or Student (self) Views a Specific Booking ---
router.get('/:id', authenticateToken, authorize(['admin', 'student']), HostelBookingController.getHostelBookingById); // <<< generic :id route now comes after specific ones >>>

// --- Admin Updates Status of a Booking ---
router.patch('/:id/status', authenticateToken, authorize(['admin', 'ictstaff']), HostelBookingController.updateHostelBookingStatus);

// --- Stripe Payment Routes ---
router.post('/create-stripe-session', authenticateToken, authorize(['student']), HostelBookingController.createHostelBookingStripeSession);
router.post('/complete-stripe-payment', authenticateToken, HostelBookingController.completeHostelBookingStripePayment);

// --- Paystack and Flutterwave Payment Routes ---
router.post('/verify-paystack', authenticateToken, authorize(['student']), HostelBookingController.verifyPaystackHostelBookingPayment);
router.post('/verify-flutterwave', authenticateToken, authorize(['student']), HostelBookingController.verifyFlutterwaveHostelBookingPayment);
router.delete(
    '/payments/pending/:id', // Expects the paymentReceiptId as a parameter
    authenticateToken,
    authorize(['admin', 'ictstaff']), // Only admin/ictstaff should be able to delete
    HostelBookingController.deletePendingPaymentRecordController
);

export default router;