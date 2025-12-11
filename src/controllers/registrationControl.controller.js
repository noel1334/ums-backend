// src/controllers/registrationControl.controller.js
import * as registrationControlService from '../services/registrationControl.service.js';
import AppError from '../utils/AppError.js';

/**
 * Create a new registration control entry. (Admin only)
 */
export const createRegistrationControl = async (req, res, next) => {
    try {
        const newControl = await registrationControlService.createRegistrationControl(req.body);
        res.status(201).json({ status: 'success', data: { registrationControl: newControl } });
    } catch (error) {
        next(error);
    }
};

/**
 * Get all registration control entries. (Admin only)
 */
export const getAllRegistrationControls = async (req, res, next) => {
    try {
        const controls = await registrationControlService.getAllRegistrationControls();
        res.status(200).json({ status: 'success', data: { registrationControls: controls } });
    } catch (error) {
        next(error);
    }
};

/**
 * Get registration status for a specific degree type. (Applicant & Admin)
 */
export const getRegistrationStatus = async (req, res, next) => {
    try {
        const { degreeType } = req.params; // Get degreeType from URL parameter
        const status = await registrationControlService.getRegistrationStatusByDegreeType(degreeType);
        res.status(200).json({ status: 'success', data: { registrationStatus: status } });
    } catch (error) {
        next(error);
    }
};

/**
 * Update an existing registration control entry. (Admin only)
 */
export const updateRegistrationControl = async (req, res, next) => {
    try {
        const { degreeType } = req.params; // Get degreeType from URL parameter
        const updatedControl = await registrationControlService.updateRegistrationControl(degreeType, req.body);
        res.status(200).json({ status: 'success', data: { registrationControl: updatedControl } });
    } catch (error) {
        next(error);
    }
};