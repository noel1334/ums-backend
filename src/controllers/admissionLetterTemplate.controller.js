// src/controllers/admissionLetterTemplate.controller.js

import * as AdmissionLetterTemplateService from '../services/admissionLetterTemplate.service.js';
import AppError from '../utils/AppError.js';
// Make sure to import LetterTemplateType here
import { LetterTemplateType } from '../generated/prisma/index.js'; // This path is crucial

// Helper to get image URL safely from req.files for 'fields' type upload
const getImageUrl = (filesObject, fieldName) => {
    if (filesObject && filesObject[fieldName] && filesObject[fieldName].length > 0) {
        return filesObject[fieldName][0].fileUrl || null; 
    }
    return null;
};

export const createLetterTemplate = async (req, res, next) => {
    try {
        const dataToCreate = { ...req.body };

        const schoolLogoUrl = getImageUrl(req.files, 'schoolLogo');
        const registrarSignatureUrl = getImageUrl(req.files, 'registrarSignature');

        if (schoolLogoUrl) { 
            dataToCreate.schoolLogoUrl = schoolLogoUrl;
        } else if (req.body.schoolLogoUrl === null || req.body.schoolLogoUrl === '') { 
            dataToCreate.schoolLogoUrl = null;
        } else {
            dataToCreate.schoolLogoUrl = req.body.schoolLogoUrl; 
        }
        
        if (registrarSignatureUrl) { 
            dataToCreate.registrarSignatureUrl = registrarSignatureUrl;
        } else if (req.body.registrarSignatureUrl === null || req.body.registrarSignatureUrl === '') { 
            dataToCreate.registrarSignatureUrl = null;
        } else {
            dataToCreate.registrarSignatureUrl = req.body.registrarSignatureUrl; 
        }

        if (typeof dataToCreate.sections === 'string') {
            try {
                dataToCreate.sections = JSON.parse(dataToCreate.sections);
            } catch (parseError) {
                return next(new AppError('Sections data must be a valid JSON string.', 400));
            }
        }
        
        const newTemplate = await AdmissionLetterTemplateService.createLetterTemplate(dataToCreate);
        res.status(201).json({ status: 'success', data: { template: newTemplate } });
    } catch (error) { next(error); }
};

export const getAllLetterTemplates = async (req, res, next) => {
    try {
        const result = await AdmissionLetterTemplateService.getAllLetterTemplates(req.query);
        res.status(200).json({ status: 'success', data: result });
    } catch (error) { next(error); }
};

export const getLetterTemplateById = async (req, res, next) => {
    try {
        const template = await AdmissionLetterTemplateService.getLetterTemplateById(req.params.id);
        res.status(200).json({ status: 'success', data: { template } });
    } catch (error) { next(error); }
};

export const updateLetterTemplate = async (req, res, next) => {
    try {
        if (Object.keys(req.body).length === 0 && (!req.files || Object.keys(req.files).length === 0)) {
            return next(new AppError('No data or file provided for update.', 400));
        }

        const dataToUpdate = { ...req.body };

        const schoolLogoUrl = getImageUrl(req.files, 'schoolLogo');
        const registrarSignatureUrl = getImageUrl(req.files, 'registrarSignature');

        if (schoolLogoUrl) { 
            dataToUpdate.schoolLogoUrl = schoolLogoUrl;
        } else if (req.body.schoolLogoUrl === null || req.body.schoolLogoUrl === '') { 
            dataToUpdate.schoolLogoUrl = null;
        } else {
            dataToUpdate.schoolLogoUrl = req.body.schoolLogoUrl; 
        }
        
        if (registrarSignatureUrl) { 
            dataToUpdate.registrarSignatureUrl = registrarSignatureUrl;
        } else if (req.body.registrarSignatureUrl === null || req.body.registrarSignatureUrl === '') { 
            dataToUpdate.registrarSignatureUrl = null;
        } else {
            dataToUpdate.registrarSignatureUrl = req.body.registrarSignatureUrl; 
        }

        if (typeof dataToUpdate.sections === 'string') {
            try {
                dataToUpdate.sections = JSON.parse(dataToUpdate.sections);
            } catch (parseError) {
                return next(new AppError('Sections data must be a valid JSON string.', 400));
            }
        }

        const updatedTemplate = await AdmissionLetterTemplateService.updateLetterTemplate(req.params.id, dataToUpdate);
        res.status(200).json({ status: 'success', data: { template: updatedTemplate } });
    } catch (error) { next(error); }
};

export const deleteLetterTemplate = async (req, res, next) => {
    try {
        const result = await AdmissionLetterTemplateService.deleteLetterTemplate(req.params.id);
        res.status(200).json({ status: 'success', message: result.message });
    } catch (error) { next(error); }
};

// ADDED: Controller function for applicants to get the active ADMISSION_LETTER template
export const getActiveLetterTemplateForApplicant = async (req, res, next) => {
    try {
        const template = await AdmissionLetterTemplateService.getActiveLetterTemplate(LetterTemplateType.ADMISSION_LETTER);

        if (!template) {
            return next(new AppError('No active admission letter template found.', 404));
        }

        res.status(200).json({ status: 'success', data: { template } });
    } catch (error) {
        next(error);
    }
};