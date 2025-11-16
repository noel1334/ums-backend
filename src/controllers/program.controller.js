import * as ProgramService from '../services/program.service.js';
import AppError from '../utils/AppError.js';

export const createProgram = async (req, res, next) => {
    try {
        const { programCode, name, degree, degreeType, duration, departmentId } = req.body; // Added programCode
        if (!programCode || !name || !degree || degreeType, !duration || !departmentId) { // Added programCode to check
            return next(new AppError('Program code, name, degree, duration, and department ID are required.', 400));
        }
        const program = await ProgramService.createProgram(req.body);
        res.status(201).json({ status: 'success', message: 'Program created successfully', data: { program } });
    } catch (error) {
        next(error);
    }
};

export const getAllPrograms = async (req, res, next) => {
    try {
        const programs = await ProgramService.getAllPrograms(req.query);
        res.status(200).json({ status: 'success', results: programs.length, data: { programs } });
    } catch (error) {
        next(error);
    }
};

export const getProgramById = async (req, res, next) => {
    try {
        const program = await ProgramService.getProgramById(req.params.id);
        res.status(200).json({ status: 'success', data: { program } });
    } catch (error) {
        next(error);
    }
};

export const updateProgram = async (req, res, next) => {
    try {
        if (Object.keys(req.body).length === 0) {
            return next(new AppError('No data provided for update.', 400));
        }
        const program = await ProgramService.updateProgram(req.params.id, req.body);
        res.status(200).json({ status: 'success', message: 'Program updated successfully', data: { program } });
    } catch (error) {
        next(error);
    }
};

export const deleteProgram = async (req, res, next) => {
    try {
        const result = await ProgramService.deleteProgram(req.params.id);
        res.status(200).json({ status: 'success', message: result.message }); // Changed to 200 for success with message
    } catch (error) {
        next(error);
    }
};