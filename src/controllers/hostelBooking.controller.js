// src/controllers/hostelBooking.controller.js
import * as HostelBookingService from '../services/hostelBooking.service.js';
import AppError from '../utils/AppError.js';

// --- MODIFIED/RENAMED: This controller now calls the validation and preparation service.
// It returns booking data for payment, but does NOT create a booking record yet.
export const validateHostelBookingForPayment = async (req, res, next) => {
    try {
        const preparedBookingData = await HostelBookingService.validateAndPrepareHostelBooking(req.body, req.user);
        res.status(200).json({ status: 'success', message: 'Hostel booking prepared for payment.', data: { booking: preparedBookingData } });
    } catch (error) { next(error); }
};

export const getHostelBookingById = async (req, res, next) => {
    try {
        const booking = await HostelBookingService.getHostelBookingById(req.params.id, req.user);
        res.status(200).json({ status: 'success', data: { booking } });
    } catch (error) { next(error); }
};

export const getAllHostelBookings = async (req, res, next) => { // Admin/ICT view
    try {
        const result = await HostelBookingService.getAllHostelBookings(req.query, req.user);
        res.status(200).json({ status: 'success', data: result });
    } catch (error) { next(error); }
};

export const getMyHostelBookings = async (req, res, next) => { // Student view
    try {
        const result = await HostelBookingService.getMyHostelBookings(req.user, req.query);
        res.status(200).json({ status: 'success', data: result });
    } catch (error) { next(error); }
};

export const updateHostelBookingStatus = async (req, res, next) => { // Admin/System
    try {
        if (Object.keys(req.body).length === 0) return next(new AppError('No data for update.', 400));
        const updatedBooking = await HostelBookingService.updateHostelBookingStatus(req.params.id, req.body, req.user);
        res.status(200).json({ status: 'success', message: 'Booking status updated.', data: { booking: updatedBooking } });
    } catch (error) { next(error); }
};

export const cancelHostelBooking = async (req, res, next) => { // Student or Admin
    try {
        const cancelledBooking = await HostelBookingService.cancelHostelBooking(req.params.id, req.user);
        res.status(200).json({ status: 'success', message: 'Hostel booking cancelled.', data: { booking: cancelledBooking } });
    } catch (error) { next(error); }
};

// --- MODIFIED: Payment Controllers ---
// `createHostelBookingStripeSession` now expects the prepared booking details in its body
export const createHostelBookingStripeSession = async (req, res) => {
    try {
        const { bookingDetails, userDetails, paymentChannel } = req.body; // Expect full bookingDetails object
        if (!bookingDetails || !userDetails || !paymentChannel) {
            return res.status(400).json({ message: "Missing required payment details or booking information." });
        }
        const sessionData = await HostelBookingService.initializeHostelBookingStripePayment(
            bookingDetails, // Pass the full bookingDetails object
            userDetails,
            paymentChannel,
        );
        res.status(201).json(sessionData);
    } catch (error) {
        console.error("Error creating Stripe session:", error);
        res.status(500).json({ message: error.message || "Error creating Stripe payment session." });
    }
};

// `completeHostelBookingStripePayment` remains largely the same, relying on sessionId from Stripe
export const completeHostelBookingStripePayment = async (req, res) => {
    try {
        const { sessionId } = req.body;
        if (!sessionId) {
            return res.status(400).json({ message: "Session ID is required." });
        }
        const payment = await HostelBookingService.completeHostelBookingStripePayment(sessionId);
        res.status(200).json({ message: "Payment completed successfully.", payment });
    } catch (error) {
        console.error("Error completing Stripe payment:", error);
        res.status(500).json({ message: error.message || "Error completing payment." });
    }
};

// `verifyPaystackHostelBookingPayment` now expects the prepared booking details in its body
export const verifyPaystackHostelBookingPayment = async (req, res) => {
    try {
        const { reference, bookingDetails } = req.body; // Expect full bookingDetails object
        if (!reference || !bookingDetails) {
            return res.status(400).json({ message: "Payment reference and booking details are required." });
        }
        const payment = await HostelBookingService.verifyPaystackHostelBookingPayment(
            reference,
            bookingDetails // Pass the full bookingDetails object
        );
        res.status(201).json({ message: "Payment created successfully.", payment });
    } catch (error) {
        console.error("Paystack verification error:", error);
        res.status(500).json({ message: error.message || "An error occurred during payment verification." });
    }
};

// `verifyFlutterwaveHostelBookingPayment` now expects the prepared booking details in its body
export const verifyFlutterwaveHostelBookingPayment = async (req, res) => {
    try {
        const { transactionId, tx_ref, bookingDetails } = req.body; // Expect full bookingDetails object
        if (!transactionId || !tx_ref || !bookingDetails) {
            return res.status(400).json({ message: "Transaction ID, tx_ref, and booking details are required." });
        }
        const payment = await HostelBookingService.verifyFlutterwaveHostelBookingPayment(
            transactionId,
            tx_ref,
            bookingDetails // Pass the full bookingDetails object
        );
        res.status(201).json({ message: "Payment created successfully.", payment });
    } catch (error) {
        console.error("Flutterwave verification error:", error);
        res.status(500).json({ message: error.message || "An error occurred during payment verification." });
    }
};
export const getRoommatesController = async (req, res, next) => {
    try {
        const { id: studentId } = req.user; // Get the current student's ID from authenticated user
        const { seasonId } = req.query;     // Get seasonId from query parameter

        if (!seasonId) {
            throw new AppError('Season ID is required to find roommates.', 400);
        }

        const roommates = await HostelBookingService.getRoommatesForStudentBooking(studentId, seasonId);
        res.status(200).json({ status: 'success', data: { roommates } });
    } catch (error) {
        next(error);
    }
};

// Admin only: Deletes a specific pending payment record
export const deletePendingPaymentRecordController = async (req, res, next) => {
    try {
        const { id } = req.params; // Expecting paymentReceiptId in params
        const result = await HostelBookingService.deletePendingPaymentRecord(id);
        res.status(200).json({ status: 'success', message: result.message });
    } catch (error) {
        next(error);
    }
};
