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