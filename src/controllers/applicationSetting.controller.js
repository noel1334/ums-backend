// src/controllers/applicationSetting.controller.js
import * as ApplicationSettingService from '../services/applicationSetting.service.js';
import AppError from '../utils/AppError.js';

export const createApplicationSetting = async (req, res, next) => {
    try {
        // TODO: Input validation for req.body
        const newSetting = await ApplicationSettingService.createApplicationSetting(req.body);
        res.status(201).json({
            status: 'success',
            message: 'Application setting created successfully.',
            data: { setting: newSetting },
        });
    } catch (error) {
        next(error);
    }
};

export const getApplicationSettingByKey = async (req, res, next) => {
    try {
        const { key } = req.params;
        const setting = await ApplicationSettingService.getApplicationSettingByKey(key);
        res.status(200).json({ status: 'success', data: { setting } });
    } catch (error) {
        next(error);
    }
};

export const getAllApplicationSettings = async (req, res, next) => {
    try {
        const result = await ApplicationSettingService.getAllApplicationSettings(req.query);
        res.status(200).json({ status: 'success', data: result });
    } catch (error) {
        next(error);
    }
};

export const updateApplicationSetting = async (req, res, next) => {
    try {
        const { key } = req.params;
        if (Object.keys(req.body).length === 0) {
            return next(new AppError('No data provided for update.', 400));
        }
        // TODO: Input validation for req.body
        const updatedSetting = await ApplicationSettingService.updateApplicationSetting(key, req.body);
        res.status(200).json({
            status: 'success',
            message: `Application setting '${key}' updated successfully.`,
            data: { setting: updatedSetting },
        });
    } catch (error) {
        next(error);
    }
};

export const deleteApplicationSetting = async (req, res, next) => {
    try {
        const { key } = req.params;
        await ApplicationSettingService.deleteApplicationSetting(key);
        res.status(204).json({ status: 'success', data: null });
    } catch (error) {
        next(error);
    }
};