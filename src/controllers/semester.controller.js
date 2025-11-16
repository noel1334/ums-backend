import * as SemesterService from '../services/semester.service.js';
import AppError from '../utils/AppError.js';

export const createSemester = async (req, res, next) => {
    try {
        
        // Initial check for core required fields
        const { name, seasonId, type } = req.body; // Removed unused destructured variables like startDate, endDate, isActive here
        if (!name || !seasonId || !type) {
            return next(new AppError('Semester name, season ID, and type are required.', 400));
        }
        // req.body will contain all fields, including optional new ones
        const semester = await SemesterService.createSemester(req.body);
        res.status(201).json({ status: 'success', message: 'Semester created successfully', data: { semester } });
    } catch (error) {
        next(error);
    }
};

export const getAllSemesters = async (req, res, next) => {
    try {
        const semesters = await SemesterService.getAllSemesters(req.query);
        res.status(200).json({ status: 'success', results: semesters.length, data: { semesters } });
    } catch (error) {
        next(error);
    }
};

export const getSemesterById = async (req, res, next) => {
    try {
        const semester = await SemesterService.getSemesterById(req.params.id);
        res.status(200).json({ status: 'success', data: { semester } });
    } catch (error) {
        next(error);
    }
};

export const updateSemester = async (req, res, next) => {
    try {
        if (Object.keys(req.body).length === 0) {
            return next(new AppError('No data provided for update.', 400));
        }
        // req.body will contain all fields to be updated
        const semester = await SemesterService.updateSemester(req.params.id, req.body);
        res.status(200).json({ status: 'success', message: 'Semester updated successfully', data: { semester } });
    } catch (error) {
        next(error);
    }
};

export const deleteSemester = async (req, res, next) => {
    try {
        await SemesterService.deleteSemester(req.params.id);
        res.status(204).json({ status: 'success', data: null });
    } catch (error) {
        next(error);
    }
};