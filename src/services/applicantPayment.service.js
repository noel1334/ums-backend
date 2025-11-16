// src/services/applicantPayment.service.js
import axios from 'axios';
import Stripe from 'stripe';
import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js'; // Assuming this is used for custom errors
import config from '../config/index.js';
import { PaymentStatus, ApplicantPaymentPurpose, PaymentChannel, DocumentType } from '../generated/prisma/index.js'; 

const stripe = new Stripe(config.strip);

const paymentSelection = {
    id: true,
    purpose: true,
    amountExpected: true,
    amountPaid: true,
    paymentStatus: true,
    paymentDate: true,
    paymentReference: true,
    paymentChannel: true,
    transactionId: true,
    createdAt: true,
    updatedAt: true,
    applicationProfile: {
        select: {
            id: true,
            jambRegNo: true,
            email: true,
            phone: true,
            applicationStatus: true,
            hasPaidScreeningFee: true,
            onlineScreeningList: {
                select: {
                    jambApplicant: {
                        select: { name: true, entryMode: true, jambSeason: { select: { id: true, name: true } } }
                    }
                }
            },
            // --- FIX 2: Correctly select PROFILE_PHOTO for the profileImg ---
            uploadedDocuments: {
                where: {
                    documentType: DocumentType.PROFILE_PHOTO // Use the imported DocumentType enum
                },
                select: {
                    fileUrl: true // Only need the URL for display
                },
                take: 1 // Only get one if multiple exist for some reason
            }
            // --- END FIX 2 ---
        }
    },
    screeningFeeItem: {
        select: { id: true, description: true, season: { select: { id: true, name: true } }, entryMode: true } // Select season name for convenience
    },
    acceptanceFeeItem: {
        select: { id: true, description: true, season: { select: { id: true, name: true } }, programId: true, facultyId: true, entryMode: true } // Select season name for convenience
    }
};




// --- Helper Function ---
const generatePaymentReference = () => {
    const now = new Date();
    return `UMS-APP-${now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
};

// --- Helper to transform a single payment record (reused from getAll) ---

const transformPaymentRecord = (payment) => {
    const applicantProfile = payment.applicationProfile;
    const jambApplicant = applicantProfile?.onlineScreeningList?.jambApplicant;
    
    return {
        ...payment,
        applicantName: jambApplicant?.name || 'N/A',
        applicantJambRegNo: applicantProfile?.jambRegNo || 'N/A',
        applicantEmail: applicantProfile?.email || 'N/A',
        applicantPhone: applicantProfile?.phone || 'N/A', // Added phone
        applicantEntryMode: jambApplicant?.entryMode || 'N/A',
        profilePhotoUrl: applicantProfile?.uploadedDocuments?.[0]?.fileUrl || null,
        associatedFeeDescription: payment.purpose === 'SCREENING_APPLICATION_FEE' ? payment.screeningFeeItem?.description : payment.acceptanceFeeItem?.description,
        associatedFeeSeason: (payment.screeningFeeItem?.season?.name || payment.acceptanceFeeItem?.season?.name) || 'N/A',
        
        // Remove raw nested objects for cleaner frontend use
        applicationProfile: undefined,
        screeningFeeItem: undefined,
        acceptanceFeeItem: undefined,
    };
};

// Existing getAllApplicantPayments (no changes needed here, it uses the same selection and transformation)
export const getAllApplicantPayments = async (query) => {
    try {
        // ... (all existing logic for getAllApplicantPayments, ensure it calls transformPaymentRecord for each payment)
        if (!prisma) throw new AppError('Prisma client unavailable', 500);

        const {
            search, purpose, paymentStatus, paymentChannel, seasonId, page = "1", limit = "10"
        } = query;

        const filters = []; 

        if (search) {
            filters.push({
                OR: [
                    { paymentReference: { contains: search } },
                    { transactionId: { contains: search } },
                    { applicationProfile: { jambRegNo: { contains: search } } },
                    { applicationProfile: { email: { contains: search } } },
                    { applicationProfile: { onlineScreeningList: { jambApplicant: { name: { contains: search } } } } },
                ]
            });
        }

        if (purpose && Object.values(ApplicantPaymentPurpose).includes(purpose)) { filters.push({ purpose: purpose }); }
        if (paymentStatus && Object.values(PaymentStatus).includes(paymentStatus)) { filters.push({ paymentStatus: paymentStatus }); }
        if (paymentChannel && Object.values(PaymentChannel).includes(paymentChannel)) { filters.push({ paymentChannel: paymentChannel }); }

        if (seasonId) {
            const seasonIdNum = parseInt(seasonId, 10);
            if (!isNaN(seasonIdNum)) {
                filters.push({ OR: [ { screeningFeeItem: { seasonId: seasonIdNum } }, { acceptanceFeeItem: { seasonId: seasonIdNum } } ] });
            } else { throw new AppError('Invalid Season ID format for filter.', 400); }
        }

        const where = filters.length > 0 ? { AND: filters } : {};
        const pageNum = parseInt(page, 10) || 1;
        const limitNum = parseInt(limit, 10) || 10;
        const skip = (pageNum - 1) * limitNum;

        const [payments, totalPayments] = await prisma.$transaction([
            prisma.applicantPayment.findMany({ where, select: paymentSelection, orderBy: { createdAt: 'desc' }, skip, take: limitNum }),
            prisma.applicantPayment.count({ where })
        ]);
        
        const transformedPayments = payments.map(transformPaymentRecord); // Re-use transformation

        return {
            payments: transformedPayments,
            totalPages: Math.ceil(totalPayments / limitNum),
            currentPage: pageNum,
            totalPayments
        };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("[APPLICANT_PAYMENT_SERVICE] getAllApplicantPayments:", error.message, error.stack);
        throw new AppError('Could not retrieve applicant payment list.', 500);
    }
};

/**
 * Fetches a single applicant payment record by ID.
 */
export const getApplicantPaymentById = async (id) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const paymentId = parseInt(id, 10);
        if (isNaN(paymentId)) throw new AppError('Invalid Payment ID format.', 400);

        const payment = await prisma.applicantPayment.findUnique({
            where: { id: paymentId },
            select: paymentSelection, // Reuse the same comprehensive selection
        });

        if (!payment) {
            throw new AppError('Payment record not found.', 404);
        }

        return transformPaymentRecord(payment); // Apply the same transformation
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("[APPLICANT_PAYMENT_SERVICE] getApplicantPaymentById:", error.message, error.stack);
        throw new AppError('Could not retrieve payment details.', 500);
    }
};

/**
 * Creates a Stripe checkout session and a PENDING payment record in the DB.
 * Now supports both screening and acceptance fees.
 */


export const initializeStripePayment = async (applicantProfileId, feeDetails, userDetails, paymentChannel, purpose) => {
    const { feeId, amount } = feeDetails;
    const { email, name } = userDetails;

    if (amount < 100) {
        throw new Error("Amount must be at least NGN 100 for Stripe.");
    }

    const paymentReference = generatePaymentReference();

    const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [{
            price_data: {
                currency: "ngn",
                product_data: { name: purpose === 'SCREENING_APPLICATION_FEE' ? "University Screening Fee" : "University Acceptance Fee" },
                unit_amount: Math.round(amount * 100),
            },
            quantity: 1,
        }],
        mode: "payment",
        customer_email: email,
        // --- UPDATED Stripe Redirect URLs ---
        // Both success and cancel URLs point to /payment-status
        // and pass the session_id consistently for robust lookup.
        success_url: `${config.screeningPortalUrl}/payment-status?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${config.screeningPortalUrl}/payment-status?status=cancelled&session_id={CHECKOUT_SESSION_ID}`, // Changed ref to session_id for consistency
        // Pass purpose and feeId in metadata so we can retrieve it when completing the payment
        metadata: { paymentReference, applicantProfileId: String(applicantProfileId), purpose, feeId: String(feeId) },
    });

    const paymentData = {
        applicationProfileId: applicantProfileId,
        purpose: purpose,
        amountExpected: amount,
        amountPaid: 0, // Not paid yet
        paymentStatus: 'PENDING',
        paymentReference: paymentReference, // Our internal reference
        paymentChannel: paymentChannel,
        transactionId: session.id, // Stripe's session ID (Stripe Checkout Session ID)
        // Conditionally set fee ID based on purpose
        ...(purpose === 'SCREENING_APPLICATION_FEE' ? { screeningFeeListId: feeId } : {}),
        ...(purpose === 'ADMISSION_ACCEPTANCE_FEE' ? { acceptanceFeeListId: feeId } : {}),
    };

    // Create a PENDING payment record using Prisma
    await prisma.applicantPayment.create({ data: paymentData });

    return { sessionId: session.id, reference: paymentReference };
};

/**
 * Verifies a Stripe session and updates the payment record to PAID, or handles non-paid states.
 * This function is now the central handler for all Stripe Checkout redirects (success or cancel).
 */
export const completeStripePayment = async (sessionId) => {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // Retrieve metadata directly from the session
    const paymentReference = session.metadata.paymentReference;
    const applicantProfileId = parseInt(session.metadata.applicantProfileId, 10);
    const purpose = session.metadata.purpose;
    const feeId = parseInt(session.metadata.feeId, 10);

    // Find the existing pending payment record
    const pendingPayment = await prisma.applicantPayment.findFirst({
        where: {
            applicationProfileId: applicantProfileId,
            paymentReference: paymentReference,
            paymentStatus: 'PENDING',
            purpose: purpose,
            // Ensure the correct fee ID is being updated
            ...(purpose === 'SCREENING_APPLICATION_FEE' ? { screeningFeeListId: feeId } : {}),
            ...(purpose === 'ADMISSION_ACCEPTANCE_FEE' ? { acceptanceFeeListId: feeId } : {}),
        },
    });

    // Handle cases where the pending payment record is not found or already processed
    if (!pendingPayment) {
        const existingPaidPayment = await prisma.applicantPayment.findFirst({
            where: {
                applicationProfileId: applicantProfileId,
                paymentReference: paymentReference,
                paymentStatus: 'PAID', // Check if already paid
                purpose: purpose,
                ...(purpose === 'SCREENING_APPLICATION_FEE' ? { screeningFeeListId: feeId } : {}),
                ...(purpose === 'ADMISSION_ACCEPTANCE_FEE' ? { acceptanceFeeListId: feeId } : {}),
            }
        });
        if (existingPaidPayment) {
            console.log(`Stripe session ${sessionId} already processed and paid.`);
            return existingPaidPayment; // Already processed, return existing record
        }
        // If not found and not already paid, it's an unexpected state.
        console.error(`Pending payment record not found for session ${sessionId}.`);
        throw new Error("Payment record not found or an issue occurred during initiation.");
    }

    // Process based on Stripe's final payment status for the session
    if (session.payment_status === "paid") {
        const transactions = [
            prisma.applicantPayment.update({
                where: { id: pendingPayment.id },
                data: {
                    paymentStatus: 'PAID',
                    paymentDate: new Date(),
                    amountPaid: session.amount_total / 100,
                    transactionId: session.payment_intent, // Stripe's Payment Intent ID (the actual charge)
                    paymentGatewayResponse: session,
                },
            }),
        ];

        // Update applicant profile or admission offer based on purpose
        if (purpose === 'SCREENING_APPLICATION_FEE') {
            transactions.push(
                prisma.applicationProfile.update({
                    where: { id: applicantProfileId },
                    data: { hasPaidScreeningFee: true },
                })
            );
        } else if (purpose === 'ADMISSION_ACCEPTANCE_FEE') {
            const admissionOffer = await prisma.admissionOffer.findFirst({
                where: {
                    applicationProfileId: applicantProfileId,
                    acceptanceFeeListId: feeId,
                },
            });

            if (!admissionOffer) {
                // This shouldn't happen if the payment was initiated correctly.
                // Log and potentially update the payment record to 'FAILED' or 'PENDING_ERROR'
                // instead of deleting, so manual review is possible.
                console.error(`Admission offer not found for applicant ${applicantProfileId} and acceptance fee ${feeId}.`);
                throw new Error("Admission offer not linked correctly for acceptance fee payment.");
            }

            transactions.push(
                prisma.admissionOffer.update({
                    where: { id: admissionOffer.id },
                    data: { 
                        hasPaidAcceptanceFee: true, // ADDED BACK
                        isAccepted: true,           // Now both are updated
                        acceptanceDate: new Date() 
                    },
                })
            );
        }

        const [updatedPayment] = await prisma.$transaction(transactions);
        return updatedPayment;

    } else {
        // Payment was not completed (e.g., cancelled by user, payment failed, session expired)
        console.warn(`Stripe session ${sessionId} was not paid. Status: ${session.payment_status}.`);
        // Delete the pending record for a clean slate, as the payment itself didn't go through.
        await prisma.applicantPayment.delete({
            where: { id: pendingPayment.id }
        });
        // Throw an error to signal to the frontend that the payment was not successful.
        throw new Error(`Payment not completed. Status: ${session.payment_status}`);
    }
};

/**
 * Verifies a Paystack transaction and creates a final PAID payment record.
 * Handles both screening and acceptance fees.
 */
export const verifyPaystackPayment = async (applicantProfileId, gatewayReference, paymentDetails) => {
    const response = await axios.get(`https://api.paystack.co/transaction/verify/${gatewayReference}`, {
        headers: { Authorization: `Bearer ${config.paystack}` },
    });

    const { data } = response.data;
    if (data.status !== "success") {
        throw new Error("Paystack payment verification failed.");
    }

    const transactions = [
        prisma.applicantPayment.create({
            data: {
                applicationProfileId: applicantProfileId,
                purpose: paymentDetails.purpose,
                amountExpected: paymentDetails.amount,
                amountPaid: data.amount / 100, // Paystack returns in kobo
                paymentStatus: 'PAID',
                paymentDate: new Date(),
                paymentReference: generatePaymentReference(),
                paymentChannel: 'PAYSTACK',
                transactionId: data.reference,
                ...(paymentDetails.purpose === 'SCREENING_APPLICATION_FEE' ? { screeningFeeListId: paymentDetails.feeId } : {}),
                ...(paymentDetails.purpose === 'ADMISSION_ACCEPTANCE_FEE' ? { acceptanceFeeListId: paymentDetails.feeId } : {}),
                paymentGatewayResponse: data,
            },
        }),
    ];

    if (paymentDetails.purpose === 'SCREENING_APPLICATION_FEE') {
        transactions.push(
            prisma.applicationProfile.update({
                where: { id: applicantProfileId },
                data: { hasPaidScreeningFee: true },
            })
        );
    } else if (paymentDetails.purpose === 'ADMISSION_ACCEPTANCE_FEE') {
        const admissionOffer = await prisma.admissionOffer.findFirst({
            where: {
                applicationProfileId: applicantProfileId,
                acceptanceFeeListId: paymentDetails.feeId,
            },
        });

        if (!admissionOffer) {
            throw new Error("Admission offer not found for acceptance fee payment.");
        }

        transactions.push(
            prisma.admissionOffer.update({
                where: { id: admissionOffer.id },
                data: { 
                    hasPaidAcceptanceFee: true, // ADDED BACK
                    isAccepted: true,           // Now both are updated
                    acceptanceDate: new Date() 
                },
            })
        );
    }

    const [createdPayment] = await prisma.$transaction(transactions);

    return createdPayment;
};


/**
 * Verifies a Flutterwave transaction and creates a final PAID payment record.
 * Handles both screening and acceptance fees.
 */
export const verifyFlutterwavePayment = async (applicantProfileId, transactionId, tx_ref, paymentDetails) => {
    const response = await axios.get(`https://api.flutterwave.com/v3/transactions/${transactionId}/verify`, {
        headers: { Authorization: `Bearer ${config.flutterwave.secretKey}` },
    });

    const { data } = response.data;

    const isAmountMatch = parseFloat(data.amount) === parseFloat(paymentDetails.amount);

    if (
        data.status !== "successful" ||
        data.tx_ref.trim() !== tx_ref.trim() ||
        !isAmountMatch
    ) {
        console.error("FLUTTERWAVE VERIFICATION FAILED:", {
            reason: "Mismatch in transaction details",
            expected: {
                tx_ref: tx_ref,
                amount: paymentDetails.amount,
                status: "successful"
            },
            received: {
                tx_ref: data.tx_ref,
                amount: data.amount,
                status: data.status
            },
        });
        throw new Error("Flutterwave verification failed. Details do not match.");
    }

    const transactions = [
        prisma.applicantPayment.create({
            data: {
                applicationProfileId: applicantProfileId,
                purpose: paymentDetails.purpose,
                amountExpected: paymentDetails.amount,
                amountPaid: data.amount,
                paymentStatus: 'PAID',
                paymentDate: new Date(),
                paymentReference: `UMS-${tx_ref}`,
                paymentChannel: 'FLUTTERWAVE',
                transactionId: String(data.id),
                ...(paymentDetails.purpose === 'SCREENING_APPLICATION_FEE' ? { screeningFeeListId: paymentDetails.feeId } : {}),
                ...(paymentDetails.purpose === 'ADMISSION_ACCEPTANCE_FEE' ? { acceptanceFeeListId: paymentDetails.feeId } : {}),
                paymentGatewayResponse: data,
            },
        }),
    ];

    if (paymentDetails.purpose === 'SCREENING_APPLICATION_FEE') {
        transactions.push(
            prisma.applicationProfile.update({
                where: { id: applicantProfileId },
                data: { hasPaidScreeningFee: true },
            })
        );
    } else if (paymentDetails.purpose === 'ADMISSION_ACCEPTANCE_FEE') {
        const admissionOffer = await prisma.admissionOffer.findFirst({
            where: {
                applicationProfileId: applicantProfileId,
                acceptanceFeeListId: paymentDetails.feeId,
            },
        });

        if (!admissionOffer) {
            throw new Error("Admission offer not found for acceptance fee payment.");
        }

        transactions.push(
            prisma.admissionOffer.update({
                where: { id: admissionOffer.id },
                data: { 
                    hasPaidAcceptanceFee: true, // ADDED BACK
                    isAccepted: true,           // Now both are updated
                    acceptanceDate: new Date() 
                },
            })
        );
    }

    const [createdPayment] = await prisma.$transaction(transactions);

    return createdPayment;
};


/**
 * Deletes an incomplete PENDING payment record.
 * This function is less precise for Stripe cancellations than using `completeStripePayment`.
 * Retained for other potential cleanup needs or non-Stripe cases if applicable.
 */
export const deleteIncompletePaymentByRef = async (reference) => {
    console.warn("deleteIncompletePaymentByRef called. For Stripe cancellations, it's recommended to use completeStripePayment instead, which internally handles deletion if not paid.");
    await prisma.applicantPayment.deleteMany({
        where: {
            paymentReference: reference,
            paymentStatus: 'PENDING',
        },
    });
};