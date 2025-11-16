// src/services/payment.service.js
import prisma from '../config/prisma.js'; // ADJUST PATH IF NEEDED
import AppError from '../utils/AppError.js';
import { BookingPaymentStatus, PaymentChannel } from '../generated/prisma/index.js'; // ADJUST PATH IF NEEDED

// Selection for returning payment receipt details
const paymentReceiptPublicSelection = {
    id: true,
    studentId: true,
    hostelBookingId: true,
    schoolFeeId: true,
    amountPaid: true,
    paymentDate: true,
    reference: true,
    channel: true,
    seasonId: true,
    description: true,
    createdAt: true
};

// Selection for returning updated hostel booking details after payment
const hostelBookingAfterPaymentSelection = {
    id: true,
    studentId: true,
    hostelId: true,
    roomId: true,
    seasonId: true,
    amountDue: true,
    amountPaid: true,
    paymentStatus: true,
    paymentDeadline: true,
    isActive: true,
    // Include other relevant fields you want to return
    student: { select: { id: true, name: true, regNo: true } },
    hostel: { select: { id: true, name: true } },
    room: { select: { id: true, roomNumber: true } },
    season: { select: { id: true, name: true } },
};


export const recordHostelPayment = async (paymentData, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);

        const {
            studentId, // Can come from req.user if student is making payment, or body if admin/webhook
            hostelBookingId,
            amountPaid: paymentAmountString, // Amount paid in this specific transaction
            paymentDate,      // Optional, defaults to now
            reference,        // Unique reference for this payment transaction
            channel,          // Optional: e.g., 'ONLINE_GATEWAY', 'BANK_TRANSFER'
            seasonId,         // Should match the hostel booking's season
            description       // Optional description for the payment
        } = paymentData;

        // --- Validation ---
        if (!hostelBookingId || !paymentAmountString || !reference || !seasonId) {
            throw new AppError('Hostel Booking ID, amount paid, reference, and season ID are required.', 400);
        }

        const pStudentId = studentId ? parseInt(studentId, 10) : requestingUser?.id; // Use requestingUser if studentId not in body
        const pHostelBookingId = parseInt(hostelBookingId, 10);
        const pPaymentAmount = parseFloat(paymentAmountString);
        const pSeasonId = parseInt(seasonId, 10);

        if (!pStudentId || isNaN(pStudentId)) throw new AppError('Valid Student ID is required.', 400);
        if (isNaN(pHostelBookingId)) throw new AppError('Invalid Hostel Booking ID format.', 400);
        if (isNaN(pPaymentAmount) || pPaymentAmount <= 0) throw new AppError('Invalid payment amount. Must be positive.', 400);
        if (isNaN(pSeasonId)) throw new AppError('Invalid Season ID format.', 400);

        if (channel && !Object.values(PaymentChannel).includes(channel)) {
            throw new AppError('Invalid payment channel.', 400);
        }

        // Use a transaction to ensure PaymentReceipt creation and HostelBooking update are atomic
        const [newPaymentReceipt, updatedHostelBookingWithBalance] = await prisma.$transaction(async (tx) => {
            // 1. Find the hostel booking
            const booking = await tx.hostelBooking.findUnique({
                where: { id: pHostelBookingId }
            });

            if (!booking) {
                throw new AppError('Hostel booking not found.', 404);
            }
            // Ensure the booking belongs to the student making the payment (if student is the actor)
            if (requestingUser.type === 'student' && booking.studentId !== pStudentId) {
                throw new AppError('This booking does not belong to you.', 403);
            }
            // Or if admin is making it, ensure studentId in body matches booking's studentId
            if (requestingUser.type !== 'student' && booking.studentId !== pStudentId) {
                throw new AppError(`Booking student ID (${booking.studentId}) does not match provided student ID (${pStudentId}).`, 400);
            }

            if (booking.seasonId !== pSeasonId) {
                throw new AppError('Payment season does not match the booking season.', 400);
            }
            if (booking.paymentStatus === BookingPaymentStatus.PAID || booking.paymentStatus === BookingPaymentStatus.CONFIRMED) {
                throw new AppError('This hostel booking is already fully paid or confirmed.', 400);
            }
            if (booking.paymentStatus === BookingPaymentStatus.CANCELLED) {
                throw new AppError('Cannot record payment for a cancelled booking.', 400);
            }
            if (!booking.amountDue) { // Should have been set during booking creation
                throw new AppError('Hostel booking amount due is not set. Cannot process payment.', 500);
            }


            // 2. Create the PaymentReceipt
            const receipt = await tx.paymentReceipt.create({
                data: {
                    studentId: pStudentId,
                    hostelBookingId: pHostelBookingId, // Link to the specific hostel booking
                    amountPaid: pPaymentAmount,
                    paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
                    reference, // This should be unique
                    channel: channel || null,
                    seasonId: pSeasonId,
                    description: description || `Hostel payment for booking ${pHostelBookingId}`,
                },
                select: paymentReceiptPublicSelection
            });

            // 3. Update the HostelBooking record
            const newTotalPaidForBooking = (booking.amountPaid || 0) + pPaymentAmount;
            let newBookingPaymentStatus = booking.paymentStatus; // Start with current

            if (newTotalPaidForBooking >= booking.amountDue) {
                newBookingPaymentStatus = BookingPaymentStatus.PAID;
            } else if (newTotalPaidForBooking > 0) {
                newBookingPaymentStatus = BookingPaymentStatus.PARTIAL;
            }
            // You might have a separate step/endpoint for an admin to move it to CONFIRMED

            const updatedBooking = await tx.hostelBooking.update({
                where: { id: pHostelBookingId },
                data: {
                    amountPaid: newTotalPaidForBooking,
                    paymentStatus: newBookingPaymentStatus,
                    // isActive: newBookingPaymentStatus === BookingPaymentStatus.PAID ? true : booking.isActive, // Optionally confirm booking as active upon full payment
                },
                select: hostelBookingAfterPaymentSelection
            });

            return [receipt, updatedBooking];
        });

        // Calculate balance for the returned booking object
        const balance = (updatedHostelBookingWithBalance.amountDue || 0) - (updatedHostelBookingWithBalance.amountPaid || 0);

        return {
            paymentReceipt: newPaymentReceipt,
            hostelBooking: { ...updatedHostelBookingWithBalance, balance }
        };

    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2002' && error.meta?.target?.includes('reference')) {
            // Assuming 'reference' is unique on PaymentReceipt
            throw new AppError('A payment with this reference number already exists.', 409);
        }
        console.error("Error recording hostel payment:", error.message, error.stack);
        throw new AppError('Could not record hostel payment due to an internal error.', 500);
    }
};

// You would have similar function for recording SchoolFee payments:
export const recordSchoolFeePayment = async (paymentData, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);

        const {
            studentId,      // Can come from req.user or body (if admin)
            schoolFeeId,    // The ID of the specific SchoolFee record (the "bill") this payment is for
            amountPaid: paymentAmountString,
            paymentDate,
            reference,
            channel,
            seasonId,       // Should match the SchoolFee record's season
            description
        } = paymentData;

        // --- Validation ---
        if (!schoolFeeId || !paymentAmountString || !reference || !seasonId) {
            throw new AppError('School Fee ID, amount paid, reference, and season ID are required.', 400);
        }

        const pStudentId = studentId ? parseInt(studentId, 10) : requestingUser?.id;
        const pSchoolFeeId = parseInt(schoolFeeId, 10);
        const pPaymentAmount = parseFloat(paymentAmountString);
        const pSeasonId = parseInt(seasonId, 10);

        if (!pStudentId || isNaN(pStudentId)) throw new AppError('Valid Student ID is required.', 400);
        if (isNaN(pSchoolFeeId)) throw new AppError('Invalid School Fee ID format.', 400);
        if (isNaN(pPaymentAmount) || pPaymentAmount <= 0) throw new AppError('Invalid payment amount.', 400);
        if (isNaN(pSeasonId)) throw new AppError('Invalid Season ID format.', 400);

        if (channel && !Object.values(PaymentChannel).includes(channel)) {
            throw new AppError('Invalid payment channel.', 400);
        }

        const [newPaymentReceipt, updatedSchoolFeeWithBalance] = await prisma.$transaction(async (tx) => {
            // 1. Find the specific SchoolFee record (the bill)
            const feeToPay = await tx.schoolFee.findUnique({
                where: { id: pSchoolFeeId }
            });

            if (!feeToPay) throw new AppError('School fee bill not found.', 404);

            // Authorization/Validation
            if (requestingUser.type === 'student' && feeToPay.studentId !== pStudentId) {
                throw new AppError('This school fee bill does not belong to you.', 403);
            }
            if (requestingUser.type !== 'student' && feeToPay.studentId !== pStudentId) {
                throw new AppError(`Bill's student ID (${feeToPay.studentId}) differs from provided (${pStudentId}).`, 400);
            }
            if (feeToPay.seasonId !== pSeasonId) {
                throw new AppError('Payment season does not match the bill season.', 400);
            }
            if (feeToPay.paymentStatus === SchoolFeePaymentStatus.PAID || feeToPay.paymentStatus === SchoolFeePaymentStatus.WAIVED) {
                throw new AppError('This school fee is already fully paid or waived.', 400);
            }
            if (feeToPay.paymentStatus === SchoolFeePaymentStatus.CANCELLED) {
                throw new AppError('Cannot record payment for a cancelled school fee.', 400);
            }


            // 2. Create PaymentReceipt
            const receipt = await tx.paymentReceipt.create({
                data: {
                    studentId: pStudentId,
                    schoolFeeId: pSchoolFeeId, // Link to the SchoolFee bill
                    amountPaid: pPaymentAmount,
                    paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
                    reference,
                    channel: channel || null,
                    seasonId: pSeasonId,
                    description: description || `Payment for school fee ID ${pSchoolFeeId}`,
                },
                select: paymentReceiptPublicSelection
            });

            // 3. Update the SchoolFee record
            const newTotalPaidForBill = (feeToPay.amountPaid || 0) + pPaymentAmount;
            let newPaymentStatus = feeToPay.paymentStatus;

            if (newTotalPaidForBill >= feeToPay.amount) {
                newPaymentStatus = SchoolFeePaymentStatus.PAID;
            } else if (newTotalPaidForBill > 0) {
                newPaymentStatus = SchoolFeePaymentStatus.PARTIAL;
            }
            // Consider OVERDUE status logic if applicable based on dueDate

            const updatedFee = await tx.schoolFee.update({
                where: { id: pSchoolFeeId },
                data: {
                    amountPaid: newTotalPaidForBill,
                    paymentStatus: newPaymentStatus,
                    // balance field in SchoolFee is not directly updated, it's derived
                },
                select: schoolFeeAfterPaymentSelection
            });

            return [receipt, updatedFee];
        });

        // Calculate balance for the returned SchoolFee object
        const balance = (updatedSchoolFeeWithBalance.amount || 0) - (updatedSchoolFeeWithBalance.amountPaid || 0);

        return {
            paymentReceipt: newPaymentReceipt,
            schoolFee: { ...updatedSchoolFeeWithBalance, balance }
        };

    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2002' && error.meta?.target?.includes('reference')) {
            throw new AppError('A payment with this reference number already exists.', 409);
        }
        console.error("Error recording school fee payment:", error.message, error.stack);
        throw new AppError('Could not record school fee payment.', 500);
    }
};