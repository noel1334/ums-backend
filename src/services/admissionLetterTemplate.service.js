// src/services/admissionLetterTemplate.service.js

import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
// Ensure both enums are imported
import { LetterSectionType, LetterTemplateType } from '../generated/prisma/index.js';

const templateSelection = {
    id: true, templateName: true, description: true, isActive: true,
    templateType: true, // <--- IMPORTANT: Include templateType in selection
    schoolLogoUrl: true, letterheadAddress: true, letterheadContacts: true,
    registrarName: true, registrarTitle: true, registrarSignatureUrl: true,
    createdAt: true, updatedAt: true,
    sections: { 
        orderBy: { order: 'asc' },
        select: {
            id: true, sectionType: true, title: true, content: true, order: true,
            isConditional: true, conditionField: true
        }
    }
};

export const createLetterTemplate = async (data) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const {
            templateName, description, isActive, templateType, // <--- NOW REQUIRED
            schoolLogoUrl, letterheadAddress, letterheadContacts,
            registrarName, registrarTitle, registrarSignatureUrl, sections 
        } = data;

        if (!templateName || !registrarName || !templateType) { // <--- templateType is now required
            throw new AppError('Template Name, Registrar Name, and Template Type are required.', 400);
        }
        if (!Object.values(LetterTemplateType).includes(templateType)){ // <--- Validate templateType
             throw new AppError(`Invalid Template Type: ${templateType}`, 400);
        }

        if (sections && !Array.isArray(sections)) {
            throw new AppError('Sections data must be an array.', 400);
        }
        if (sections) {
            for (const section of sections) {
                if (!section.content || section.order === undefined || !section.sectionType) {
                    throw new AppError('Each section must have content, order, and sectionType.', 400);
                }
                if (!Object.values(LetterSectionType).includes(section.sectionType)){
                     throw new AppError(`Invalid sectionType: ${section.sectionType}`, 400);
                }
            }
        }

        const newTemplate = await prisma.admissionLetterTemplate.create({
            data: {
                templateName,
                description,
                isActive: isActive === undefined ? true : Boolean(isActive),
                templateType, // <--- Use provided templateType
                schoolLogoUrl, letterheadAddress, letterheadContacts,
                registrarName, registrarTitle, registrarSignatureUrl,
                ...(sections && sections.length > 0 && {
                    sections: {
                        createMany: { 
                            data: sections.map(s => ({
                                // templateId is handled by Prisma's relation when creating nested `createMany`
                                sectionType: s.sectionType,
                                title: s.title,
                                content: s.content,
                                order: parseInt(s.order, 10),
                                isConditional: Boolean(s.isConditional),
                                conditionField: s.conditionField
                            }))
                        }
                    }
                })
            },
            select: templateSelection
        });
        return newTemplate;
    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2002' && error.meta?.target?.includes('templateName')) {
            throw new AppError('A letter template with this name already exists.', 409);
        }
        console.error("Error creating letter template:", error.message, error.stack);
        throw new AppError('Could not create admission letter template.', 500);
    }
};

export const getAllLetterTemplates = async (query) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const { isActive, templateType, page = 1, limit = 10 } = query;
        const where = {};
        if (isActive !== undefined) where.isActive = isActive === 'true';
        if (templateType && Object.values(LetterTemplateType).includes(templateType)){
            where.templateType = templateType;
        }

        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;

        const templates = await prisma.admissionLetterTemplate.findMany({
            where,
            select: { 
                id: true, templateName: true, description: true, isActive: true, templateType: true, updatedAt: true 
            },
            orderBy: { templateName: 'asc' },
            skip, take: limitNum
        });
        const totalTemplates = await prisma.admissionLetterTemplate.count({ where });
        return { templates, totalPages: Math.ceil(totalTemplates / limitNum), currentPage: pageNum, totalTemplates };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching letter templates:", error.message, error.stack);
        throw new AppError('Could not retrieve letter templates.', 500);
    }
};

export const getLetterTemplateById = async (id) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const templateId = parseInt(id, 10);
        if (isNaN(templateId)) throw new AppError('Invalid ID format.', 400);

        const template = await prisma.admissionLetterTemplate.findUnique({
            where: { id: templateId },
            select: templateSelection 
        });
        if (!template) throw new AppError('Admission letter template not found.', 404);
        return template;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching letter template by ID:", error.message, error.stack);
        throw new AppError('Could not retrieve letter template.', 500);
    }
};

export const updateLetterTemplate = async (id, updateData) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const templateId = parseInt(id, 10);
        if (isNaN(templateId)) throw new AppError('Invalid ID format.', 400);

        const existingTemplate = await prisma.admissionLetterTemplate.findUnique({ where: { id: templateId } });
        if (!existingTemplate) throw new AppError('Template not found for update.', 404);

        const { sections, ...templateDetails } = updateData; 

        const dataForDb = {};

        // Explicitly include templateType in fields that can be updated as strings
        const stringFields = ['templateName', 'description', 'letterheadAddress', 'letterheadContacts', 'registrarName', 'registrarTitle', 'schoolLogoUrl', 'registrarSignatureUrl', 'templateType']; 
        const booleanFields = ['isActive'];

        for (const key of stringFields) {
            if (templateDetails.hasOwnProperty(key)) {
                if (key === 'templateType' && !Object.values(LetterTemplateType).includes(templateDetails[key])) {
                    throw new AppError(`Invalid Template Type: ${templateDetails[key]}`, 400);
                }
                dataForDb[key] = templateDetails[key] === '' ? null : templateDetails[key];
            }
        }

        for (const key of booleanFields) {
            if (templateDetails.hasOwnProperty(key)) {
                dataForDb[key] = Boolean(templateDetails[key]);
            }
        }

        if (dataForDb.templateName && dataForDb.templateName !== existingTemplate.templateName) {
            const nameExists = await prisma.admissionLetterTemplate.findFirst({where: {templateName: dataForDb.templateName, id: {not: templateId}}});
            if(nameExists) throw new AppError('Another template with this name already exists.', 409);
        }

        await prisma.$transaction(async (tx) => {
            // Optional: If this template is being set to active, deactivate others of the same type
            // This ensures only one active template per type at a time.
            if (dataForDb.isActive === true && (dataForDb.templateType || existingTemplate.templateType)) {
                await tx.admissionLetterTemplate.updateMany({
                    where: {
                        isActive: true,
                        templateType: dataForDb.templateType || existingTemplate.templateType, // Use new type if provided, else existing
                        id: { not: templateId }
                    },
                    data: { isActive: false }
                });
            }

            if (Object.keys(dataForDb).length > 0) {
                await tx.admissionLetterTemplate.update({
                    where: { id: templateId },
                    data: dataForDb,
                });
            }

            if (sections && Array.isArray(sections)) {
                for (const section of sections) {
                    if (!section.content || section.order === undefined || !section.sectionType) {
                        throw new AppError('Each updated section must have content, order, and sectionType.', 400);
                    }
                    if (!Object.values(LetterSectionType).includes(section.sectionType)){
                         throw new AppError(`Invalid sectionType: ${section.sectionType}.`, 400);
                    }
                }
                
                await tx.admissionLetterSection.deleteMany({ where: { templateId: templateId } });
                
                if (sections.length > 0) {
                    await tx.admissionLetterSection.createMany({
                        data: sections.map(s => ({
                            templateId: templateId, 
                            sectionType: s.sectionType,
                            title: s.title,
                            content: s.content,
                            order: parseInt(s.order, 10),
                            isConditional: Boolean(s.isConditional),
                            conditionField: s.conditionField === '' ? null : s.conditionField
                        }))
                    });
                }
            }
        });

        const updatedTemplate = await prisma.admissionLetterTemplate.findUnique({
            where: {id: templateId},
            select: templateSelection
        });
        return updatedTemplate;

    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2002' && error.meta?.target?.includes('templateName')) {
            throw new AppError('A letter template with this name already exists (check during update).', 409);
        }
        console.error("Error updating letter template:", error.message, error.stack);
        throw new AppError('Could not update admission letter template.', 500);
    }
};

export const deleteLetterTemplate = async (id) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const templateId = parseInt(id, 10);
        if (isNaN(templateId)) throw new AppError('Invalid ID format.', 400);

        const existingTemplate = await prisma.admissionLetterTemplate.findUnique({ where: { id: templateId } });
        if (!existingTemplate) throw new AppError('Template not found for deletion.', 404);

        await prisma.admissionLetterTemplate.delete({ where: { id: templateId } });
        return { message: 'Admission letter template and its sections deleted successfully.' };
    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2003') {
            throw new AppError('Cannot delete template, it might be referenced by other records.', 400);
        }
        console.error("Error deleting letter template:", error.message, error.stack);
        throw new AppError('Could not delete admission letter template.', 500);
    }
};

// ADDED: Service function to get the active template of a specific type
export const getActiveLetterTemplate = async (type = LetterTemplateType.ADMISSION_LETTER) => { // Defaults to ADMISSION_LETTER
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);

        const template = await prisma.admissionLetterTemplate.findFirst({
            where: { 
                isActive: true,
                templateType: type // Filter by the provided type
            },
            select: templateSelection
        });

        return template;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error(`Error fetching active letter template of type ${type}:`, error.message, error.stack);
        throw new AppError(`Could not retrieve active ${type.toLowerCase().replace('_', ' ')} template.`, 500);
    }
};