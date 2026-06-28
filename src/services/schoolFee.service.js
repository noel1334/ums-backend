// src/services/schoolFee.service.js

import axios from 'axios';
import Stripe from 'stripe';
import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js'; 
import config from '../config/index.js';
import { PaymentStatus, PaymentChannel } from '../generated/prisma/index.js';

// Defensive check for Stripe API keys in different environments
const stripeSecret = config.stripeSecretKey || config.stripe || config.strip;
const stripe = new Stripe(stripeSecret || '');

// Helper function to generate a payment reference
const generatePaymentReference = () => {
    const now = new Date();
    return `UMS-SF-${now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
};

const paymentSelection = {
    id: true,
    studentId: true,
    seasonId: true,
    semesterId: true,
    amount: true,
    amountPaid: true,
    paymentStatus: true,
    dueDate: true,
    description: true,
    createdAt: true,
    updatedAt: true,
    student: {
        select: {
            id: true,
            name: true,
            email: true,
            regNo: true,
            jambRegNo:true,
            currentLevel: {
                select: {
                    id: true,
                    name: true,
                    value: true,
                },
            },
            program: { 
                select: {
                    id: true,
                    name: true,
                    degreeType: true,
                    degree:true,
                },
            },
            department: { 
                select: {
                    id: true,
                    name: true,
                },
            },
        },
    },
    season: { select: { id: true, name: true } },
    semester: { select: { id: true, name: true } },
    Department: { select: { id: true, name: true } }, 
    Program: { select: { id: true, name: true } },    
    payments: true,
};

const transformPaymentRecord = (payment) => {
    return {
        ...payment,
        studentName: payment.student?.name || 'N/A', 
        studentEmail: payment.student?.email || 'N/A',
        jambRegNo: payment.student?.jambRegNo || 'N/A',
        studentRegNo: payment.student?.regNo || 'N/A',  
        studentLevel: payment.student?.currentLevel?.name || 'N/A', 
        studentLevelValue: payment.student?.currentLevel?.value || null, 
        studentProgram: payment.student?.program?.name || 'N/A',  
        studentDegreeType: payment.student?.program?.degreeType || 'N/A', 
        studentDegree: payment.student?.program?.degree || 'N/A',  
        studentDepartment: payment.student?.department?.name || 'N/A', 
        seasonName: payment.season?.name || 'N/A',
        semesterName: payment.semester?.name || 'N/A',
        departmentName: payment.Department?.name || 'N/A', 
        programName: payment.Program?.name || 'N/A',
        student: undefined,  
        season: undefined,
        semester: undefined,
        department: undefined,
        program: undefined,
    };
};

// --- GET ALL SCHOOL FEE PAYMENTS ---
export const getAllSchoolFeePayments = async (query) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const { search, studentId, seasonId, semesterId, paymentStatus, paymentChannel, page = "1", limit = "10" } = query;
        const filters = [];

        if (search) {
            filters.push({
                OR: [                    
                    { student: { name: { contains: search } } }, 
                    { student: { email: { contains: search } } },
                    { student: { regNo: { contains: search } } },
                    { description: { contains: search } },
                ]
            });
        }

        if (studentId) {
            const studentIdNum = parseInt(studentId, 10);
            if (!isNaN(studentIdNum)) {
                filters.push({ studentId: studentIdNum });
            } else { throw new AppError('Invalid Student ID format for filter.', 400); }
        }

        if (seasonId) {
            const seasonIdNum = parseInt(seasonId, 10);
            if (!isNaN(seasonIdNum)) {
                filters.push({ seasonId: seasonIdNum });
            } else { throw new AppError('Invalid Season ID format for filter.', 400); }
        }

        if (semesterId) {
            const semesterIdNum = parseInt(semesterId, 10);
            if (!isNaN(semesterIdNum)) {
                filters.push({ semesterId: semesterIdNum });
            } else { throw new AppError('Invalid Semester ID format for filter.', 400); }
        }

        if (paymentStatus && Object.values(PaymentStatus).includes(paymentStatus)) {
            filters.push({ paymentStatus: paymentStatus });
        }

        const where = filters.length > 0 ? { AND: filters } : {};
        const pageNum = parseInt(page, 10) || 1;
        const limitNum = parseInt(limit, 10) || 10;
        const skip = (pageNum - 1) * limitNum;

        const [schoolFees, totalFees] = await prisma.$transaction([
            prisma.schoolFee.findMany({ where, select: paymentSelection, orderBy: { createdAt: 'desc' }, skip, take: limitNum }),
            prisma.schoolFee.count({ where })
        ]);
        const transformedSchoolFees = schoolFees.map(transformPaymentRecord);
        return {
            schoolFees: transformedSchoolFees,
            totalPages: Math.ceil(totalFees / limitNum),
            currentPage: pageNum,
            totalFees
        };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("[SCHOOL_FEE_SERVICE] getAllSchoolFeePayments:", error.message, error.stack);
        throw new AppError('Could not retrieve school fee payment list.', 500);
    }
};

// --- GET SCHOOL FEE PAYMENT BY ID ---
export const getSchoolFeePaymentById = async (id) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const paymentId = parseInt(id, 10);
        if (isNaN(paymentId)) throw new AppError('Invalid Payment ID format.', 400);

        const payment = await prisma.schoolFee.findUnique({
            where: { id: paymentId },
            select: paymentSelection,
        });

        if (!payment) {
            throw new AppError('School fee payment record not found.', 404);
        }
        return transformPaymentRecord(payment);
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("[SCHOOL_FEE_SERVICE] getSchoolFeePaymentById:", error.message, error.stack);
        throw new AppError('Could not retrieve school fee payment details.', 500);
    }
};

export const getMySchoolFeeRecords = async (requestingUser) => {
    if (!prisma) throw new AppError('Prisma client unavailable', 500);

    const studentId = requestingUser.id;
    if (!studentId) {
        throw new AppError('Unable to identify the student.', 400);
    }

    const schoolFeeRecords = await prisma.schoolFee.findMany({
        where: {
            studentId: studentId,
        },
        include: {
            season: true,
            semester: true,
            payments: {
                orderBy: {
                    paymentDate: 'desc'
                }
            }
        },
        orderBy: {
            season: {
                name: 'desc'
            }
        }
    });

    return schoolFeeRecords;
};

// --- INITIALIZE STRIPE PAYMENT ---
export const initializeSchoolFeeStripePayment = async (paymentDetails, feeDetails, userDetails, paymentChannel, purpose) => {
    const { studentId, seasonId, semesterId } = paymentDetails;
    const { amount } = feeDetails;
    const { email } = userDetails;

    if (!stripeSecret) {
        throw new Error("Stripe secret key configuration is missing on the server.");
    }

    // --- DEFENSIVE VALIDATION ---
    const student = await prisma.student.findUnique({
        where: { id: studentId },
        select: { departmentId: true, programId: true }
    });
    if (!student) {
        throw new AppError(`Student with ID ${studentId} not found.`, 404);
    }

    const seasonExists = await prisma.season.findUnique({ where: { id: seasonId } });
    if (!seasonExists) {
        throw new AppError(`The selected Academic Session (ID: ${seasonId}) no longer exists. Please sign out and log back in to refresh your student session.`, 400);
    }

    if (semesterId) {
        const semesterExists = await prisma.semester.findUnique({ where: { id: semesterId } });
        if (!semesterExists) {
            throw new AppError(`The selected Semester (ID: ${semesterId}) no longer exists. Please sign out and log back in to refresh your student session.`, 400);
        }
    }

    // Find or create the SchoolFee record atomically
    const schoolFeeRecord = await prisma.$transaction(async (tx) => {
        let fee = await tx.schoolFee.findFirst({
            where: { studentId, seasonId, semesterId: semesterId || null }
        });
        if (!fee) {
            fee = await tx.schoolFee.create({
                data: {
                    studentId,
                    seasonId,
                    semesterId: semesterId || null,
                    amount,
                    description: "School Fees",
                    departmentId: student.departmentId,
                    programId: student.programId,
                }
            });
        }
        return fee;
    });

    // Create the Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [{
            price_data: { currency: "ngn", product_data: { name: "School Fee Payment" }, unit_amount: Math.round(amount * 100) },
            quantity: 1,
        }],
        mode: "payment",
        customer_email: email,
        metadata: {
            schoolFeeId: schoolFeeRecord.id,
            studentId: studentId,
            seasonId: seasonId,
            purpose: purpose, 
        },
        success_url: `${config.studentPortalUrl}/payment-status?session_id={CHECKOUT_SESSION_ID}&purpose=${purpose}`, 
        cancel_url: `${config.studentPortalUrl}/payment-status?status=cancelled&school_fee_id=${schoolFeeRecord.id}&purpose=${purpose}`, 
    });

    return { sessionId: session.id };
};


// --- COMPLETE STRIPE PAYMENT ---
export const completeSchoolFeeStripePayment = async (sessionId) => {
    if (!stripeSecret) {
        throw new Error("Stripe secret key configuration is missing on the server.");
    }
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    const reference = `UMS-STRIPE-${session.id}`;
    const existingReceipt = await prisma.paymentReceipt.findFirst({
        where: { reference: reference }
    });

    if (existingReceipt) {
        console.log(`Idempotency Key Check: Receipt for reference ${reference} already exists. Returning existing record.`);
        return existingReceipt;
    }

    if (!session.metadata?.schoolFeeId || !session.metadata?.studentId || !session.metadata?.seasonId) {
        throw new Error("Required metadata (schoolFeeId, studentId, seasonId) is missing from the session.");
    }

    const schoolFeeId = parseInt(session.metadata.schoolFeeId, 10);
    const studentId = parseInt(session.metadata.studentId, 10);
    const seasonId = parseInt(session.metadata.seasonId, 10);

    if (session.payment_status === "paid") {
        const [paymentReceipt] = await prisma.$transaction([
            prisma.paymentReceipt.create({
                data: {
                    schoolFeeId: schoolFeeId,
                    studentId: studentId,
                    amountExpected: session.amount_total / 100,
                    amountPaid: session.amount_total / 100,
                    paymentStatus: 'PAID',
                    reference: reference, 
                    channel: 'STRIPE',
                    transactionId: session.payment_intent,
                    paymentGatewayResponse: session,
                    seasonId: seasonId,
                    description: "School Fee Payment",
                }
            }),
            prisma.schoolFee.update({
                where: { id: schoolFeeId },
                data: {
                    amountPaid: { increment: session.amount_total / 100 },
                    paymentStatus: 'PAID'
                }
            })
        ]);
        return paymentReceipt;
    } else {
        throw new Error(`Payment is not yet confirmed. Status: ${session.payment_status}`);
    }
};

export const handleStripeCancellation = async (schoolFeeId) => {
    const feeId = parseInt(schoolFeeId, 10);

    await prisma.$transaction(async (tx) => {
        const schoolFee = await tx.schoolFee.findUnique({
            where: { id: feeId },
            include: { payments: true } 
        });

        if (schoolFee && schoolFee.paymentStatus === 'PENDING' && schoolFee.payments.length === 0) {
            await tx.schoolFee.delete({
                where: { id: feeId }
            });
            console.log(`Cleaned up pending SchoolFee record with ID: ${feeId}`);
        } else {
            console.log(`SchoolFee record ${feeId} was not cleaned up (either already paid, has other receipts, or doesn't exist).`);
        }
    });
    return { message: "Cancellation processed." };
};

// --- VERIFY PAYSTACK PAYMENT ---
export const verifyPaystackSchoolFeePayment = async (gatewayReference, paymentDetails) => {
    const { studentId, seasonId, semesterId, amount } = paymentDetails;

    // --- DEFENSIVE VALIDATION ---
    const seasonExists = await prisma.season.findUnique({ where: { id: seasonId } });
    if (!seasonExists) {
        throw new AppError(`The selected Academic Session (ID: ${seasonId}) no longer exists. Please sign out and log back in to refresh your student session.`, 400);
    }

    if (semesterId) {
        const semesterExists = await prisma.semester.findUnique({ where: { id: semesterId } });
        if (!semesterExists) {
            throw new AppError(`The selected Semester (ID: ${semesterId}) no longer exists. Please sign out and log back in to refresh your student session.`, 400);
        }
    }

    const response = await axios.get(`https://api.paystack.co/transaction/verify/${gatewayReference}`, {
        headers: { Authorization: `Bearer ${config.paystack}` },
    });

    const { data } = response.data;
    if (data.status !== "success") {
        throw new Error("Paystack payment verification failed.");
    }
    
    const student = await prisma.student.findUnique({
        where: { id: studentId },
        select: { departmentId: true, programId: true } 
    });

    if (!student) {
        throw new Error(`Student with ID ${studentId} not found.`);
    }

    let schoolFeeRecord = await prisma.schoolFee.findUnique({
        where: { unique_student_fee_bill: { studentId, seasonId, semesterId: semesterId || null } }
    });

    if (!schoolFeeRecord) {
        schoolFeeRecord = await prisma.schoolFee.create({
            data: {
                studentId: studentId,
                seasonId: seasonId,
                semesterId: semesterId || null,
                amount: amount,
                description: "School Fees",
                departmentId: student.departmentId, 
                programId: student.programId,       
            }
        });
    }
    
    const paymentReceiptData = {
        studentId: studentId,
        schoolFeeId: schoolFeeRecord.id,
        amountExpected: amount,
        amountPaid: data.amount / 100,
        paymentStatus: 'PAID',
        reference: generatePaymentReference(),
        channel: 'PAYSTACK',
        transactionId: data.reference,
        paymentGatewayResponse: data,
        seasonId: seasonId,
        description: "School Fee Payment", 
    };

    const paymentReceipt = await prisma.paymentReceipt.create({ data: paymentReceiptData });

    await prisma.schoolFee.update({
        where: { id: schoolFeeRecord.id },
        data: {
            amountPaid: { increment: data.amount / 100 },
            paymentStatus: 'PAID'
        }
    });

    return paymentReceipt;
};

// --- VERIFY FLUTTERWAVE PAYMENT ---
export const verifyFlutterwaveSchoolFeePayment = async (transactionId, tx_ref, paymentDetails) => {
    const { studentId, seasonId, semesterId, amount } = paymentDetails;

    // --- DEFENSIVE VALIDATION ---
    const seasonExists = await prisma.season.findUnique({ where: { id: seasonId } });
    if (!seasonExists) {
        throw new AppError(`The selected Academic Session (ID: ${seasonId}) no longer exists. Please sign out and log back in to refresh your student session.`, 400);
    }

    if (semesterId) {
        const semesterExists = await prisma.semester.findUnique({ where: { id: semesterId } });
        if (!semesterExists) {
            throw new AppError(`The selected Semester (ID: ${semesterId}) no longer exists. Please sign out and log back in to refresh your student session.`, 400);
        }
    }

    const response = await axios.get(`https://api.flutterwave.com/v3/transactions/${transactionId}/verify`, {
        headers: { Authorization: `Bearer ${config.flutterwave.secretKey}` },
    });

    const { data } = response.data;
    if (data.status !== "successful" || data.tx_ref.trim() !== tx_ref.trim() || parseFloat(data.amount) < parseFloat(amount)) {
        throw new Error("Flutterwave verification failed. Details do not match.");
    }

    const student = await prisma.student.findUnique({
        where: { id: studentId },
        select: { departmentId: true, programId: true }
    });

    if (!student) {
        throw new Error(`Student with ID ${studentId} not found.`);
    }

    let schoolFeeRecord = await prisma.schoolFee.findUnique({
        where: { unique_student_fee_bill: { studentId, seasonId, semesterId: semesterId || null } }
    });

    if (!schoolFeeRecord) {
        schoolFeeRecord = await prisma.schoolFee.create({
            data: {
                studentId: studentId,
                seasonId: seasonId,
                semesterId: semesterId || null,
                amount: amount,
                description: "School Fees",
                departmentId: student.departmentId, 
                programId: student.programId,       
            }
        });
    }

    const paymentReceiptData = {
        studentId: studentId,
        schoolFeeId: schoolFeeRecord.id,
        amountExpected: amount,
        amountPaid: data.amount,
        paymentStatus: 'PAID',
        reference: `UMS-${tx_ref}`,
        channel: 'FLUTTERWAVE',
        transactionId: String(data.id),
        paymentGatewayResponse: data,
        seasonId: seasonId,
        description: "School Fee Payment", 
    };

    const paymentReceipt = await prisma.paymentReceipt.create({ data: paymentReceiptData });

    await prisma.schoolFee.update({
        where: { id: schoolFeeRecord.id },
        data: {
            amountPaid: { increment: data.amount },
            paymentStatus: 'PAID'
        }
    });

    return paymentReceipt;
};

// --- DELETE INCOMPLETE PAYMENT BY REFERENCE ---
export const deleteIncompleteSchoolFeePaymentByRef = async (reference) => {
    try {
        await prisma.paymentReceipt.deleteMany({
            where: {
                paymentReference: reference,
                paymentStatus: 'PENDING',
            },
        });
    } catch (error) {
        console.error("[SCHOOL_FEE_SERVICE] deleteIncompleteSchoolFeePaymentByRef:", error);
        throw new AppError("Could not delete incomplete payment record.", 500);
    }
};

export const deletePendingSchoolFeeRecord = async (schoolFeeId) => {
    const pSchoolFeeId = parseInt(schoolFeeId, 10);

    if (isNaN(pSchoolFeeId)) {
        throw new AppError('Invalid School Fee ID.', 400);
    }

    const result = await prisma.$transaction(async (tx) => {
        const schoolFee = await tx.schoolFee.findUnique({
            where: { id: pSchoolFeeId },
            include: {
                payments: true 
            }
        });

        if (!schoolFee) {
            throw new AppError('School Fee record not found.', 404);
        }

        if (schoolFee.paymentStatus !== PaymentStatus.PENDING) {
            throw new AppError(`Cannot delete School Fee record. Its status is '${schoolFee.paymentStatus}', not 'PENDING'.`, 400);
        }

        const hasSuccessfulPayments = schoolFee.payments.some(
            payment => payment.paymentStatus === PaymentStatus.PAID || payment.paymentStatus === PaymentStatus.PARTIAL
        );

        if (hasSuccessfulPayments) {
            throw new AppError(`Cannot delete School Fee record. It has associated PAID or PARTIAL payment receipts.`, 400);
        }

        const deletedReceipts = await tx.paymentReceipt.deleteMany({
            where: {
                schoolFeeId: pSchoolFeeId,
                paymentStatus: PaymentStatus.PENDING,
            }
        });
        console.log(`[Admin Cleanup] Deleted ${deletedReceipts.count} pending payment receipts for School Fee ID: ${pSchoolFeeId}.`);

        await tx.schoolFee.delete({
            where: { id: pSchoolFeeId },
        });
        console.log(`[Admin Cleanup] Deleted pending School Fee record ID: ${pSchoolFeeId}.`);

        return { message: `Pending School Fee record ${pSchoolFeeId} and its associated pending payments deleted successfully.` };
    });

    return result;
};