// src/controllers/result.controller.js - Confirmed Code

import * as ResultService from '../services/result.service.js';
import AppError from '../utils/AppError.js';
import catchAsync from '../utils/catchAsync.js'; // Assuming this is defined

export const generateResultsForSemester = catchAsync(async (req, res, next) => {
    // Criteria (seasonId, semesterId, departmentId?, programId?, levelId?) are correctly taken from req.body
    const criteria = req.body; 
    if (!criteria.seasonId || !criteria.semesterId) {
        throw new AppError('Season ID and Semester ID are required in criteria.', 400);
    }
    
    // The service handles authorization and returns the results
    const generatedResults = await ResultService.generateResultsForSemester(criteria, req.user);
    
    res.status(200).json({ // Use 200 since it's an update/generation job on the existing DB state
        status: 'success',
        message: `${generatedResults.length} results generated/updated successfully.`,
        data: { results: generatedResults },
    });
});

export const getResultById = catchAsync(async (req, res, next) => {
    const result = await ResultService.getResultById(req.params.id, req.user);
    res.status(200).json({ status: 'success', data: { result } });
});



export const getAllResults = catchAsync(async (req, res, next) => {
    const resultsData = await ResultService.getAllResults(req.query, req.user);
    res.status(200).json({ status: 'success', data: resultsData });
});

export const approveResultsForRelease = catchAsync(async (req, res, next) => {
    const { resultIds } = req.body; // Expect an array of result IDs
    const { user } = req;
    
    if (!resultIds || !Array.isArray(resultIds) || resultIds.length === 0) {
        throw new AppError('An array of result IDs is required.', 400);
    }
    
    // The service handles the parsing and update
    const approvalResult = await ResultService.approveResultsForRelease(resultIds, user.id);
    
    res.status(200).json({
        status: 'success',
        message: approvalResult.message
    });
});

export const getStudentResultHistoryMinimalController = catchAsync(async (req, res, next) => {
    
    let targetStudentId = null;
    const requestingUser = req.user;
    
    if (requestingUser.type === 'student') {
        targetStudentId = requestingUser.id; 
    } else {
        targetStudentId = req.params.studentId; 
    }
    
    if (!targetStudentId) {
        return next(new AppError('Student ID could not be determined.', 400));
    }
    
    // --- MODIFICATION: Pass the requestingUser to the service ---
    const resultHistory = await ResultService.getStudentResultsMinimal(targetStudentId, requestingUser);
    
    res.status(200).json({
        status: 'success',
        data: { history: resultHistory },
    });
});

/**
 * Handles deletion of a single result record.
 */
export const deleteResult = async (req, res, next) => {
    try {
        const result = await ResultService.deleteResult(req.params.id, req.user);
        res.status(200).json({ status: 'success', message: result.message });
    } catch (error) { next(error); }
};

/**
 * Handles batch deletion of result records.
 */
export const deleteManyResults = async (req, res, next) => {
    try {
        const { ids } = req.body; // Expect an array of IDs in the request body
        if (!ids || !Array.isArray(ids)) {
            return next(new AppError('An array of result IDs is required for batch deletion.', 400));
        }
        const result = await ResultService.deleteManyResults(ids, req.user);
        res.status(200).json({ status: 'success', message: result.message, data: { deletedCount: result.deletedCount } });
    } catch (error) { next(error); }
};

// --- NEW CONTROLLER: Toggle Result Release Status by Criteria ---
export const toggleResultsReleaseStatusController = catchAsync(async (req, res, next) => {
    const { criteria, action } = req.body; // criteria object, action: 'approve' | 'deapprove'
    const { user } = req;

    if (!criteria || Object.keys(criteria).length === 0) {
        throw new AppError('Approval criteria (season, semester, faculty, department, program, or level) must be provided.', 400);
    }

    if (action !== 'approve' && action !== 'deapprove') {
        throw new AppError('Action must be "approve" or "deapprove".', 400);
    }

    const releaseStatus = action === 'approve';

    const result = await ResultService.toggleResultsReleaseStatusService(criteria, releaseStatus, user.id);

    res.status(200).json({
        status: 'success',
        message: result.message,
        data: { updatedCount: result.updatedCount }
    });
});

// --- NEW CONTROLLER: Batch Toggle Result Release Status for specific IDs ---
export const batchToggleSpecificResultsReleaseController = catchAsync(async (req, res, next) => {
    const { resultIds, action } = req.body; // resultIds: array of IDs, action: 'approve' | 'deapprove'
    const { user } = req;

    if (!resultIds || !Array.isArray(resultIds) || resultIds.length === 0) {
        throw new AppError('An array of result IDs is required.', 400);
    }

    if (action !== 'approve' && action !== 'deapprove') {
        throw new AppError('Action must be "approve" or "deapprove".', 400);
    }

    const releaseStatus = action === 'approve';

    const result = await ResultService.batchToggleSpecificResultsReleaseService(resultIds, releaseStatus, user.id);

    res.status(200).json({
        status: 'success',
        message: result.message,
        data: { updatedCount: result.updatedCount }
    });
});