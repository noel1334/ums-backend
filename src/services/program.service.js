// src/services/programService.js

import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
// Import new enum type
import { DegreeType, StudyMode } from '../generated/prisma/index.js';

const programPublicSelection = {
    id: true, programCode: true, name: true, degree: true, degreeType: true,
    duration: true, departmentId: true, createdAt: true, updatedAt: true,
    modeOfStudy: true, // <-- ADDED: Include modeOfStudy in the selection
    department: { select: { id: true, name: true, faculty: { select: { id: true, name: true } } } },
    _count: {
        select: { students: true, programCourses: true }
    }
};

export const createProgram = async (programData) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const { programCode, name, degree, degreeType, duration, departmentId, modeOfStudy } = programData; // <-- ADDED modeOfStudy

        if (!programCode || !name || !degree || !degreeType || duration === undefined || !departmentId || !modeOfStudy) { // <-- Validate modeOfStudy
            throw new AppError('Program code, name, degree, degree type, duration, department ID, and mode of study are required.', 400);
        }
        if (!Object.values(DegreeType).includes(degreeType)) {
            throw new AppError(`Invalid degree type: ${degreeType}. Must be one of ${Object.values(DegreeType).join(', ')}.`, 400);
        }
        if (!Object.values(StudyMode).includes(modeOfStudy)) { // <-- Validate modeOfStudy enum
            throw new AppError(`Invalid mode of study: ${modeOfStudy}. Must be one of ${Object.values(StudyMode).join(', ')}.`, 400);
        }

        const pDuration = parseInt(duration, 10);
        const pDepartmentId = parseInt(departmentId, 10);

        if (isNaN(pDuration) || pDuration <= 0) {
            throw new AppError('Duration must be a positive integer.', 400);
        }
        if (isNaN(pDepartmentId)) {
            throw new AppError('Invalid department ID format.', 400);
        }

        const department = await prisma.department.findUnique({ where: { id: pDepartmentId } });
        if (!department) throw new AppError(`Department with ID ${pDepartmentId} not found.`, 404);

        const newProgram = await prisma.program.create({
            data: {
                programCode,
                name,
                degree,
                degreeType,
                duration: pDuration,
                departmentId: pDepartmentId,
                modeOfStudy, // <-- ADDED: modeOfStudy to data
            },
            select: programPublicSelection
        });
        return newProgram;
    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2002') {
            const target = error.meta?.target;
            const constraintName = error.meta?.constraint;

            if (target?.includes('programCode') || constraintName === 'Program_programCode_key') {
                throw new AppError(`A program with Program Code '${programData.programCode}' already exists.`, 409);
            }
            if (constraintName === 'unique_program_offering_in_department' ||
                (target?.includes('name') && target?.includes('degree') && target?.includes('degreeType') && target?.includes('departmentId'))) {
                throw new AppError(`This program (name, degree, type) already exists in department ID ${programData.departmentId}.`, 409);
            }
            throw new AppError('A program with some unique field(s) already exists.', 409);
        }
        console.error("Error creating program:", error.message, error.stack);
        throw new AppError('Could not create program.', 500);
    }
};

export const getProgramById = async (id) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const programId = parseInt(id, 10);
        if (isNaN(programId)) throw new AppError('Invalid program ID format.', 400);

        const program = await prisma.program.findUnique({
            where: { id: programId },
            select: {
                ...programPublicSelection,
                programCourses: {
                    where: { isActive: true, course: { isActive: true } },
                    select: {
                        id: true, isElective: true,
                        level: { select: { id: true, name: true } },
                        course: { select: { id: true, code: true, title: true, creditUnit: true } }
                    },
                    orderBy: [{ level: { name: 'asc' } }, { course: { code: 'asc' } }]
                }
            }
        });
        if (!program) throw new AppError('Program not found.', 404);
        return program;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching program by ID:", error.message, error.stack);
        throw new AppError('Could not retrieve program.', 500);
    }
};

export const getAllPrograms = async (query) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        
        // --- ADD THIS LOG HERE ---
        console.log("[Backend Program Service] getAllPrograms called with query:", query);
        // --- END LOG ---

        const { departmentId, degreeType, name, programCode, page = 1, limit = 10, modeOfStudy } = query;
        const where = {};

        if (departmentId) where.departmentId = parseInt(departmentId, 10);
        if (degreeType && Object.values(DegreeType).includes(degreeType)) where.degreeType = degreeType;
        if (name) where.name = { contains: name }; // This is where the search term is used
        if (programCode) where.programCode = { contains: programCode };
        if (modeOfStudy && Object.values(StudyMode).includes(modeOfStudy)) where.modeOfStudy = modeOfStudy;

        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;

        const programs = await prisma.program.findMany({
            where,
            select: programPublicSelection,
            orderBy: [{ department: { name: 'asc' } }, { name: 'asc' }],
            skip, take: limitNum
        });
        const totalPrograms = await prisma.program.count({ where });
        return { programs, totalPages: Math.ceil(totalPrograms / limitNum), currentPage: pageNum, totalPrograms };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching programs:", error.message, error.stack);
        throw new AppError('Could not retrieve program list.', 500);
    }
};

export const updateProgram = async (id, updateData) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const programId = parseInt(id, 10);
        if (isNaN(programId)) throw new AppError('Invalid program ID format.', 400);

        const existingProgram = await prisma.program.findUnique({ where: { id: programId } });
        if (!existingProgram) throw new AppError('Program not found for update.', 404);

        const { programCode, name, degree, degreeType, duration, departmentId, modeOfStudy } = updateData; // <-- ADDED modeOfStudy
        const dataToUpdate = {};

        if (programCode !== undefined) {
            if (programCode !== existingProgram.programCode) {
                const codeConflict = await prisma.program.findFirst({ where: { programCode, id: { not: programId } } });
                if (codeConflict) throw new AppError(`Program Code '${programCode}' already exists.`, 409);
            }
            dataToUpdate.programCode = programCode;
        }
        if (name !== undefined) dataToUpdate.name = name;
        if (degree !== undefined) dataToUpdate.degree = degree;
        if (degreeType !== undefined) {
            if (!Object.values(DegreeType).includes(degreeType)) {
                throw new AppError('Invalid degree type for update.', 400);
            }
            dataToUpdate.degreeType = degreeType;
        }
        if (duration !== undefined) {
            const pDuration = parseInt(duration, 10);
            if (isNaN(pDuration) || pDuration <= 0) throw new AppError('Invalid duration for update.', 400);
            dataToUpdate.duration = pDuration;
        }
        if (departmentId !== undefined) {
            const pDepartmentId = parseInt(departmentId, 10);
            if (isNaN(pDepartmentId)) throw new AppError('Invalid department ID for update.', 400);
            const dept = await prisma.department.findUnique({ where: { id: pDepartmentId } });
            if (!dept) throw new AppError(`Target department ID ${pDepartmentId} not found.`, 404);
            dataToUpdate.departmentId = pDepartmentId;
        }
        if (modeOfStudy !== undefined) { // <-- ADDED: Handle modeOfStudy update
            if (!Object.values(StudyMode).includes(modeOfStudy)) {
                throw new AppError('Invalid mode of study for update.', 400);
            }
            dataToUpdate.modeOfStudy = modeOfStudy;
        }

        if (Object.keys(dataToUpdate).length === 0) {
            throw new AppError('No valid fields provided for update.', 400);
        }

        const updatedProgram = await prisma.program.update({
            where: { id: programId },
            data: dataToUpdate,
            select: programPublicSelection
        });
        return updatedProgram;
    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2002') {
            const target = error.meta?.target;
            const constraintName = error.meta?.constraint;
            if (target?.includes('programCode') || constraintName === 'Program_programCode_key') {
                throw new AppError(`Update failed: Program Code '${updateData.programCode}' already exists.`, 409);
            }
            if (constraintName === 'unique_program_offering_in_department' ||
                (target?.includes('name') && target?.includes('degree') && target?.includes('degreeType') && target?.includes('departmentId'))) {
                throw new AppError(`Update failed: This program (name, degree, type) already exists in the target department.`, 409);
            }
            throw new AppError('Update failed due to a unique constraint violation.', 409);
        }
        console.error("Error updating program:", error.message, error.stack);
        throw new AppError('Could not update program.', 500);
    }
};

export const deleteProgram = async (id) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const programId = parseInt(id, 10);
        if (isNaN(programId)) throw new AppError('Invalid program ID format.', 400);

        const existingProgram = await prisma.program.findUnique({
            where: { id: programId },
            include: { _count: { select: { students: true, programCourses: true, results: true, schoolFees: true, schoolFeeLists: true } } }
        });
        if (!existingProgram) throw new AppError('Program not found for deletion.', 404);

        if (existingProgram._count.students > 0) throw new AppError(`Cannot delete program. It has ${existingProgram._count.students} student(s).`, 400);
        if (existingProgram._count.results > 0) throw new AppError(`Cannot delete program. It has ${existingProgram._count.results} result(s).`, 400);
        if (existingProgram._count.schoolFees > 0) throw new AppError(`Cannot delete program. It has ${existingProgram._count.schoolFees} school fee record(s).`, 400);
        if (existingProgram._count.schoolFeeLists > 0) throw new AppError(`Cannot delete program. It is used in ${existingProgram._count.schoolFeeLists} school fee list item(s).`, 400);

        await prisma.program.delete({ where: { id: programId } });
        return { message: `Program '${existingProgram.name}' and its course mappings deleted successfully.` };
    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2003') {
            throw new AppError('Cannot delete program. It is still referenced by other essential records.', 400);
        }
        console.error("Error deleting program:", error.message, error.stack);
        throw new AppError('Could not delete program.', 500);
    }
};