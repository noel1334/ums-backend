// src/services/studentExamPayment.service.js
import axios from 'axios';
import prisma from '../config/prisma.js';
import config from '../config/index.js';
import AppError from '../utils/AppError.js';
import { PaymentStatus } from '../generated/prisma/index.js';

/**
 * Gets the student's current payment status for a specific exam with corrected, stricter logic.
 */
export const getMyPaymentStatusForExam = async (studentId, examId) => {
    // 1. Validate the student exists
    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student) throw new AppError('Student not found.', 404);

    // 2. Check for an ACTIVE fee configuration for the exam.
    const examFee = await prisma.examFee.findFirst({
        where: {
            examId: examId,
            isActive: true,
        }
    });

    // 3. If no active fee is found, block the student.
    if (!examFee) {
        return {
            status: 'FEE_NOT_CONFIGURED',
            message: 'The fee for this exam has not been set up by the administration. Please contact support.'
        };
    }

    // 4. Check if THIS specific student has paid.
    const existingPayment = await prisma.studentExamPayment.findUnique({
        where: {
            studentId_examId: { studentId, examId }
        }
    });

    // 5. ---> THE FIX IS HERE <---
    //    We are now checking for 'PAID' to match the database value.
    if (existingPayment && existingPayment.paymentStatus === PaymentStatus.PAID) {
        return {
            status: 'PAID',
            message: 'You have already paid this fee.',
            paymentDetails: existingPayment
        };
    }

    // 6. If we reach here, an active fee exists but the student has not paid.
    return {
        status: 'NOT_PAID',
        message: 'Payment is required to download the exam pass.',
        feeDetails: examFee,
    };
};

/**
 * Verifies a Paystack payment and creates the corresponding record in the database.
 * @param {string} gatewayReference - The reference from Paystack.
 * @param {object} paymentDetails - Contains studentId and examId.
 */
export const verifyAndRecordPaystackExamPayment = async (gatewayReference, paymentDetails) => {
    const { examId, studentId } = paymentDetails;

    // 1. Verify the transaction with Paystack's API
    const response = await axios.get(`https://api.paystack.co/transaction/verify/${gatewayReference}`, {
        headers: { Authorization: `Bearer ${config.paystack}` }
    });
    const { data } = response.data;
    if (data.status !== 'success') {
        throw new AppError(`Paystack verification failed: ${data.gateway_response}`, 400);
    }

    // 2. Fetch the expected fee amount from our own database to prevent tampering
    const examFee = await prisma.examFee.findFirst({ where: { examId: examId, isActive: true } });
    if (!examFee) throw new AppError('Associated exam fee not found or is inactive.', 404);

    const paidAmountKobo = data.amount;
    const expectedAmountKobo = Math.round(examFee.amount * 100);
    if (paidAmountKobo < expectedAmountKobo) {
        throw new AppError('Amount paid is less than the expected fee.', 400);
    }

    // 3. Create or update the payment record in our database
    const recordedPayment = await prisma.studentExamPayment.upsert({
        where: { studentId_examId: { studentId, examId } },
        create: {
            studentId,
            examId,
            examFeeId: examFee.id,
            amountExpected: examFee.amount,
            amountPaid: paidAmountKobo / 100,
            paymentStatus: PaymentStatus.PAID,
            paymentReference: gatewayReference,
            paymentChannel: 'PAYSTACK',
            paymentDate: new Date(data.paid_at),
            transactionId: String(data.id),
            paymentGatewayResponse: data,
        },
        update: {
            amountPaid: paidAmountKobo / 100,
            paymentStatus: PaymentStatus.PAID,
            paymentDate: new Date(data.paid_at),
            transactionId: String(data.id),
            paymentGatewayResponse: data,
        },
    });

    return { message: 'Payment verified and recorded successfully.', payment: recordedPayment };
};

/**
 * Verifies a Flutterwave payment and creates the corresponding record in the database.
 * @param {string} transaction_id - The transaction ID from Flutterwave.
 * @param {string} tx_ref - The transaction reference you created.
 * @param {object} paymentDetails - Contains studentId and examId.
 */
export const verifyAndRecordFlutterwaveExamPayment = async (transaction_id, tx_ref, paymentDetails) => {
    const { examId, studentId } = paymentDetails;
    
    // 1. Verify the transaction with Flutterwave's API
    const response = await axios.get(`https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`, {
        headers: { Authorization: `Bearer ${config.flutterwave.secretKey}` },
    });
    const { data } = response.data;

    // 2. Fetch the expected fee amount from our own database
    const examFee = await prisma.examFee.findFirst({ where: { examId: examId, isActive: true } });
    if (!examFee) throw new AppError('Associated exam fee not found or is inactive.', 404);
    
    // 3. Perform security checks
    const isAmountMatch = parseFloat(data.amount) >= parseFloat(examFee.amount);
    if (data.status !== 'successful' || data.tx_ref.trim() !== tx_ref.trim() || !isAmountMatch) {
        throw new AppError('Flutterwave verification failed. Details do not match.', 400);
    }

    // 4. Create or update the payment record in our database
    const recordedPayment = await prisma.studentExamPayment.upsert({
         where: { studentId_examId: { studentId, examId } },
        create: {
            studentId,
            examId,
            examFeeId: examFee.id,
            amountExpected: examFee.amount,
            amountPaid: data.amount,
            paymentStatus: PaymentStatus.PAID,
            paymentReference: tx_ref,
            paymentChannel: 'FLUTTERWAVE',
            paymentDate: new Date(data.created_at),
            transactionId: String(data.id),
            paymentGatewayResponse: data,
        },
        update: {
            amountPaid: data.amount,
            paymentStatus: PaymentStatus.PAID,
            paymentDate: new Date(data.created_at),
            transactionId: String(data.id),
            paymentGatewayResponse: data,
        },
    });

    return { message: 'Payment verified and recorded successfully.', payment: recordedPayment };
};

export const getStudentExamPaymentHistory = async (studentId, { page = 1, limit = 10, filters = {} }) => {
    const skip = (page - 1) * limit;

    const whereClause = {
        studentId: studentId,
    };

    if (filters.paymentStatus) {
        whereClause.paymentStatus = filters.paymentStatus;
    }
    if (filters.paymentChannel) {
        whereClause.paymentChannel = filters.paymentChannel;
    }

    const [payments, totalItems] = await Promise.all([
        prisma.studentExamPayment.findMany({
            where: whereClause,
            skip: skip,
            take: limit,
            orderBy: {
                createdAt: 'desc', // Order by creation date, newest first
            },
            include: {
                student: {
                    select: { id: true, name: true, regNo: true },
                },
                exam: {
                    select: {
                        id: true,
                        title: true,
                        course: {
                            select: { code: true }
                        }
                    },
                },
            },
        }),
        prisma.studentExamPayment.count({
            where: whereClause,
        }),
    ]);

    return {
        items: payments,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
    };
};