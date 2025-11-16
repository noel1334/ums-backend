// src/services/admissionLetterSection.service.js
import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import { LetterSectionType } from '../generated/prisma/index.js'; // Ensure path is correct

const sectionSelection = {
    id: true, templateId: true, sectionType: true, title: true,
    content: true, order: true, isConditional: true, conditionField: true,
    createdAt: true, updatedAt: true
};

// Helper to check if template exists and is modifiable
const getTemplateForSection = async (templateId) => {
    const id = parseInt(templateId, 10);
    if (isNaN(id)) throw new AppError('Invalid Template ID format.', 400);
    const template = await prisma.admissionLetterTemplate.findUnique({ where: { id } });
    if (!template) throw new AppError(`Admission Letter Template with ID ${id} not found.`, 404);
    // Add any other checks, e.g., if template is locked for editing
    return template;
};


export const addSectionToTemplate = async (templateId, sectionData) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        await getTemplateForSection(templateId); // Validates templateId

        const { sectionType, title, content, order, isConditional, conditionField } = sectionData;

        if (!sectionType || !content || order === undefined) {
            throw new AppError('Section Type, Content, and Order are required.', 400);
        }
        if (!Object.values(LetterSectionType).includes(sectionType)) {
            throw new AppError(`Invalid Section Type: '${sectionType}'.`, 400);
        }
        const pOrder = parseInt(order, 10);
        if (isNaN(pOrder)) throw new AppError('Order must be a number.', 400);

        // Check for order conflict within the same template
        const existingOrder = await prisma.admissionLetterSection.findFirst({
            where: { templateId: parseInt(templateId, 10), order: pOrder }
        });
        if (existingOrder) {
            throw new AppError(`Order ${pOrder} already exists for this template. Adjust orders or use a different one.`, 409);
        }

        const newSection = await prisma.admissionLetterSection.create({
            data: {
                templateId: parseInt(templateId, 10),
                sectionType,
                title: title || null,
                content,
                order: pOrder,
                isConditional: Boolean(isConditional),
                conditionField: conditionField || null
            },
            select: sectionSelection
        });
        return newSection;
    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2002' && error.meta?.target?.includes('order') && error.meta?.target?.includes('templateId')) {
            // This is handled by the explicit check above, but good as a fallback
            throw new AppError(`Order ${sectionData.order} already exists for this template.`, 409);
        }
        console.error("Error adding section to template:", error.message, error.stack);
        throw new AppError('Could not add section to template.', 500);
    }
};

export const getSectionsForTemplate = async (templateId, query) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        await getTemplateForSection(templateId); // Validates templateId

        // No real pagination needed usually as sections are part of a template, but can add if lists get very long
        // const { page = 1, limit = 50 } = query; // Example

        const sections = await prisma.admissionLetterSection.findMany({
            where: { templateId: parseInt(templateId, 10) },
            select: sectionSelection,
            orderBy: { order: 'asc' }
        });
        return sections; // Return array directly
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching sections for template:", error.message, error.stack);
        throw new AppError('Could not retrieve sections.', 500);
    }
};

export const getSectionById = async (sectionId) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const id = parseInt(sectionId, 10);
        if (isNaN(id)) throw new AppError('Invalid Section ID format.', 400);

        const section = await prisma.admissionLetterSection.findUnique({
            where: { id },
            select: sectionSelection
        });
        if (!section) throw new AppError('Admission letter section not found.', 404);
        return section;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching section by ID:", error.message, error.stack);
        throw new AppError('Could not retrieve section.', 500);
    }
};

export const updateSectionInTemplate = async (sectionId, updateData) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const id = parseInt(sectionId, 10);
        if (isNaN(id)) throw new AppError('Invalid Section ID format.', 400);

        const existingSection = await prisma.admissionLetterSection.findUnique({ where: { id } });
        if (!existingSection) throw new AppError('Section not found for update.', 404);

        const dataForDb = {};
        const { sectionType, title, content, order, isConditional, conditionField } = updateData;

        // TemplateId should not be changed for an existing section. If it needs to move, delete and re-create.
        if (updateData.templateId && parseInt(updateData.templateId,10) !== existingSection.templateId){
            throw new AppError("Cannot change the templateId of an existing section.", 400);
        }

        if (sectionType) {
            if (!Object.values(LetterSectionType).includes(sectionType)) {
                throw new AppError(`Invalid Section Type: '${sectionType}'.`, 400);
            }
            dataForDb.sectionType = sectionType;
        }
        if (updateData.hasOwnProperty('title')) dataForDb.title = title;
        if (content) dataForDb.content = content;
        if (order !== undefined) {
            const pOrder = parseInt(order, 10);
            if (isNaN(pOrder)) throw new AppError('Order must be a number.', 400);
            // Check for order conflict if order is changing
            if (pOrder !== existingSection.order) {
                const orderConflict = await prisma.admissionLetterSection.findFirst({
                    where: { templateId: existingSection.templateId, order: pOrder, id: { not: id } }
                });
                if (orderConflict) throw new AppError(`Order ${pOrder} already exists for this template.`, 409);
            }
            dataForDb.order = pOrder;
        }
        if (isConditional !== undefined) dataForDb.isConditional = Boolean(isConditional);
        if (updateData.hasOwnProperty('conditionField')) dataForDb.conditionField = conditionField;


        if (Object.keys(dataForDb).length === 0) throw new AppError('No valid fields to update.', 400);

        const updatedSection = await prisma.admissionLetterSection.update({
            where: { id },
            data: dataForDb,
            select: sectionSelection
        });
        return updatedSection;
    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2002' && error.meta?.target?.includes('order') && error.meta?.target?.includes('templateId')) {
            // Fallback for the explicit check above
            throw new AppError(`Order conflict for this template.`, 409);
        }
        console.error("Error updating section:", error.message, error.stack);
        throw new AppError('Could not update section.', 500);
    }
};

export const deleteSectionFromTemplate = async (sectionId) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const id = parseInt(sectionId, 10);
        if (isNaN(id)) throw new AppError('Invalid Section ID format.', 400);

        const existingSection = await prisma.admissionLetterSection.findUnique({ where: { id } });
        if (!existingSection) throw new AppError('Section not found for deletion.', 404);

        await prisma.admissionLetterSection.delete({ where: { id } });
        return { message: 'Admission letter section deleted successfully.' };
    } catch (error) {
        if (error instanceof AppError) throw error;
        // P2003 unlikely for this model unless other models directly reference AdmissionLetterSection.id
        console.error("Error deleting section:", error.message, error.stack);
        throw new AppError('Could not delete section.', 500);
    }
};