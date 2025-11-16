import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import { PaymentStatus } from '../generated/prisma/index.js';

/**
 * Fetches a paginated list of all student exam payments, with optional filters.
 * @param {object} options - The query options.
 * @param {number} options.page - The current page number.
 * @param {number} options.limit - The number of items per page.
 * ...
 */
export const getAllExamPayments = async ({ page = 1, limit = 10, examId }) => {
    const skip = (page - 1) * limit;

    // --- THIS IS THE CORRECTED LOGIC ---
    const whereClause = {};

    // Make the check more robust. It ensures examId is a valid number.
    const numericExamId = examId ? parseInt(examId, 10) : NaN;
    if (!isNaN(numericExamId) && numericExamId > 0) {
        whereClause.examId = numericExamId;
    }
    // --- END OF CORRECTION ---

    const [payments, totalItems] = await Promise.all([
        prisma.studentExamPayment.findMany({
            where: whereClause, // Use the corrected where clause
            skip: skip,
            take: limit,
            orderBy: {
                paymentDate: 'desc',
            },
            include: {
                student: {
                    select: { id: true, name: true, regNo: true, },
                },
                exam: {
                    select: { id: true, title: true, },
                },
            },
        }),
        prisma.studentExamPayment.count({ where: whereClause }), // Ensure count also uses the filter
    ]);

    return {
        payments,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
    };
};


/**
 * Deletes a specific student exam payment by its ID.
 * @param {number} paymentId - The ID of the payment to delete.
 * @returns {Promise<object>} - A promise that resolves to a success message.
 */
export const deleteExamPaymentById = async (paymentId) => {
    const payment = await prisma.studentExamPayment.findUnique({
        where: { id: paymentId },
    });

    if (!payment) {
        throw new AppError('Payment record not found.', 404);
    }

    await prisma.studentExamPayment.delete({
        where: { id: paymentId },
    });

    return { message: 'Exam payment record deleted successfully.' };
};


/**
 * Gets statistics about all student exam payments.
 * @returns {Promise<object>} - A promise that resolves to payment statistics.
 */
export const getExamPaymentStats = async () => {
    const [totalPayments, successfulPayments, totalAmountPaid] = await Promise.all([
        prisma.studentExamPayment.count(),
        
        // ----> THIS IS THE CORRECTED QUERY <----
        prisma.studentExamPayment.count({
            where: { paymentStatus: PaymentStatus.SUCCESS }, // Use the imported enum
        }),
        
        // ----> THIS IS THE CORRECTED QUERY <----
        prisma.studentExamPayment.aggregate({
            _sum: {
                amountPaid: true,
            },
            where: { paymentStatus: PaymentStatus.SUCCESS }, // Use the imported enum
        }),
    ]);

    const failedOrPendingPayments = totalPayments - successfulPayments;
    const totalAmount = totalAmountPaid._sum.amountPaid || 0;

    return {
        totalPayments,
        successfulPayments,
        failedOrPendingPayments,
        totalAmount,
    };
};