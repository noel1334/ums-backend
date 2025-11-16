import * as LevelService from '../services/level.service.js';
// import AppError from '../utils/AppError.js';

export const createLevel = async (req, res, next) => {
    try {
        // CORRECTED: Pass the entire request body to the service.
        // The service layer is now responsible for all validation.
        const level = await LevelService.createLevel(req.body);
        res.status(201).json({ status: 'success', message: 'Level created successfully', data: { level } });
    } catch (error) {
        next(error);
    }
};

export const getAllLevels = async (req, res, next) => {
    try {
        const levels = await LevelService.getAllLevels();
        res.status(200).json({ status: 'success', results: levels.length, data: { levels } });
    } catch (error) {
        next(error);
    }
};

export const getLevelById = async (req, res, next) => {
    try {
        const level = await LevelService.getLevelById(req.params.id);
        res.status(200).json({ status: 'success', data: { level } });
    } catch (error) {
        next(error);
    }
};

export const updateLevel = async (req, res, next) => {
    try {
        // CORRECTED: Pass the entire request body for the update.
        // The service layer will figure out which fields to change.
        const level = await LevelService.updateLevel(req.params.id, req.body);
        res.status(200).json({ status: 'success', message: 'Level updated successfully', data: { level } });
    } catch (error) {
        next(error);
    }
};

export const deleteLevel = async (req, res, next) => {
    try {
        await LevelService.deleteLevel(req.params.id);
        // A 204 No Content response is standard for successful deletions and shouldn't have a body.
        res.status(204).send(); 
    } catch (error) {
        next(error);
    }
};