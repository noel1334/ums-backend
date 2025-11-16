// src/controllers/screeningFeeList.controller.js
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
        // The `authenticateApplicantToken` middleware now attaches the full profile.
        // We use that data directly instead of querying the database again.
        if (!req.applicantProfile) {
            // This is a safety check.
            return next(new AppError('Applicant authentication failed, profile not found on request.', 401));
        }
        
        const fee = await ScreeningFeeListService.getApplicableFeeForApplicant(req.applicantProfile);
        res.status(200).json({ status: 'success', data: { screeningFee: fee } });
    } catch (error) { 
        next(error); 
    }
};