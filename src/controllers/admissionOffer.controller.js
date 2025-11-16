// src/controllers/admissionOffer.controller.js
import * as AdmissionOfferService from '../services/admissionOffer.service.js';
import AppError from '../utils/AppError.js';
import  catchAsync  from '../utils/catchAsync.js';

// --- Admin/ICT Staff Controllers ---
export const createAdmissionOffer = async (req, res, next) => {
    try {
        const newOffer = await AdmissionOfferService.createAdmissionOffer(req.body);
        res.status(201).json({ status: 'success', data: { offer: newOffer } });
    } catch (error) { next(error); }
};
export const createBatchAdmissionOffers = async (req, res, next) => {
    try {
        const { applicationProfileIds, ...offerDetails } = req.body;
        const result = await AdmissionOfferService.createBatchAdmissionOffers(applicationProfileIds, offerDetails);
        res.status(201).json({
            status: 'success',
            message: `${result.createdCount} admission offer(s) created successfully.`,
            data: result,
        });
    } catch (error) { next(error); }
};

export const getProgramAdmissionStats = catchAsync(async (req, res, next) => {
    // The seasonId is expected as a query parameter (e.g., /program-stats?seasonId=1)
    const { seasonId } = req.query;
    
    const stats = await AdmissionOfferService.getProgramAdmissionStats(seasonId);
    
    res.status(200).json({ status: 'success', data: stats });
});

export const getAllAdmissionOffers = async (req, res, next) => {
    try {
        const result = await AdmissionOfferService.getAllAdmissionOffers(req.query);
        res.status(200).json({ status: 'success', data: result });
    } catch (error) { next(error); }
};

export const getAdmissionOfferById = async (req, res, next) => {
    try {
        const offer = await AdmissionOfferService.getAdmissionOfferById(req.params.id);
        res.status(200).json({ status: 'success', data: { offer } });
    } catch (error) { next(error); }
};

export const updateAdmissionOfferAsAdmin = async (req, res, next) => {
    try {
        if (Object.keys(req.body).length === 0) return next(new AppError('No data for update.', 400));
        const updatedOffer = await AdmissionOfferService.updateAdmissionOfferAsAdmin(req.params.id, req.body);
        res.status(200).json({ status: 'success', data: { offer: updatedOffer } });
    } catch (error) { next(error); }
};

// --- Applicant Controllers ---
export const getMyAdmissionOffer = async (req, res, next) => {
    try {
        // req.applicantProfile is set by authenticateApplicantToken middleware
        if (!req.applicantProfile?.id) {
            return next(new AppError('Applicant profile not authenticated.', 401));
        }
        const offer = await AdmissionOfferService.getMyAdmissionOffer(req.applicantProfile.id);
        if (!offer) {
            return res.status(200).json({ status: 'success', message: 'No admission offer found for you at this time.', data: { offer: null } });
        }
        res.status(200).json({ status: 'success', data: { offer } });
    } catch (error) {
        next(error);
    }
};

export const respondToMyAdmissionOffer = async (req, res, next) => {
    try {
        if (!req.applicantProfile?.id) {
            return next(new AppError('Applicant profile not authenticated.', 401));
        }
        const { accept, rejectionReason } = req.body; // Expecting: { "accept": true/false, "rejectionReason": "..." }
        if (typeof accept !== 'boolean') {
            return next(new AppError('Decision to accept (true/false) is required.', 400));
        }
        if (accept === false && !rejectionReason) {
            // Optional: make rejectionReason mandatory if accept is false
            // return next(new AppError('Rejection reason is required if not accepting the offer.', 400));
        }

        const updatedOffer = await AdmissionOfferService.respondToAdmissionOffer(req.applicantProfile.id, accept, rejectionReason);
        const message = accept ? "Admission offer accepted successfully." : "Admission offer has been recorded as rejected.";
        res.status(200).json({ status: 'success', message, data: { offer: updatedOffer } });
    } catch (error) {
        next(error);
    }
};

export const batchEmailAdmissionNotifications = async (req, res, next) => {
    try {
        const { offerIds, subject, message } = req.body;
        const result = await AdmissionOfferService.batchEmailAdmissionNotifications({ offerIds, subject, message });
        res.status(200).json({ status: 'success', message: result.message });
    } catch (error) { next(error); }
};
export const batchEmailNotificationAdmission = async (req, res, next) => {
    try {
        const { offerIds, subject, message } = req.body;
        const result = await AdmissionOfferService.batchEmailNotificationAdmission({ offerIds, subject, message });
        res.status(200).json({ status: 'success', message: result.message });
    } catch (error) { next(error); }
};
export const deleteAdmissionOffer = catchAsync(async (req, res, next) => {
    const result = await AdmissionOfferService.deleteAdmissionOffer(req.params.id);
    res.status(200).json({ status: 'success', message: result.message });
});