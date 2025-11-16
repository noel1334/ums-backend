// src/services/hostelBooking.service.js
import axios from 'axios';
import Stripe from 'stripe';
import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import config from '../config/index.js';
import { BookingPaymentStatus, PaymentStatus, PaymentChannel, Gender} from '../generated/prisma/index.js';

const stripe = new Stripe(config.strip);

const generatePaymentReference = () => {
    const now = new Date();
    return `UMS-HB-${now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
};

async function getApplicableHostelFeeDetails(studentId, hostelId, roomId, seasonId) {
    const student = await prisma.student.findUnique({
        where: { id: studentId },
        select: { studentDetails: { select: { gender: true } } }
    });
    if (!student || !student.studentDetails || !student.studentDetails.gender) {
        throw new AppError('Student details or gender information is missing.', 400);
    }
    const studentGender = student.studentDetails.gender;
    let hostelFee = await prisma.hostelFeeList.findFirst({
        where: { hostelId: hostelId, roomId: roomId, seasonId: seasonId, isActive: true, hostel: { OR: [{ gender: null }, { gender: studentGender }] } },
        orderBy: { createdAt: 'desc' }
    });
    if (hostelFee) return { amount: hostelFee.amount, hostelFeeListId: hostelFee.id };
    hostelFee = await prisma.hostelFeeList.findFirst({
        where: { hostelId: hostelId, roomId: null, seasonId: seasonId, isActive: true, hostel: { OR: [{ gender: null }, { gender: studentGender }] } },
        orderBy: { createdAt: 'desc' }
    });
    if (hostelFee) return { amount: hostelFee.amount, hostelFeeListId: hostelFee.id };
    throw new AppError('No applicable hostel fee configured for the selected hostel, room, and season.', 404);
}

const bookingPublicSelection = {
    id: true, checkInDate: true, checkOutDate: true, isActive: true,
    amountDue: true, amountPaid: true, paymentStatus: true, paymentDeadline: true,
    createdAt: true, updatedAt: true,
    hostelFeeListId: true,
    hostelFeeListItem: {
        select: {
            id: true, amount: true, description: true, isActive: true
        }
    },
    student: { select: { id: true, regNo: true, name: true, email: true } },
    hostel: { select: { id: true, name: true } },
    room: { select: { id: true, roomNumber: true, capacity: true } },
    season: { select: { id: true, name: true } },
    payments: {
        select: {
            id: true,
            amountPaid: true,
            paymentStatus: true,
            reference: true,
            channel: true,
            transactionId: true,
            paymentDate: true,
        }
    },
};

// --- MODIFIED: validateAndPrepareHostelBooking with dynamic capacity check ---
export const validateAndPrepareHostelBooking = async (bookingData, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const { hostelId, roomId, seasonId, checkInDate, checkOutDate, paymentDeadline } = bookingData;
        const { id: studentId } = requestingUser;

        if (!hostelId || !roomId || !seasonId) {
            throw new AppError('Hostel, Room, and Season are required.', 400);
        }
        const pStudentId = parseInt(studentId, 10),
              pHostelId = parseInt(hostelId, 10),
              pRoomId = parseInt(roomId, 10),
              pSeasonId = parseInt(seasonId, 10);
        
        if (isNaN(pStudentId) || isNaN(pHostelId) || isNaN(pRoomId) || isNaN(pSeasonId)) {
            throw new AppError('Invalid ID format.', 400);
        }

        const [student, hostel, room, season] = await Promise.all([
            prisma.student.findUnique({
                where: { id: pStudentId, isActive: true, isGraduated: false },
                select: { id: true, regNo: true, name: true, email: true, studentDetails: { select: { gender: true } } }
            }).then(s => { if (!s) throw new AppError('Student not found/inactive/graduated.', 404); return s; }),
            prisma.hostel.findUnique({ where: { id: pHostelId } }).then(h => { if (!h) throw new AppError('Hostel not found.', 404); return h; }),
            prisma.hostelRoom.findUnique({ where: { id: pRoomId, hostelId: pHostelId } }).then(r => { if (!r) throw new AppError('Room not found in specified hostel.', 404); return r; }),
            prisma.season.findUnique({ where: { id: pSeasonId, isActive: true } }).then(s => { if (!s) throw new AppError('Season not found or inactive for booking.', 404); return s; }),
        ]);

        // --- NEW/MODIFIED: Room Availability Check ---
        if (!room.isAvailable) { // Check physical availability
             throw new AppError('Selected room is physically not available for booking.', 409);
        }

        // Count current active bookings for this room and season
        const currentOccupancy = await prisma.hostelBooking.count({
            where: {
                roomId: pRoomId,
                seasonId: pSeasonId,
                paymentStatus: BookingPaymentStatus.PAID, // Only count PAID bookings
                isActive: true, // Only count active bookings
            },
        });

        if (currentOccupancy >= room.capacity) {
            throw new AppError(`Room ${room.roomNumber} in ${hostel.name} is fully booked for ${season.name} session. It has reached its capacity of ${room.capacity}.`, 409);
        }
        // --- END NEW/MODIFIED CAPACITY CHECK ---


        // Crucial: Check for existing *active* or *pending* bookings for this student/season
        const existingBooking = await prisma.hostelBooking.findFirst({
            where: {
                studentId: pStudentId,
                seasonId: pSeasonId,
                OR: [
                    { paymentStatus: BookingPaymentStatus.PENDING },
                    { paymentStatus: BookingPaymentStatus.PAID },
                ],
                isActive: true
            }
        });
        
        if (existingBooking) {
            throw new AppError('You have an existing active or pending booking for this season. Please complete or resolve it.', 409);
        }

        const schoolFeePaid = await prisma.schoolFee.findFirst({
            where: {
                studentId: pStudentId,
                seasonId: pSeasonId,
                paymentStatus: PaymentStatus.PAID,
            },
        });

        if (!schoolFeePaid) {
            throw new AppError('You must pay your school fees for this season before booking a hostel.', 403);
        }

        const { amount: amountDue, hostelFeeListId } = await getApplicableHostelFeeDetails(pStudentId, pHostelId, pRoomId, pSeasonId);

        return {
            studentId: pStudentId,
            hostelId: pHostelId,
            roomId: pRoomId,
            seasonId: pSeasonId,
            hostelFeeListId: hostelFeeListId,
            amountDue: amountDue,
            studentEmail: student.email,
            studentName: student.name,
            checkInDate: checkInDate ? new Date(checkInDate) : null,
            checkOutDate: checkOutDate ? new Date(checkOutDate) : null,
            paymentDeadline: paymentDeadline ? new Date(paymentDeadline) : null,
        };

    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2002') throw new AppError('Booking conflict (e.g., student already booked for this season with these parameters).', 409);
        console.error("UNEXPECTED BACKEND ERROR IN validateAndPrepareHostelBooking:", error.message, error.stack);
        throw new AppError(error.message || 'Could not prepare hostel booking due to an unexpected server error.', 500);
    }
};

// --- MODIFIED: initializeHostelBookingStripePayment - Capacity check ---
export const initializeHostelBookingStripePayment = async (bookingDetails, userDetails, paymentChannel) => {
    const { studentId, hostelId, roomId, seasonId, hostelFeeListId, amountDue, checkInDate, checkOutDate, paymentDeadline } = bookingDetails;
    const { email, name } = userDetails;

    // Last-minute re-check of room capacity right before creating Stripe session
    const room = await prisma.hostelRoom.findUnique({ where: { id: roomId } });
    if (!room) {
        throw new AppError('Selected room not found. Please restart the booking process.', 404);
    }
    if (!room.isAvailable) { // Check physical availability
        throw new AppError('Selected room is physically not available for booking. Please restart the booking process.', 409);
    }
    const currentOccupancy = await prisma.hostelBooking.count({
        where: {
            roomId: roomId,
            seasonId: seasonId,
            paymentStatus: BookingPaymentStatus.PAID,
            isActive: true,
        },
    });
    if (currentOccupancy >= room.capacity) {
        throw new AppError(`Room ${room.roomNumber} is now fully booked for this season. Please select another room.`, 409);
    }


    if (amountDue < 100) throw new Error("Amount must be at least NGN 100 for Stripe.");
    const generatedPaymentRef = generatePaymentReference();

    const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [{
            price_data: { currency: "ngn", product_data: { name: "Hostel Booking Payment" }, unit_amount: Math.round(amountDue * 100), },
            quantity: 1,
        }],
        mode: "payment",
        customer_email: email,
        metadata: {
            paymentReference: generatedPaymentRef,
            studentId: String(studentId),
            hostelId: String(hostelId),
            roomId: String(roomId),
            seasonId: String(seasonId),
            hostelFeeListId: String(hostelFeeListId),
            amountDue: String(amountDue),
            checkInDate: checkInDate ? checkInDate.toISOString() : '',
            checkOutDate: checkOutDate ? checkOutDate.toISOString() : '',
            paymentDeadline: paymentDeadline ? paymentDeadline.toISOString() : '',
            paymentPurpose: "HostelBooking",
        },
        success_url: `${config.studentPortalUrl}/payment-status?session_id={CHECKOUT_SESSION_ID}&purpose=hostelBooking`,
        cancel_url: `${config.studentPortalUrl}/payment-status?status=cancelled&purpose=hostelBooking`,
    });

    return { sessionId: session.id, reference: generatedPaymentRef };
};

// --- MODIFIED: completeHostelBookingStripePayment - Capacity check & no isAvailable update ---
export const completeHostelBookingStripePayment = async (sessionId) => {
    try {
        console.log(`[Stripe Completion] Attempting to complete Stripe payment for session ID: ${sessionId}`);
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        if (!session.metadata) {
            console.error(`[Stripe Completion] Session metadata missing for session ID: ${sessionId}`);
            throw new AppError("Session metadata missing. Cannot complete payment.", 400);
        }

        const { paymentReference, studentId, hostelId, roomId, seasonId, hostelFeeListId, amountDue: metadataAmountDueStr, paymentPurpose, checkInDate, checkOutDate, paymentDeadline } = session.metadata;

        const pStudentId = parseInt(studentId, 10);
        const pHostelId = parseInt(hostelId, 10);
        const pRoomId = parseInt(roomId, 10);
        const pSeasonId = parseInt(seasonId, 10);
        // Correctly handle optional hostelFeeListId which might be 'null' or empty string from metadata
        const pHostelFeeListId = hostelFeeListId && hostelFeeListId !== 'null' && hostelFeeListId !== '' ? parseInt(hostelFeeListId, 10) : null;
        const metadataAmountDue = parseFloat(metadataAmountDueStr);

        if (isNaN(pStudentId) || isNaN(pHostelId) || isNaN(pRoomId) || isNaN(pSeasonId) || isNaN(metadataAmountDue) || !paymentReference || paymentPurpose !== "HostelBooking" || (hostelFeeListId && (hostelFeeListId !== 'null' && hostelFeeListId !== '') && isNaN(pHostelFeeListId))) {
            console.error("[Stripe Completion] Missing or invalid required metadata for HostelBooking completion:", session.metadata);
            // Re-check specific invalid case for better logging
            if (hostelFeeListId && (hostelFeeListId !== 'null' && hostelFeeListId !== '') && isNaN(pHostelFeeListId)) {
                 console.error("[Stripe Completion] Invalid hostelFeeListId in metadata:", hostelFeeListId);
                 throw new AppError("Required metadata for Hostel Booking is missing or invalid from the session (e.g., hostelFeeListId).", 400);
            }
            throw new AppError("Required metadata for Hostel Booking is missing or invalid from the session.", 400);
        }

        if (session.payment_status !== "paid") {
            console.warn(`[Stripe Completion] Session ${sessionId} was not paid. Status: ${session.payment_status}.`);
            throw new AppError(`Payment not completed. Status: ${session.payment_status}`, 400);
        }

        const actualPaidAmount = session.amount_total / 100;

        if (actualPaidAmount < metadataAmountDue) {
            console.error(`[Stripe Completion] Amount mismatch: Expected ${metadataAmountDue}, Paid ${actualPaidAmount} for session ${sessionId}`);
            throw new AppError("Payment amount mismatch with expected booking amount.", 400);
        }

        const transactionId = session.payment_intent || sessionId;
        const existingPaymentReceipt = await prisma.paymentReceipt.findFirst({
            where: { transactionId: transactionId, channel: PaymentChannel.STRIPE },
        });
        if (existingPaymentReceipt) {
            console.log(`[Stripe Completion] Transaction ${transactionId} already processed. Returning existing receipt.`);
            const associatedBooking = await prisma.hostelBooking.findUnique({ where: { id: existingPaymentReceipt.hostelBookingId } });
            return { ...existingPaymentReceipt, hostelBooking: associatedBooking };
        }

        const existingPaidBooking = await prisma.hostelBooking.findFirst({
            where: {
                studentId: pStudentId,
                seasonId: pSeasonId,
                paymentStatus: BookingPaymentStatus.PAID,
                isActive: true
            }
        });
        if (existingPaidBooking) {
            console.warn(`[Stripe Completion] Student ${pStudentId} already has an existing PAID booking for season ${pSeasonId}. Preventing duplicate booking creation for session ${sessionId}.`);
            throw new AppError('An active, paid booking for this student and season already exists. Please check your bookings.', 409);
        }

        // --- NEW/MODIFIED: Final Room Capacity Check before booking creation ---
        const room = await prisma.hostelRoom.findUnique({ where: { id: pRoomId } });
        if (!room) {
             throw new AppError('Selected room not found during final capacity check.', 404);
        }
        if (!room.isAvailable) { // Check physical availability
             throw new AppError('Selected room is physically not available for booking.', 409);
        }

        const currentOccupancy = await prisma.hostelBooking.count({
            where: {
                roomId: pRoomId,
                seasonId: pSeasonId,
                paymentStatus: BookingPaymentStatus.PAID,
                isActive: true,
            },
        });
        if (currentOccupancy >= room.capacity) {
            console.error(`[Stripe Completion] Room ${room.roomNumber} is now fully booked for season ${pSeasonId} during payment completion for session ${sessionId}.`);
            throw new AppError(`The selected room is now fully booked for this season. Payment may have been processed but booking could not be finalized.`, 409);
        }
        // --- END NEW/MODIFIED CAPACITY CHECK ---


        // --- DATABASE TRANSACTION ---
        const transactions = await prisma.$transaction(async (tx) => {
            const newHostelBooking = await tx.hostelBooking.create({
                data: {
                    studentId: pStudentId,
                    hostelId: pHostelId,
                    roomId: pRoomId,
                    seasonId: pSeasonId,
                    hostelFeeListId: pHostelFeeListId,
                    checkInDate: checkInDate ? new Date(checkInDate) : null,
                    checkOutDate: checkOutDate ? new Date(checkOutDate) : null,
                    paymentDeadline: paymentDeadline ? new Date(paymentDeadline) : null,
                    amountDue: metadataAmountDue,
                    amountPaid: actualPaidAmount,
                    paymentStatus: BookingPaymentStatus.PAID,
                    isActive: true,
                },
                select: bookingPublicSelection
            });
            console.log(`[Stripe Completion] Created HostelBooking ${newHostelBooking.id} for session ${sessionId}.`);

            const paymentReceiptData = {
                studentId: pStudentId,
                hostelBookingId: newHostelBooking.id,
                amountExpected: metadataAmountDue,
                amountPaid: actualPaidAmount,
                paymentStatus: PaymentStatus.PAID,
                reference: paymentReference,
                channel: PaymentChannel.STRIPE,
                transactionId: transactionId,
                paymentGatewayResponse: session,
                seasonId: pSeasonId,
            };
            const newPaymentReceipt = await tx.paymentReceipt.create({ data: paymentReceiptData });
            console.log(`[Stripe Completion] Created PaymentReceipt ${newPaymentReceipt.id} for session ${sessionId}.`);

            return { newPaymentReceipt, newHostelBooking };
        });

        const { newPaymentReceipt, newHostelBooking } = transactions;
        return { ...newPaymentReceipt, hostelBooking: newHostelBooking };

    } catch (error) {
        if (error instanceof AppError) {
            console.error(`[Stripe Completion] AppError during completion for session ${sessionId}: ${error.message}`, error);
            throw error;
        }
        console.error(`[Stripe Completion] UNEXPECTED SERVER ERROR during completion for session ${sessionId}:`, error.message, error.stack);
        throw new AppError(error.message || 'An unexpected error occurred during Stripe payment completion.', 500);
    }
};

// --- MODIFIED: VERIFY PAYSTACK PAYMENT - Capacity check & no isAvailable update ---
export const verifyPaystackHostelBookingPayment = async (gatewayReference, bookingDetails) => {
    try {
        console.log(`[Paystack Verification] Verifying Paystack payment for reference: ${gatewayReference}`);
        const { studentId, hostelId, roomId, seasonId, hostelFeeListId, amountDue, checkInDate, checkOutDate, paymentDeadline } = bookingDetails;

        const response = await axios.get(`https://api.paystack.co/transaction/verify/${gatewayReference}`, {
            headers: { Authorization: `Bearer ${config.paystack}` },
        });
        const { data } = response.data;
        if (data.status !== "success") {
            console.error(`[Paystack Verification] Verification failed for reference ${gatewayReference}. Status: ${data.status}`);
            throw new AppError("Paystack payment verification failed.", 400);
        }

        const paidAmountKobo = data.amount;
        const expectedAmountKobo = Math.round(amountDue * 100);
        if (paidAmountKobo < expectedAmountKobo) {
            console.error(`[Paystack Verification] Amount mismatch for reference ${gatewayReference}: Expected ${expectedAmountKobo}, Paid ${paidAmountKobo}`);
            throw new AppError(`Paystack verification failed: Amount mismatch.`, 400);
        }
        const actualPaidAmount = paidAmountKobo / 100;

        const existingPaymentReceipt = await prisma.paymentReceipt.findFirst({
            where: { transactionId: data.reference, channel: PaymentChannel.PAYSTACK },
        });
        if (existingPaymentReceipt) {
            console.log(`[Paystack Verification] Transaction ${data.reference} already processed. Returning existing receipt.`);
            const associatedBooking = await prisma.hostelBooking.findUnique({ where: { id: existingPaymentReceipt.hostelBookingId } });
            return { ...existingPaymentReceipt, hostelBooking: associatedBooking };
        }

        const existingPaidBooking = await prisma.hostelBooking.findFirst({
            where: {
                studentId: studentId,
                seasonId: seasonId,
                paymentStatus: BookingPaymentStatus.PAID,
                isActive: true
            }
        });
        if (existingPaidBooking) {
            console.warn(`[Paystack Verification] Student ${studentId} already has an existing PAID booking for season ${seasonId}. Preventing duplicate booking creation for reference ${gatewayReference}.`);
            throw new AppError('An active, paid booking for this student and season already exists. Please check your bookings.', 409);
        }

        // --- NEW/MODIFIED: Final Room Capacity Check before booking creation ---
        const room = await prisma.hostelRoom.findUnique({ where: { id: roomId } });
        if (!room) {
             throw new AppError('Selected room not found during final capacity check.', 404);
        }
        if (!room.isAvailable) { // Check physical availability
             throw new AppError('Selected room is physically not available for booking.', 409);
        }
        const currentOccupancy = await prisma.hostelBooking.count({
            where: {
                roomId: roomId,
                seasonId: seasonId,
                paymentStatus: BookingPaymentStatus.PAID,
                isActive: true,
            },
        });
        if (currentOccupancy >= room.capacity) {
            console.error(`[Paystack Verification] Room ${room.roomNumber} is now fully booked for season ${seasonId} during payment verification for reference ${gatewayReference}.`);
            throw new AppError(`The selected room is now fully booked for this season. Payment may have been processed but booking could not be finalized.`, 409);
        }
        // --- END NEW/MODIFIED CAPACITY CHECK ---

        // --- DATABASE TRANSACTION ---
        const transactions = await prisma.$transaction(async (tx) => {
            const newHostelBooking = await tx.hostelBooking.create({
                data: {
                    studentId: studentId,
                    hostelId: hostelId,
                    roomId: roomId,
                    seasonId: seasonId,
                    hostelFeeListId: hostelFeeListId,
                    checkInDate: checkInDate ? new Date(checkInDate) : null,
                    checkOutDate: checkOutDate ? new Date(checkOutDate) : null,
                    paymentDeadline: paymentDeadline ? new Date(paymentDeadline) : null,
                    amountDue: amountDue,
                    amountPaid: actualPaidAmount,
                    paymentStatus: BookingPaymentStatus.PAID,
                    isActive: true,
                },
                select: bookingPublicSelection
            });
            console.log(`[Paystack Verification] Created HostelBooking ${newHostelBooking.id} for reference ${gatewayReference}.`);

            const paymentReceiptData = {
                studentId: studentId,
                hostelBookingId: newHostelBooking.id,
                amountExpected: amountDue,
                amountPaid: actualPaidAmount,
                paymentStatus: PaymentStatus.PAID,
                reference: generatePaymentReference(),
                channel: PaymentChannel.PAYSTACK,
                transactionId: data.reference,
                paymentGatewayResponse: data,
                seasonId: seasonId,
            };
            const newPaymentReceipt = await tx.paymentReceipt.create({ data: paymentReceiptData });
            console.log(`[Paystack Verification] Created PaymentReceipt ${newPaymentReceipt.id} for reference ${gatewayReference}.`);

            return { newPaymentReceipt, newHostelBooking };
        });

        const { newPaymentReceipt, newHostelBooking } = transactions;
        return { ...newPaymentReceipt, hostelBooking: newHostelBooking };

    } catch (error) {
        if (error instanceof AppError) {
            console.error(`[Paystack Verification] AppError during verification for reference ${gatewayReference}: ${error.message}`, error);
            throw error;
        }
        console.error(`[Paystack Verification] UNEXPECTED SERVER ERROR during verification for reference ${gatewayReference}:`, error.message, error.stack);
        throw new AppError(error.message || 'An unexpected error occurred during Paystack payment verification.', 500);
    }
};

// --- MODIFIED: VERIFY FLUTTERWAVE PAYMENT - Capacity check & no isAvailable update ---
export const verifyFlutterwaveHostelBookingPayment = async (transactionId, tx_ref, bookingDetails) => {
    try {
        console.log(`[Flutterwave Verification] Verifying Flutterwave payment for transaction ID: ${transactionId}, tx_ref: ${tx_ref}`);
        const { studentId, hostelId, roomId, seasonId, hostelFeeListId, amountDue, checkInDate, checkOutDate, paymentDeadline } = bookingDetails;

        const response = await axios.get(`https://api.flutterwave.com/v3/transactions/${transactionId}/verify`, {
            headers: { Authorization: `Bearer ${config.flutterwave.secretKey}` },
        });
        const { data } = response.data;

        const isAmountMatch = parseFloat(data.amount) === parseFloat(amountDue);
        if (
            data.status !== "successful" ||
            data.tx_ref.trim() !== tx_ref.trim() ||
            !isAmountMatch
        ) {
            console.error(`[Flutterwave Verification] Verification failed for transaction ID ${transactionId}, tx_ref ${tx_ref}: Mismatch in transaction details.`, {
                expected: { tx_ref: tx_ref, amount: amountDue, status: "successful" },
                received: { tx_ref: data.tx_ref, amount: data.amount, status: data.status },
            });
            throw new AppError("Flutterwave verification failed. Details do not match.", 400);
        }
        const actualPaidAmount = parseFloat(data.amount);

        const existingPaymentReceipt = await prisma.paymentReceipt.findFirst({
            where: { transactionId: String(data.id), channel: PaymentChannel.FLUTTERWAVE },
        });
        if (existingPaymentReceipt) {
            console.log(`[Flutterwave Verification] Transaction ${data.id} already processed. Returning existing receipt.`);
            const associatedBooking = await prisma.hostelBooking.findUnique({ where: { id: existingPaymentReceipt.hostelBookingId } });
            return { ...existingPaymentReceipt, hostelBooking: associatedBooking };
        }

        const existingPaidBooking = await prisma.hostelBooking.findFirst({
            where: {
                studentId: studentId,
                seasonId: seasonId,
                paymentStatus: BookingPaymentStatus.PAID,
                isActive: true
            }
        });
        if (existingPaidBooking) {
            console.warn(`[Flutterwave Verification] Student ${studentId} already has an existing PAID booking for season ${seasonId}. Preventing duplicate booking creation for transaction ID ${transactionId}.`);
            throw new AppError('An active, paid booking for this student and season already exists. Please check your bookings.', 409);
        }

        // --- NEW/MODIFIED: Final Room Capacity Check before booking creation ---
        const room = await prisma.hostelRoom.findUnique({ where: { id: roomId } });
        if (!room) {
             throw new AppError('Selected room not found during final capacity check.', 404);
        }
        if (!room.isAvailable) { // Check physical availability
             throw new AppError('Selected room is physically not available for booking.', 409);
        }
        const currentOccupancy = await prisma.hostelBooking.count({
            where: {
                roomId: roomId,
                seasonId: seasonId,
                paymentStatus: BookingPaymentStatus.PAID,
                isActive: true,
            },
        });
        if (currentOccupancy >= room.capacity) {
            console.error(`[Flutterwave Verification] Room ${room.roomNumber} is now fully booked for season ${seasonId} during payment verification for transaction ID ${transactionId}.`);
            throw new AppError(`The selected room is now fully booked for this season. Payment may have been processed but booking could not be finalized.`, 409);
        }
        // --- END NEW/MODIFIED CAPACITY CHECK ---

        // --- DATABASE TRANSACTION ---
        const transactions = await prisma.$transaction(async (tx) => {
            const newHostelBooking = await tx.hostelBooking.create({
                data: {
                    studentId: studentId,
                    hostelId: hostelId,
                    roomId: roomId,
                    seasonId: seasonId,
                    hostelFeeListId: hostelFeeListId,
                    checkInDate: checkInDate ? new Date(checkInDate) : null,
                    checkOutDate: checkOutDate ? new Date(checkOutDate) : null,
                    paymentDeadline: paymentDeadline ? new Date(paymentDeadline) : null,
                    amountDue: amountDue,
                    amountPaid: actualPaidAmount,
                    paymentStatus: BookingPaymentStatus.PAID,
                    isActive: true,
                },
                select: bookingPublicSelection
            });
            console.log(`[Flutterwave Verification] Created HostelBooking ${newHostelBooking.id} for transaction ID ${transactionId}.`);

            const paymentReceiptData = {
                studentId: studentId,
                hostelBookingId: newHostelBooking.id,
                amountExpected: amountDue,
                amountPaid: actualPaidAmount,
                paymentStatus: PaymentStatus.PAID,
                reference: `UMS-${tx_ref}`,
                channel: PaymentChannel.FLUTTERWAVE,
                transactionId: String(data.id),
                paymentGatewayResponse: data,
                seasonId: seasonId,
            };
            const newPaymentReceipt = await tx.paymentReceipt.create({ data: paymentReceiptData });
            console.log(`[Flutterwave Verification] Created PaymentReceipt ${newPaymentReceipt.id} for transaction ID ${transactionId}.`);

            return { newPaymentReceipt, newHostelBooking };
        });

        const { newPaymentReceipt, newHostelBooking } = transactions;
        return { ...newPaymentReceipt, hostelBooking: newHostelBooking };

    } catch (error) {
        if (error instanceof AppError) {
            console.error(`[Flutterwave Verification] AppError during verification for transaction ID ${transactionId}: ${error.message}`, error);
            throw error;
        }
        console.error(`[Flutterwave Verification] UNEXPECTED SERVER ERROR during verification for transaction ID ${transactionId}:`, error.message, error.stack);
        throw new AppError(error.message || 'An unexpected error occurred during Flutterwave payment verification.', 500);
    }
};


// --- MODIFIED: cancelHostelBooking - also removes payment receipts ---
export const cancelHostelBooking = async (bookingId, requestingUser) => {
    try {
        const pBookingId = parseInt(bookingId, 10);
        if (isNaN(pBookingId)) throw new AppError('Invalid booking ID.', 400);

        const booking = await prisma.hostelBooking.findUnique({
            where: { id: pBookingId },
            select: { studentId: true, paymentStatus: true, roomId: true, isActive: true, student: { select: { id: true } }, seasonId: true }
        });

        if (!booking) throw new AppError('Hostel booking not found.', 404);

        if (requestingUser.role === 'student' && booking.student.id !== requestingUser.id) {
            throw new AppError('You are not authorized to cancel this booking.', 403);
        }

        if (booking.paymentStatus === BookingPaymentStatus.PAID) {
            console.log(`[Cancel Booking] User ${requestingUser.id} cancelling PAID booking ${pBookingId}. Marking as cancelled and freeing up spot.`);
        } else if (booking.paymentStatus === BookingPaymentStatus.PENDING) {
             console.log(`[Cancel Booking] User ${requestingUser.id} cancelling PENDING booking ${pBookingId}.`);
        } else {
             throw new AppError('Booking cannot be cancelled in its current state.', 400);
        }

        const result = await prisma.$transaction(async (tx) => {
            const updatedBooking = await tx.hostelBooking.update({
                where: { id: pBookingId },
                data: { paymentStatus: BookingPaymentStatus.CANCELLED, isActive: false },
            });

            await tx.paymentReceipt.deleteMany({
                where: { hostelBookingId: pBookingId, paymentStatus: PaymentStatus.PENDING, },
            });
            return updatedBooking;
        });
        return result;

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("UNEXPECTED BACKEND ERROR IN cancelHostelBooking:", error.message, error.stack);
        throw new AppError(error.message || 'Could not cancel hostel booking due to an unexpected server error.', 500);
    }
};

// --- Existing Placeholder Service Functions (Retained) ---
export const getHostelBookingById = async (bookingId, user) => {
    const pBookingId = parseInt(bookingId, 10);
    if (isNaN(pBookingId)) throw new AppError('Invalid booking ID.', 400);

    const booking = await prisma.hostelBooking.findUnique({
        where: { id: pBookingId },
        select: bookingPublicSelection
    });
    if (!booking) throw new AppError('Hostel booking not found.', 404);

    if (user.role === 'student' && booking.student.id !== user.id) {
        throw new AppError('Not authorized to view this booking.', 403);
    }
    return booking;
};

export const getAllHostelBookings = async (query, user) => {
    const { page = 1, limit = 10, search, status, ...filters } = query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = { AND: [] };
    if (status) where.AND.push({ paymentStatus: status });
    if (search) {
        where.AND.push({
            OR: [
                { student: { name: { contains: search, mode: 'insensitive' } } },
                { student: { regNo: { contains: search, mode: 'insensitive' } } },
                { hostel: { name: { contains: search, mode: 'insensitive' } } },
                { room: { roomNumber: { contains: search, mode: 'insensitive' } } },
            ],
        });
    }
    for (const key in filters) {
        if (filters.hasOwnProperty(key)) {
            if (['hostelId', 'roomId', 'seasonId'].includes(key)) {
                where.AND.push({ [key]: parseInt(filters[key]) });
            } else {
                where.AND.push({ [key]: filters[key] });
            }
        }
    }
    if (where.AND.length === 0) delete where.AND;

    const [bookings, totalBookings] = await prisma.$transaction([
        prisma.hostelBooking.findMany({
            where, skip, take: parseInt(limit), select: bookingPublicSelection, orderBy: { createdAt: 'desc' },
        }),
        prisma.hostelBooking.count({ where }),
    ]);
    return { bookings, totalPages: Math.ceil(totalBookings / parseInt(limit)), currentPage: parseInt(page), totalBookings, };
};

export const getMyHostelBookings = async (user, query) => {
    const studentId = user.id;
    const { page = 1, limit = 10, status } = query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = { studentId: studentId, AND: [] };
    if (status) where.AND.push({ paymentStatus: status });
    if (where.AND.length === 0) delete where.AND;

    const [bookings, totalBookings] = await prisma.$transaction([
        prisma.hostelBooking.findMany({
            where, skip, take: parseInt(limit), select: bookingPublicSelection, orderBy: { createdAt: 'desc' },
        }),
        prisma.hostelBooking.count({ where }),
    ]);
    return { bookings, totalPages: Math.ceil(totalBookings / parseInt(limit)), currentPage: parseInt(page), totalBookings, };
};

export const updateHostelBookingStatus = async (bookingId, updateBody, user) => {
    if (user.role !== 'admin' && user.role !== 'ictstaff') {
        throw new AppError('Unauthorized to update booking status.', 403);
    }
    const pBookingId = parseInt(bookingId, 10);
    if (isNaN(pBookingId)) throw new AppError('Invalid booking ID.', 400);
    const booking = await prisma.hostelBooking.findUnique({ where: { id: pBookingId }, select: { id: true } });
    if (!booking) throw new AppError('Hostel booking not found.', 404);
    const updatedBooking = await prisma.hostelBooking.update({ where: { id: pBookingId }, data: updateBody, select: bookingPublicSelection });
    return updatedBooking;
};

// This function remains as is, as its scope is different (school fees)
export const deleteIncompleteSchoolFeePaymentByRef = async (reference) => {
    try {
        await prisma.paymentReceipt.deleteMany({
            where: { reference: reference, paymentStatus: 'PENDING', },
        });
    } catch (error) {
        console.error("[PAYMENT_RECEIPT_SERVICE] deleteIncompletePaymentByRef:", error);
        throw new AppError("Could not delete incomplete payment record.", 500);
    }
};

// --- NEW FUNCTION: getRoommatesForStudentBooking ---
export const getRoommatesForStudentBooking = async (studentId, seasonId) => {
    const pStudentId = parseInt(studentId, 10);
    const pSeasonId = parseInt(seasonId, 10);

    if (isNaN(pStudentId) || isNaN(pSeasonId)) {
        throw new AppError('Invalid Student ID or Season ID for roommates lookup.', 400);
    }

    // 1. Find the current student's active booking for the given season
    const studentBooking = await prisma.hostelBooking.findFirst({
        where: {
            studentId: pStudentId,
            seasonId: pSeasonId,
            paymentStatus: BookingPaymentStatus.PAID,
            isActive: true,
        },
        select: {
            roomId: true,
            id: true, // Need this to ensure we don't accidentally fetch the current student's booking again
        },
    });

    if (!studentBooking) {
        return []; // Student has no active booking for this season, so no roommates.
    }

    // 2. Find other students in the same room for the same season
    const roommateBookings = await prisma.hostelBooking.findMany({
        where: {
            roomId: studentBooking.roomId,
            seasonId: pSeasonId,
            paymentStatus: BookingPaymentStatus.PAID,
            isActive: true,
            NOT: {
                studentId: pStudentId, // Exclude the current student from the roommate list
            },
        },
        select: {
            student: { // Select only relevant student details for roommates
                select: {
                    id: true,
                    name: true,
                    regNo: true,
                    // Add other fields if needed, e.g., 'email', 'studentDetails: { select: { gender: true } }'
                },
            },
        },
    });

    // Extract just the student objects from the bookings
    const roommates = roommateBookings.map(booking => booking.student);

    return roommates;
};

// --- NEW FUNCTION: deletePendingPaymentRecord (with optional booking cancellation) ---
export const deletePendingPaymentRecord = async (paymentReceiptId) => {
    const pPaymentReceiptId = parseInt(paymentReceiptId, 10);

    if (isNaN(pPaymentReceiptId)) {
        throw new AppError('Invalid Payment Receipt ID.', 400);
    }

    const result = await prisma.$transaction(async (tx) => {
        // Find the payment receipt to ensure it's PENDING and get its associated booking ID
        const paymentReceipt = await tx.paymentReceipt.findUnique({
            where: { id: pPaymentReceiptId },
            select: { id: true, paymentStatus: true, hostelBookingId: true, transactionId: true, channel: true }
        });

        if (!paymentReceipt) {
            throw new AppError('Payment record not found.', 404);
        }

        if (paymentReceipt.paymentStatus !== PaymentStatus.PENDING) {
            throw new AppError(`Cannot delete payment record. Its status is '${paymentReceipt.paymentStatus}', not 'PENDING'.`, 400);
        }

        // Proceed to delete the pending payment receipt
        await tx.paymentReceipt.delete({
            where: { id: pPaymentReceiptId },
        });
        console.log(`[Admin Cleanup] Deleted pending payment receipt ID: ${pPaymentReceiptId}.`);

        let bookingCleanupMessage = '';
        // If this payment receipt was linked to a hostel booking, check if that booking also needs cleanup
        if (paymentReceipt.hostelBookingId) {
            const bookingId = paymentReceipt.hostelBookingId;

            // 1. Check if there are ANY other PENDING payment receipts for this booking
            const otherPendingPaymentsCount = await tx.paymentReceipt.count({
                where: {
                    hostelBookingId: bookingId,
                    paymentStatus: PaymentStatus.PENDING,
                    NOT: { id: pPaymentReceiptId } // Exclude the one we just deleted
                }
            });

            // 2. If this was the last (or only) pending payment for that booking
            if (otherPendingPaymentsCount === 0) {
                // Now, check the status of the associated HostelBooking
                const associatedBooking = await tx.hostelBooking.findUnique({
                    where: { id: bookingId },
                    select: { id: true, paymentStatus: true, isActive: true, roomId: true, seasonId: true }
                });

                // If the booking exists and is still PENDING and active, it means no successful payments went through.
                // It's safe to mark it as CANCELLED.
                if (associatedBooking && associatedBooking.paymentStatus === BookingPaymentStatus.PENDING && associatedBooking.isActive) {
                    await tx.hostelBooking.update({
                        where: { id: bookingId },
                        data: {
                            paymentStatus: BookingPaymentStatus.CANCELLED,
                            isActive: false,
                        }
                    });
                    bookingCleanupMessage = ` Associated HostelBooking ${bookingId} marked as CANCELLED.`;
                    console.log(`[Admin Cleanup] Associated HostelBooking ${bookingId} also cancelled due to last pending payment deletion.`);
                    
                    // Since the booking is now CANCELLED and isActive: false, it will naturally free up a spot
                    // in the dynamic occupancy count for its room and season. No direct HostelRoom update needed.
                } else if (associatedBooking && (associatedBooking.paymentStatus === BookingPaymentStatus.PAID || !associatedBooking.isActive)) {
                    bookingCleanupMessage = ` Associated HostelBooking ${bookingId} is not PENDING (status: ${associatedBooking.paymentStatus}). No automatic cancellation.`;
                    console.log(`[Admin Cleanup] Associated HostelBooking ${bookingId} is not PENDING or not active. No automatic cancellation.`);
                }
            } else {
                bookingCleanupMessage = ` HostelBooking ${bookingId} still has ${otherPendingPaymentsCount} other PENDING payments. No automatic cancellation.`;
                console.log(`[Admin Cleanup] HostelBooking ${bookingId} still has other PENDING payments. No automatic cancellation.`);
            }
        }

        return { message: `Pending payment record ${pPaymentReceiptId} deleted successfully.${bookingCleanupMessage}` };
    });

    return result;
};