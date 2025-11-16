// src/controllers/schoolFeeList.controller.js
import * as SchoolFeeListService from '../services/schoolFeeList.service.js';
import AppError from '../utils/AppError.js';

export const createSchoolFeeItem = async (req, res, next) => {
    try {
        const newItem = await SchoolFeeListService.createSchoolFeeItem(req.body);
        res.status(201).json({ status: 'success', message: 'School fee item created.', data: { item: newItem } });
    } catch (error) { next(error); }
};

// Renamed to reflect service change, used by Students, Admins, HODs
export const getApplicableSchoolFees = async (req, res, next) => {
    try {
        const result = await SchoolFeeListService.getApplicableSchoolFeeList(req.query, req.user);
        res.status(200).json({ status: 'success', data: result });
    } catch (error) {
        next(error);
    }
};
// Admin specific get by ID
export const getSchoolFeeItemById = async (req, res, next) => {
    try {
        const item = await SchoolFeeListService.getSchoolFeeItemById(req.params.id);
        res.status(200).json({ status: 'success', data: { item } });
    } catch (error) { next(error); }
};

export const updateSchoolFeeItem = async (req, res, next) => {
    try {
        if (Object.keys(req.body).length === 0) {
            return next(new AppError('No data provided for update.', 400));
        }
        const updatedItem = await SchoolFeeListService.updateSchoolFeeItem(req.params.id, req.body);
        res.status(200).json({ status: 'success', message: 'School fee item updated.', data: { item: updatedItem } });
    } catch (error) { next(error); }
};

export const deleteSchoolFeeItem = async (req, res, next) => {
    try {
        await SchoolFeeListService.deleteSchoolFeeItem(req.params.id);
        res.status(204).json({ status: 'success', data: null });
    } catch (error) { next(error); }
};