import * as ScreeningFeeListService from '../services/screeningFeeList.service.js';
import AppError from '../utils/AppError.js';

export const createScreeningFee = async (req, res, next) => {
    try {
        const newFee = await ScreeningFeeListService.createScreeningFee(req.body);
        res.status(201).json({ status: 'success', data: { screeningFee: newFee } });
    } catch (error) { next(error); }
};

export const getAllScreeningFees = async (req, res, next) => {
    try {
        const result = await ScreeningFeeListService.getAllScreeningFees(req.query);
        res.status(200).json({ status: 'success', data: result });
    } catch (error) { next(error); }
};

export const getScreeningFeeById = async (req, res, next) => {
    try {
        const fee = await ScreeningFeeListService.getScreeningFeeById(req.params.id);
        res.status(200).json({ status: 'success', data: { screeningFee: fee } });
    } catch (error) { next(error); }
};

export const updateScreeningFee = async (req, res, next) => {
    try {
        if (Object.keys(req.body).length === 0) return next(new AppError('No data provided for update.', 400));
        const updatedFee = await ScreeningFeeListService.updateScreeningFee(req.params.id, req.body);
        res.status(200).json({ status: 'success', data: { screeningFee: updatedFee } });
    } catch (error) { next(error); }
};

export const deleteScreeningFee = async (req, res, next) => {
    try {
        const result = await ScreeningFeeListService.deleteScreeningFee(req.params.id);
        res.status(200).json({ status: 'success', message: result.message }); // Or 204
    } catch (error) { next(error); }
};

export const getApplicableFee = async (req, res, next) => {
    try {
        // The `authenticateApplicantToken` middleware should attach the full applicant's
        // ApplicationProfile object to `req.applicantProfile`
        if (!req.applicantProfile || !req.applicantProfile.id) {
            // This is a safety check: ensure the profile and its ID are available
            return next(new AppError('Applicant authentication failed or profile ID not found on request.', 401));
        }
        
        // --- FIX APPLIED HERE ---
        // Pass ONLY the numerical 'id' from the applicantProfile object to the service function
        const applicationProfileId = req.applicantProfile.id;

        const fee = await ScreeningFeeListService.getApplicableFeeForApplicant(applicationProfileId);
        res.status(200).json({ status: 'success', data: { screeningFee: fee } });
    } catch (error) { 
        next(error); 
    }
};