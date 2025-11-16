// src/controllers/programCourseUnitRequirement.controller.js

import * as ProgramCourseUnitRequirementService from '../services/programCourseUnitRequirement.service.js';
import AppError from '../utils/AppError.js';

export const createProgramCourseUnitRequirement = async (req, res, next) => {
    try {
        const newRequirement = await ProgramCourseUnitRequirementService.createRequirement(req.body);
        res.status(201).json({
            status: 'success',
            message: 'Program Course Unit Requirement created successfully.',
            data: { requirement: newRequirement },
        });
    } catch (error) {
        next(error);
    }
};

export const getProgramCourseUnitRequirementById = async (req, res, next) => {
    try {
        const requirement = await ProgramCourseUnitRequirementService.getRequirementById(req.params.id);
        res.status(200).json({
            status: 'success',
            data: { requirement },
        });
    } catch (error) {
        next(error);
    }
};

export const getAllProgramCourseUnitRequirements = async (req, res, next) => {
    try {
        const result = await ProgramCourseUnitRequirementService.getAllRequirements(req.query);
        res.status(200).json({
            status: 'success',
            data: result,
        });
    } catch (error) {
        next(error);
    }
};

export const updateProgramCourseUnitRequirement = async (req, res, next) => {
    try {
        if (Object.keys(req.body).length === 0) {
            return next(new AppError('No data provided for update.', 400));
        }
        const updatedRequirement = await ProgramCourseUnitRequirementService.updateRequirement(req.params.id, req.body);
        res.status(200).json({
            status: 'success',
            message: 'Program Course Unit Requirement updated successfully.',
            data: { requirement: updatedRequirement },
        });
    } catch (error) {
        next(error);
    }
};

export const deleteProgramCourseUnitRequirement = async (req, res, next) => {
    try {
        const message = await ProgramCourseUnitRequirementService.deleteRequirement(req.params.id);
        res.status(200).json({
            status: 'success',
            message: message.message,
        });
    } catch (error) {
        next(error);
    }
};