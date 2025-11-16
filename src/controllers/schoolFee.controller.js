// src/controllers/schoolFee.controller.js
import * as schoolFeeService from '../services/schoolFee.service.js';
import catchAsync from '../utils/catchAsync.js';

// --- GET ALL ---
export const getAllSchoolFeePayments = catchAsync(async (req, res, next) => {
    const result = await schoolFeeService.getAllSchoolFeePayments(req.query);
    res.status(200).json({
        status: 'success',
        data: result
    });
});

// --- GET BY ID ---
export const getSchoolFeePaymentById = catchAsync(async (req, res, next) => {
    const payment = await schoolFeeService.getSchoolFeePaymentById(req.params.id);
    res.status(200).json({
        status: 'success',
        data: { payment }
    });
});

export const getMySchoolFeeRecordsController = catchAsync(async (req, res, next) => {
    // The `authenticateToken` middleware attaches the user's info to `req.user`.
    // We pass the whole object to the service now.
    const requestingUser = req.user;

    const records = await schoolFeeService.getMySchoolFeeRecords(requestingUser);

    res.status(200).json({
        status: 'success',
        data: {
            records
        }
    });
});


// --- STRIPE SESSION CREATION ---
export const createSchoolFeeStripeSession = async (req, res) => {
    try {
        // ADD 'purpose' to the destructuring of req.body
        const { studentId, seasonId, semesterId, amount, email, name, paymentChannel, purpose } = req.body;
        
        // Add 'purpose' to the validation
        if (!studentId || !seasonId || !amount || !email || !name || !paymentChannel || !purpose) {
            return res.status(400).json({ message: "Missing required payment details, including purpose." });
        }

        const feeDetails = { amount: parseFloat(amount) };
        const userDetails = { email, name };
        const paymentDetails = {
            studentId: parseInt(studentId, 10),
            seasonId: parseInt(seasonId, 10),
            semesterId: semesterId ? parseInt(semesterId, 10) : null
        };

        const sessionData = await schoolFeeService.initializeSchoolFeeStripePayment(
            paymentDetails,
            feeDetails,
            userDetails,
            paymentChannel,
            purpose // <--- PASS THE 'purpose' HERE
        );

        res.status(201).json(sessionData);
    } catch (error) {
        console.error("Error creating Stripe session:", error);
        res.status(500).json({ message: error.message || "Error creating Stripe payment session." });
    }
};


// --- COMPLETE STRIPE PAYMENT ---
export const completeSchoolFeeStripePayment = async (req, res) => {
    try {
        const { sessionId } = req.body;
        if (!sessionId) {
            return res.status(400).json({ message: "Session ID is required." });
        }
        const payment = await schoolFeeService.completeSchoolFeeStripePayment(sessionId);
        res.status(200).json({ message: "Payment completed successfully.", payment });
    } catch (error) {
        console.error("Error completing Stripe payment:", error);
        res.status(500).json({ message: error.message || "Error completing payment." });
    }
};

export const handleStripeCancellationRequest = async (req, res) => {
    try {
        const { schoolFeeId } = req.body;
        if (!schoolFeeId) {
            return res.status(400).json({ message: "School Fee ID is required for cancellation." });
        }
        await schoolFeeService.handleStripeCancellation(schoolFeeId);
        res.status(200).json({ message: "Cancellation cleanup successful." });
    } catch (error) {
        console.error("Error during cancellation cleanup:", error);
        res.status(500).json({ message: error.message || "Error during cancellation cleanup." });
    }
};


// --- PAYSTACK VERIFICATION ---
export const verifyPaystackSchoolFeePayment = async (req, res) => {
    try {
        const { reference, paymentDetails } = req.body;
        if (!reference || !paymentDetails) {
            return res.status(400).json({ message: "Payment reference and payment details are required." });
        }
        const payment = await schoolFeeService.verifyPaystackSchoolFeePayment(reference, paymentDetails);
        res.status(201).json({ message: "Payment created successfully.", payment });
    } catch (error) {
        console.error("Paystack verification error:", error);
        res.status(500).json({ message: error.message || "An error occurred during payment verification." });
    }
};

// --- FLUTTERWAVE VERIFICATION ---
export const verifyFlutterwaveSchoolFeePayment = async (req, res) => {
    try {
        const { transactionId, tx_ref, paymentDetails } = req.body;
        if (!transactionId || !tx_ref || !paymentDetails) {
            return res.status(400).json({ message: "Transaction ID, tx_ref, and payment details are required." });
        }
        const payment = await schoolFeeService.verifyFlutterwaveSchoolFeePayment(transactionId, tx_ref, paymentDetails);
        res.status(201).json({ message: "Payment created successfully.", payment });
    } catch (error) {
        console.error("Flutterwave verification error:", error);
        res.status(500).json({ message: error.message || "An error occurred during payment verification." });
    }
};

// --- DELETE INCOMPLETE PAYMENT ---
export const deleteIncompleteSchoolFeePayment = async (req, res) => {
    try {
        const { reference } = req.params;
        await schoolFeeService.deleteIncompleteSchoolFeePaymentByRef(reference);
        res.status(200).json({ message: "Incomplete payment record deleted." });
    } catch (error) {
        console.error("Error deleting incomplete payment:", error);
        res.status(500).json({ message: "Error deleting incomplete payment record." });
    }
};

export const deletePendingSchoolFeeRecordController = catchAsync(async (req, res, next) => {
    const { id } = req.params; // Expecting schoolFeeId in URL params
    const result = await schoolFeeService.deletePendingSchoolFeeRecord(id);
    res.status(200).json({ status: 'success', message: result.message });
});