// src/controllers/physicalScreening.controller.js
import * as PhysicalScreeningService from '../services/physicalScreening.service.js';
import AppError from '../utils/AppError.js';

export const createPhysicalScreeningRecord = async (req, res, next) => {
    try {
        // creatorUserIdOrName can be req.user.id or req.user.name if an admin/staff is logged in
        const creatorInfo = req.user ? (req.user.name || req.user.email) : 'SYSTEM';
        const newRecord = await PhysicalScreeningService.createPhysicalScreeningRecord(req.body, creatorInfo);
        res.status(201).json({
            status: 'success',
            message: 'Physical screening record created successfully.',
            data: { record: newRecord },
        });
    } catch (error) {
        next(error);
    }
};

export const getAllPhysicalScreeningRecords = async (req, res, next) => {
    try {
        const result = await PhysicalScreeningService.getAllPhysicalScreeningRecords(req.query);
        res.status(200).json({ status: 'success', data: result });
    } catch (error) {
        next(error);
    }
};

export const getPhysicalScreeningRecordById = async (req, res, next) => {
    try {
        const record = await PhysicalScreeningService.getPhysicalScreeningRecordById(req.params.id);
        res.status(200).json({ status: 'success', data: { record } });
    } catch (error) {
        next(error);
    }
};

export const getPhysicalScreeningByApplicationProfileId = async (req, res, next) => {
    try {
        const record = await PhysicalScreeningService.getPhysicalScreeningByApplicationProfileId(req.params.applicationProfileId);
        if (!record) { // Service returns null if not found, controller decides response
            return res.status(404).json({ status: 'fail', message: 'No physical screening record found for this application profile.' });
        }
        res.status(200).json({ status: 'success', data: { record } });
    } catch (error) {
        next(error);
    }
};

export const updatePhysicalScreeningRecord = async (req, res, next) => {
    try {
        if (Object.keys(req.body).length === 0) {
            return next(new AppError('No data provided for update.', 400));
        }
        const updaterInfo = req.user ? (req.user.name || req.user.email) : 'SYSTEM';
        const updatedRecord = await PhysicalScreeningService.updatePhysicalScreeningRecord(req.params.id, req.body, updaterInfo);
        res.status(200).json({
            status: 'success',
            message: 'Physical screening record updated successfully.',
            data: { record: updatedRecord },
        });
    } catch (error) {
        next(error);
    }
};

export const deletePhysicalScreeningRecord = async (req, res, next) => {
    try {
        const result = await PhysicalScreeningService.deletePhysicalScreeningRecord(req.params.id);
        res.status(200).json({ status: 'success', message: result.message }); // Or 204 for no content
    } catch (error) {
        next(error);
    }
};

// --- ADD THIS CONTROLLER FOR SINGLE CREATION ---
export const addSingleToScreening = async (req, res, next) => {
    try {
        const { applicationProfileId } = req.body;
        const record = await PhysicalScreeningService.addSingleProfileToScreening(applicationProfileId);
        res.status(201).json({
            status: 'success',
            message: 'Candidate added to physical screening list.',
            data: { record },
        });
    } catch (error) {
        next(error);
    }
};

// --- ADD THIS CONTROLLER FOR BATCH CREATION ---
export const addBatchToScreening = async (req, res, next) => {
    try {
        const { applicationProfileIds } = req.body;
        const result = await PhysicalScreeningService.addBatchProfilesToScreening(applicationProfileIds);
        res.status(200).json({
            status: 'success',
            message: `${result.createdCount} new candidate(s) added to the physical screening list.`,
            data: result,
        });
    } catch (error) {
        next(error);
    }
};

export const batchDeletePhysicalScreeningRecords = async (req, res, next) => {
    try {
        const { recordIds } = req.body;
        const result = await PhysicalScreeningService.batchDeletePhysicalScreeningRecords(recordIds);
        res.status(200).json({
            status: 'success',
            message: result.message,
            data: { deletedCount: result.deletedCount },
        });
    } catch (error) {
        next(error);
    }
};

export const batchUpdatePhysicalScreeningRecords = async (req, res, next) => {
    try {
        // --- Destructure the correct fields ---
        const { recordIds, screeningDate, screeningStartDate, screeningEndDate } = req.body;

        // --- Pass all fields to the service ---
        const result = await PhysicalScreeningService.batchUpdateScreeningRecords({ 
            recordIds, 
            screeningDate, 
            screeningStartDate, 
            screeningEndDate 
        });

        res.status(200).json({
            status: 'success',
            message: result.message,
            data: result,
        });
    } catch (error) {
        next(error);
    }
};

export const batchEmailPhysicalScreening = async (req, res, next) => {
    try {
        // The payload contains recordIds, subject, and message
        const result = await PhysicalScreeningService.batchEmailScreeningRecords(req.body);
        res.status(200).json({ status: 'success', message: result.message });
    } catch (error) {
        next(error);
    }
};