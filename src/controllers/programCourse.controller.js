// src/controllers/programCourse.controller.js
import * as ProgramCourseService from '../services/programCourse.service.js';
import AppError from '../utils/AppError.js';

export const addCourseToProgram = async (req, res, next) => {
    try {
        const newMapping = await ProgramCourseService.addCourseToProgram(req.body);
        res.status(201).json({
            status: 'success',
            message: 'Course added to program at specified level.',
            data: { mapping: newMapping },
        });
    } catch (error) { next(error); }
};

export const getProgramCourseById = async (req, res, next) => {
    try {
        const mapping = await ProgramCourseService.getProgramCourseById(req.params.id, req.user);
        res.status(200).json({ status: 'success', data: { mapping } });
    } catch (error) { next(error); }
};

export const getAllProgramCourses = async (req, res, next) => {
    try {
        const result = await ProgramCourseService.getAllProgramCourses(req.query, req.user);
        res.status(200).json({ status: 'success', data: result });
    } catch (error) { next(error); }
};

export const updateProgramCourse = async (req, res, next) => {
    try {
        // It's good practice to ensure there's something to update.
        // The service layer also has a check, but an early exit here is fine.
        if (Object.keys(req.body).length === 0 || (req.body.isElective === undefined && req.body.isActive === undefined)) {
            return next(new AppError('No valid data (isElective or isActive) provided for update.', 400));
        }
        const updatedMapping = await ProgramCourseService.updateProgramCourse(req.params.id, req.body);
        res.status(200).json({
            status: 'success',
            message: 'Program course mapping updated.',
            data: { mapping: updatedMapping },
        });
    } catch (error) { next(error); }
};

// NEW CONTROLLER FUNCTION
export const setProgramCourseActiveStatus = async (req, res, next) => {
    try {
        const { isActive } = req.body;
        if (isActive === undefined || typeof isActive !== 'boolean') {
            return next(new AppError('The "isActive" field (true or false) is required in the request body.', 400));
        }
        const result = await ProgramCourseService.setProgramCourseActiveStatus(req.params.id, isActive);
        res.status(200).json({
            status: 'success',
            message: result.message,
            data: { mapping: result.updatedMapping } // Send back the updated mapping
        });
    } catch (error) {
        next(error);
    }
};

// RENAMED CONTROLLER FUNCTION for permanent delete
export const deleteProgramCourseMappingPermanently = async (req, res, next) => {
    try {
        const result = await ProgramCourseService.deleteProgramCourseMappingPermanently(req.params.id);
        res.status(200).json({ // Or 204 if you prefer no body, but message is useful
            status: 'success',
            message: result.message
        });
    } catch (error) {
        next(error);
    }
};