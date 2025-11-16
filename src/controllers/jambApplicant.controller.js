// src/controllers/jambApplicant.controller.js
import * as JambApplicantService from '../services/jambApplicant.service.js';
import AppError from '../utils/AppError.js';

export const createJambApplicant = async (req, res, next) => {
    try {
        // req.user will be Admin or ICTStaff
        const newApplicant = await JambApplicantService.createJambApplicant(req.body, req.user);
        res.status(201).json({ status: 'success', data: { applicant: newApplicant } });
    } catch (error) { next(error); }
};
export const batchCreateJambApplicants = async (req, res, next) => {
    try {
        const applicantsDataArray = req.body.applicants;

        if (!Array.isArray(applicantsDataArray) || applicantsDataArray.length === 0) {
            return next(new AppError('Applicants data must be a non-empty array in the request body.', 400));
        }
        if (applicantsDataArray.length > 500) {
            return next(new AppError('Batch size too large. Please upload a maximum of 500 applicants at a time.', 400));
        }

        // Call the service function
        const result = await JambApplicantService.batchCreateJambApplicants(applicantsDataArray, req.user);

        // --- FIX IS HERE ---
        // The service already calculates 'status', 'message', and wraps data in a 'data' object.
        // So, we can directly use those properties from the 'result' object.
        res.status(200).json({
            status: result.status, // Use the status calculated by the service
            message: result.message, // Use the message calculated by the service
            data: result.data // Pass the entire data object from the service
        });
        // --- END FIX ---

    } catch (error) {
        next(error);
    }
};

export const getAllJambApplicants = async (req, res, next) => {
    try {
        const result = await JambApplicantService.getAllJambApplicants(req.query);
        res.status(200).json({ status: 'success', data: result });
    } catch (error) { next(error); }
};

// For Admin/ICT to get by DB ID
export const getJambApplicantById = async (req, res, next) => {
    try {
        const applicant = await JambApplicantService.getJambApplicantById(req.params.id);
        res.status(200).json({ status: 'success', data: { applicant } });
    } catch (error) { next(error); }
};

// For Applicant pre-login lookup by JambRegNo
export const lookupJambApplicantByRegNo = async (req, res, next) => {
    try {
        const { jambRegNo } = req.params; // Or req.query
        if (!jambRegNo) return next(new AppError('JAMB Registration Number is required.', 400));
        const applicant = await JambApplicantService.getJambApplicantByJambRegNo(jambRegNo);
        res.status(200).json({ status: 'success', data: { applicant } });
    } catch (error) { next(error); }
};


export const updateJambApplicant = async (req, res, next) => {
    try {
        if (Object.keys(req.body).length === 0) return next(new AppError('No data for update.', 400));
        const updatedApplicant = await JambApplicantService.updateJambApplicant(req.params.id, req.body);
        res.status(200).json({ status: 'success', data: { applicant: updatedApplicant } });
    } catch (error) { next(error); }
};

export const deleteJambApplicant = async (req, res, next) => {
    try {
        const result = await JambApplicantService.deleteJambApplicant(req.params.id);
        res.status(200).json({ status: 'success', message: result.message });
    } catch (error) { next(error); }
};
export const batchDeleteJambApplicants = async (req, res, next) => {
    try {
        const { ids } = req.body; // Expect an array of IDs in the request body
        const result = await JambApplicantService.batchDeleteJambApplicants(ids);
        res.status(200).json({ status: 'success', message: result.message, data: result });
    } catch (error) {
        next(error);
    }
};
export const batchUpdateJambApplicants = async (req, res, next) => {
    try {
        const { ids, updateData } = req.body;
        const result = await JambApplicantService.batchUpdateJambApplicants(ids, updateData);
        res.status(200).json({ status: 'success', message: result.message, data: result });
    } catch (error) {
        next(error);
    }
};

export const batchEmailJambApplicants = async (req, res, next) => {
    try {
        const { ids, subject, message } = req.body;
        const result = await JambApplicantService.batchEmailJambApplicants(ids, subject, message);
        res.status(200).json({ status: 'success', message: result.message, data: result });
    } catch (error) {
        next(error);
    }
};