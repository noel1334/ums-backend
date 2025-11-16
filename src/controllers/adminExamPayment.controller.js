import * as AdminExamPaymentService from '../services/adminExamPayment.service.js';

/**
 * Controller to get a paginated list of all exam payments.
 */
export const getAllPayments = async (req, res, next) => {
    try {

        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 50; // Use a reasonable limit
        
        // --- THIS IS THE FIX ---
        // We need to check if req.query.examId exists and is not an empty string.
        const examId = req.query.examId ? parseInt(req.query.examId, 10) : undefined;

        // Pass all parameters to the service function
        const result = await AdminExamPaymentService.getAllExamPayments({ page, limit, examId });
        
        res.status(200).json({ status: 'success', data: result });
    } catch (error) {
        next(error);
    }
};
/**
 * Controller to delete a specific exam payment.
 */
export const deletePayment = async (req, res, next) => {
    try {
        const { paymentId } = req.params;
        const result = await AdminExamPaymentService.deleteExamPaymentById(parseInt(paymentId, 10));
        res.status(200).json({ status: 'success', data: result });
    } catch (error) {
        next(error);
    }
};

/**
 * Controller to get exam payment statistics.
 */
export const getPaymentStats = async (req, res, next) => {
    try {
        const stats = await AdminExamPaymentService.getExamPaymentStats();
        res.status(200).json({ status: 'success', data: stats });
    } catch (error) {
        next(error);
    }
};