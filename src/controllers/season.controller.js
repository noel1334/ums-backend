
import * as SeasonService from '../services/season.service.js';
import AppError from '../utils/AppError.js';

export const createSeason = async (req, res, next) => {
    try {
        const { name, startDate, endDate, isActive, isComplete } = req.body;
        if (!name) return next(new AppError('Season name is required.', 400));
        const season = await SeasonService.createSeason({ name, startDate, endDate, isActive, isComplete });
        res.status(201).json({ status: 'success', message: 'Season created successfully', data: { season } });
    } catch (error) {
        next(error);
    }
};

export const getAllSeasons = async (req, res, next) => {
    try {
        const seasons = await SeasonService.getAllSeasons(req.query);
        res.status(200).json({ status: 'success', results: seasons.length, data: { seasons } });
    } catch (error) {
        next(error);
    }
};

export const getSeasonById = async (req, res, next) => {
    try {
        const season = await SeasonService.getSeasonById(req.params.id);
        res.status(200).json({ status: 'success', data: { season } });
    } catch (error) {
        next(error);
    }
};

export const updateSeason = async (req, res, next) => {
    try {
        if (Object.keys(req.body).length === 0) {
            return next(new AppError('No data provided for update.', 400));
        }
        const season = await SeasonService.updateSeason(req.params.id, req.body);
        res.status(200).json({ status: 'success', message: 'Season updated successfully', data: { season } });
    } catch (error) {
        next(error);
    }
};
export const updateSeasonStatus = async (req, res, next) => {
    try {
        const { isActive, isComplete } = req.body;
        if ((isActive === undefined && isComplete === undefined) ||
            (isActive !== undefined && typeof isActive !== 'boolean') ||
            (isComplete !== undefined && typeof isComplete !== 'boolean')) {
            return next(new AppError('Invalid payload. Provide isActive or isComplete as boolean.', 400));
        }

        const statusData = {};
        if (isActive !== undefined) statusData.isActive = isActive;
        if (isComplete !== undefined) statusData.isComplete = isComplete;

        const updatedSeason = await SeasonService.updateSeasonStatusOnly(req.params.id, statusData);
        res.status(200).json({
            status: 'success',
            message: 'Season status updated successfully.',
            data: { season: updatedSeason },
        });
    } catch (error) {
        next(error);
    }
};
export const deleteSeason = async (req, res, next) => {
    try {
        await SeasonService.deleteSeason(req.params.id);
        res.status(204).json({ status: 'success', data: null });
    } catch (error) {
        next(error);
    }
};