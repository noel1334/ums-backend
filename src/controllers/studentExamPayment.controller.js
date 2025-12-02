// src/controllers/studentExamPayment.controller.js

import * as StudentExamPaymentService from '../services/studentExamPayment.service.js';

/**
 * Gets the student's payment status for a specific exam.
 */
export const getMyPaymentStatusForExam = async (req, res, next) => {
    try {
        const studentId = req.user.id;
        const { examId } = req.params;
        const status = await StudentExamPaymentService.getMyPaymentStatusForExam(studentId, parseInt(examId, 10));
        res.status(200).json({ status: 'success', data: status });
    } catch (error) {
        next(error);
    }
};

/**
 * Controller to handle Paystack payment verification.
 */
export const verifyPaystackPayment = async (req, res, next) => {
    try {
        const { reference, paymentDetails } = req.body;
        // Securely add the studentId from the authenticated user token
        const studentId = req.user.id;
        const result = await StudentExamPaymentService.verifyAndRecordPaystackExamPayment(
            reference,
            { ...paymentDetails, studentId }
        );
        res.status(200).json({ status: 'success', data: result });
    } catch (error) {
        next(error);
    }
};

/**
 * Controller to handle Flutterwave payment verification.
 */
export const verifyFlutterwavePayment = async (req, res, next) => {
    try {
        const { transactionId, tx_ref, paymentDetails } = req.body;
        // Securely add the studentId from the authenticated user token
        const studentId = req.user.id;
        const result = await StudentExamPaymentService.verifyAndRecordFlutterwaveExamPayment(
            transactionId,
            tx_ref,
            { ...paymentDetails, studentId }
        );
        res.status(200).json({ status: 'success', data: result });
    } catch (error) {
        next(error);
    }
};

/**
 * Gets the student's exam payment history.
 */
export const getMyExamPaymentHistory = async (req, res, next) => {
    try {
        const studentId = req.user.id; // Get student ID from authenticated user
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const status = req.query.status; // Optional filter
        const channel = req.query.channel; // Optional filter

        const filters = {};
        if (status && status !== 'All Status') filters.paymentStatus = status; // Assuming 'All Status' is a default value from frontend
        if (channel && channel !== 'All Channels') filters.paymentChannel = channel; // Assuming 'All Channels' is a default value from frontend

        const result = await StudentExamPaymentService.getStudentExamPaymentHistory(
            studentId,
            { page, limit, filters }
        );
        res.status(200).json({ status: 'success', data: result });
    } catch (error) {
        next(error);
    }
};