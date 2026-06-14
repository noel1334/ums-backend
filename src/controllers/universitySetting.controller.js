// src/controllers/universitySetting.controller.js

import * as universitySettingService from '../services/universitySetting.service.js';

export const handleGetSettings = async (req, res, next) => {
    try {
        const settings = await universitySettingService.getUniversitySettings();
        res.status(200).json({
            status: 'success',
            data: { settings }
        });
    } catch (error) {
        next(error);
    }
};

export const handleUpdateSettings = async (req, res, next) => {
    try {
        const settings = await universitySettingService.updateUniversitySettings(req.body);
        res.status(200).json({
            status: 'success',
            message: 'University information updated successfully.',
            data: { settings }
        });
    } catch (error) {
        next(error);
    }
};