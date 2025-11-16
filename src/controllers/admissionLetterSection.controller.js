// src/controllers/admissionLetterSection.controller.js
import * as AdmissionLetterSectionService from '../services/admissionLetterSection.service.js';
import AppError from '../utils/AppError.js';

// Assumes templateId is available from req.params due to nested routing
export const addSectionToTemplate = async (req, res, next) => {
    try {
        const templateId = req.params.templateId; // From nested route /templates/:templateId/sections
        if (!templateId) {
            return next(new AppError('Template ID is required in the path.', 400));
        }
        const newSection = await AdmissionLetterSectionService.addSectionToTemplate(templateId, req.body);
        res.status(201).json({ status: 'success', data: { section: newSection } });
    } catch (error) {
        next(error);
    }
};

export const getSectionsForTemplate = async (req, res, next) => {
    try {
        const templateId = req.params.templateId;
        if (!templateId) {
            return next(new AppError('Template ID is required in the path.', 400));
        }
        const sections = await AdmissionLetterSectionService.getSectionsForTemplate(templateId, req.query);
        res.status(200).json({ status: 'success', data: { sections } });
    } catch (error) {
        next(error);
    }
};

// Get a specific section by its own ID (sectionId)
export const getSectionById = async (req, res, next) => {
    try {
        // req.params.templateId might also be present if route is /templates/:templateId/sections/:sectionId
        const sectionId = req.params.sectionId;
        if (!sectionId) {
            return next(new AppError('Section ID is required in the path.', 400));
        }
        const section = await AdmissionLetterSectionService.getSectionById(sectionId);
        res.status(200).json({ status: 'success', data: { section } });
    } catch (error) {
        next(error);
    }
};

export const updateSectionInTemplate = async (req, res, next) => {
    try {
        const sectionId = req.params.sectionId;
        if (!sectionId) {
            return next(new AppError('Section ID is required in the path.', 400));
        }
        if (Object.keys(req.body).length === 0) {
            return next(new AppError('No data provided for update.', 400));
        }
        const updatedSection = await AdmissionLetterSectionService.updateSectionInTemplate(sectionId, req.body);
        res.status(200).json({ status: 'success', data: { section: updatedSection } });
    } catch (error) {
        next(error);
    }
};

export const deleteSectionFromTemplate = async (req, res, next) => {
    try {
        const sectionId = req.params.sectionId;
        if (!sectionId) {
            return next(new AppError('Section ID is required in the path.', 400));
        }
        const result = await AdmissionLetterSectionService.deleteSectionFromTemplate(sectionId);
        res.status(200).json({ status: 'success', message: result.message });
    } catch (error) {
        next(error);
    }
};