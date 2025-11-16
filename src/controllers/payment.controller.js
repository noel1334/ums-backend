
import * as PaymentService from '../services/payment.service.js';
import AppError from '../utils/AppError.js';

export const recordHostelPayment = async (req, res, next) => {
    try {
        let paymentData = { ...req.body };
        // If a student is confirming their payment, their ID comes from the authenticated user.
        // If an admin is recording, studentId should be in the body.
        if (req.user.type === 'student' && !req.body.studentId) {
            paymentData.studentId = req.user.id;
        } else if (req.user.type === 'student' && req.body.studentId && parseInt(req.body.studentId, 10) !== req.user.id) {
            return next(new AppError('Students can only record payments for themselves.', 403));
        }


        const result = await PaymentService.recordHostelPayment(paymentData, req.user);
        res.status(201).json({
            status: 'success',
            message: 'Hostel payment recorded successfully.',
            data: result, // Contains both paymentReceipt and updated hostelBooking
        });
    } catch (error) {
        next(error);
    }
};

export const recordSchoolFeePayment = async (req, res, next) => {
    try {
        let paymentData = { ...req.body };
        // studentId in body is primary for identifying student,
        // but if student is actor, ensure it matches or use req.user.id
        if (req.user.type === 'student' && !req.body.studentId) {
            paymentData.studentId = req.user.id;
        } else if (req.user.type === 'student' && req.body.studentId && parseInt(req.body.studentId, 10) !== req.user.id) {
            return next(new AppError('Students can only record payments for themselves.', 403));
        }
        // schoolFeeId must be in req.body, indicating which bill is being paid.

        const result = await PaymentService.recordSchoolFeePayment(paymentData, req.user);
        res.status(201).json({
            status: 'success',
            message: 'School fee payment recorded successfully.',
            data: result,
        });
    } catch (error) {
        next(error);
    }
};