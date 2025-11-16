// src/controllers/onlineScreening.controller.js
import * as OnlineScreeningService from '../services/onlineScreening.service.js';
import AppError from '../utils/AppError.js';

export const createOnlineScreeningAccount = async (req, res, next) => {
    try {
        const newAccount = await OnlineScreeningService.createOnlineScreeningAccount(req.body, req.user);
        res.status(201).json({
            status: 'success',
            message: 'Online screening account created successfully.',
            data: { account: newAccount },
        });
    } catch (error) {
        next(error);
    }
};

export const batchCreateOnlineScreeningAccounts = async (req, res, next) => {
    try {
        const dataArray = req.body.applicants || req.body.screeningData; // Expect an array
        if (!Array.isArray(dataArray) || dataArray.length === 0) {
            return next(new AppError('Screening data must be a non-empty array.', 400));
        }
        if (dataArray.length > 500) { // Batch limit
            return next(new AppError('Batch size too large (max 500).', 400));
        }
        const result = await OnlineScreeningService.batchCreateOnlineScreeningAccounts(dataArray, req.user);
        const responseStatus = result.errors.length > 0 && result.errors.length === dataArray.length
            ? 'fail'
            : result.errors.length > 0 ? 'partial_success' : 'success';

        res.status(responseStatus === 'fail' ? 400 : 200).json({
            status: responseStatus,
            message: result.message,
            data: {
                createdCount: result.createdCount,
                skippedCount: result.skippedCount,
                errors: result.errors,
                // createdScreeningAccounts: result.createdScreeningAccounts // Optionally return created data
            }
        });
    } catch (error) {
        next(error);
    }
};

export const getAllOnlineScreeningAccounts = async (req, res, next) => {
    try {
        const result = await OnlineScreeningService.getAllOnlineScreeningAccounts(req.query);
        res.status(200).json({ status: 'success', data: result });
    } catch (error) {
        next(error);
    }
};

export const getOnlineScreeningAccountById = async (req, res, next) => {
    try {
        const account = await OnlineScreeningService.getOnlineScreeningAccountById(req.params.id);
        res.status(200).json({ status: 'success', data: { account } });
    } catch (error) {
        next(error);
    }
};

export const updateOnlineScreeningAccount = async (req, res, next) => {
    try {
        if (Object.keys(req.body).length === 0) {
            return next(new AppError('No data provided for update.', 400));
        }
        // Add requestingUser if service needs it for permission checks on update (e.g., only admin)
        const updatedAccount = await OnlineScreeningService.updateOnlineScreeningAccount(req.params.id, req.body /*, req.user */);
        res.status(200).json({
            status: 'success',
            message: 'Online screening account updated successfully.',
            data: { account: updatedAccount },
        });
    } catch (error) {
        next(error);
    }
};

export const deleteOnlineScreeningAccount = async (req, res, next) => {
    try {
        const result = await OnlineScreeningService.deleteOnlineScreeningAccount(req.params.id);
        res.status(200).json({ status: 'success', message: result.message }); // Or 204
    } catch (error) {
        next(error);
    }
};

export const batchDeleteOnlineScreeningAccounts = async (req, res, next) => {
    try {
        const { ids } = req.body;
        const result = await OnlineScreeningService.batchDeleteOnlineScreeningAccounts(ids);
        res.status(200).json({ status: 'success', message: result.message, data: result });
    } catch (error) {
        next(error);
    }
};

export const getStats = async (req, res, next) => {
    try {
        const stats = await OnlineScreeningService.getOnlineScreeningStats();
        res.status(200).json({ status: 'success', data: { stats } });
    } catch (error) {
        next(error);
    }
};