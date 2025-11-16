// src/controllers/applicantPayment.controller.js
import * as applicantPaymentService from '../services/applicantPayment.service.js';
import catchAsync from '../utils/catchAsync.js';

export const getAllApplicantPayments = catchAsync(async (req, res, next) => {
    const result = await applicantPaymentService.getAllApplicantPayments(req.query);
    res.status(200).json({
        status: 'success',
        data: result
    });
});

export const getApplicantPaymentById = catchAsync(async (req, res, next) => {
    const payment = await applicantPaymentService.getApplicantPaymentById(req.params.id);
    res.status(200).json({
        status: 'success',
        data: { payment }
    });
});

export const createStripePaymentSession = async (req, res) => { // Renamed this export
    try {
        const applicantProfileId = req.applicantProfile.id;

        const { feeId, amount, email, name, paymentChannel, purpose } = req.body;

        if (!feeId || !amount || !email || !name || !paymentChannel || !purpose) {
            return res.status(400).json({ message: "Missing required payment details." });
        }

        const feeDetails = { feeId: parseInt(feeId, 10), amount: parseFloat(amount) };
        const userDetails = { email, name };

        const sessionData = await applicantPaymentService.initializeStripePayment(
            applicantProfileId, 
            feeDetails, 
            userDetails,
            paymentChannel,
            purpose
        );

        res.status(201).json(sessionData);
    } catch (error) {
        console.error("Error creating Stripe session:", error);
        res.status(500).json({ message: error.message || "Error creating Stripe payment session." });
    }
};

export const completeStripePayment = async (req, res) => { // Renamed this export
    try {
        const { sessionId } = req.body;
        if (!sessionId) {
            return res.status(400).json({ message: "Session ID is required." });
        }
        
        const payment = await applicantPaymentService.completeStripePayment(sessionId);
        res.status(200).json({ message: "Payment completed successfully.", payment });
    } catch (error) {
        console.error("Error completing Stripe payment:", error);
        res.status(500).json({ message: error.message || "Error completing payment." });
    }
};


export const completeStripeScreeningFeePayment = async (req, res) => { // Rename this to completeStripePayment
    try {
        const { sessionId } = req.body;
        if (!sessionId) {
            return res.status(400).json({ message: "Session ID is required." });
        }
        
        // The service layer will now handle updating the correct 'hasPaid' field
        const payment = await applicantPaymentService.completeStripePayment(sessionId);
        res.status(200).json({ message: "Payment completed successfully.", payment });
    } catch (error) {
        console.error("Error completing Stripe payment:", error);
        res.status(500).json({ message: error.message || "Error completing payment." });
    }
};

// --- Paystack Handler ---
export const verifyPaystackAndCreatePayment = async (req, res) => {
    try {
        const applicantProfileId = req.applicantProfile.id;
        const { reference, paymentDetails } = req.body; // paymentDetails now contains purpose and feeId

        if (!reference || !paymentDetails) {
            return res.status(400).json({ message: "Payment reference and details are required." });
        }

        // Pass all paymentDetails, including purpose, to the service
        const payment = await applicantPaymentService.verifyPaystackPayment(applicantProfileId, reference, paymentDetails);
        res.status(201).json({ message: "Payment created successfully.", payment });
    } catch (error) {
        console.error("Paystack verification error:", error);
        res.status(500).json({ message: error.message || "An error occurred during payment verification." });
    }
};

// --- Flutterwave Handler ---
export const verifyFlutterwaveAndCreatePayment = async (req, res) => {
    try {
        const applicantProfileId = req.applicantProfile.id;
        const { transactionId, tx_ref, paymentDetails } = req.body; // paymentDetails now contains purpose and feeId

        if (!transactionId || !tx_ref || !paymentDetails) {
            return res.status(400).json({ message: "Transaction ID, tx_ref, and payment details are required." });
        }

        // Pass all paymentDetails, including purpose, to the service
        const payment = await applicantPaymentService.verifyFlutterwavePayment(applicantProfileId, transactionId, tx_ref, paymentDetails);
        res.status(201).json({ message: "Payment created successfully.", payment });
    } catch (error) {
        console.error("Flutterwave verification error:", error);
        res.status(500).json({ message: error.message || "An error occurred during payment verification." });
    }
};


// --- Deletion Handler ---
export const deleteIncompletePayment = async (req, res) => {
    try {
        const { reference } = req.params;
        await applicantPaymentService.deleteIncompletePaymentByRef(reference);
        res.status(200).json({ message: "Incomplete payment record deleted." });
    } catch (error) {
        console.error("Error deleting incomplete payment:", error);
        res.status(500).json({ message: "Error deleting incomplete payment record." });
    }
};