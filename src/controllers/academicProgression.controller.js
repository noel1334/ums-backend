import * as AcademicProgressionService from '../services/academicProgression.service.js';
import AppError from '../utils/AppError.js';
import { DegreeType } from '../generated/prisma/index.js'; // Ensure DegreeType is imported for validation

export const progressStudents = async (req, res, next) => {
    try {
        const { targetSeasonId, scope, scopeId, specificDegreeType, targetSemesterId } = req.body; // NEW: Added targetSemesterId

        if (!targetSeasonId || !scope) {
            return next(new AppError('targetSeasonId and scope are required in the request body.', 400));
        }
        if (scope !== 'ALL' && !scopeId && ['FACULTY', 'DEPARTMENT', 'PROGRAM'].includes(scope)) {
            return next(new AppError(`scopeId is required when scope is ${scope}.`, 400));
        }
        if (specificDegreeType && !Object.values(DegreeType).includes(specificDegreeType)) {
            return next(new AppError(`Invalid specificDegreeType provided: ${specificDegreeType}.`, 400));
        }
        // NEW: Validate targetSemesterId if provided
        if (targetSemesterId !== null && targetSemesterId !== undefined) {
            const parsedTargetSemesterId = parseInt(targetSemesterId, 10);
            if (isNaN(parsedTargetSemesterId)) {
                return next(new AppError('Invalid targetSemesterId format. Must be a number or null/undefined.', 400));
            }
        }


        const result = await AcademicProgressionService.progressStudentsToNextLevel({
            targetSeasonId,
            scope,
            scopeId,
            specificDegreeType,
            targetSemesterId: targetSemesterId !== null && targetSemesterId !== undefined ? parseInt(targetSemesterId, 10) : undefined, // NEW: Pass parsed targetSemesterId
        });

        res.status(200).json({
            status: 'success',
            message: result.message,
            data: {
                progressedCount: result.progressedCount,
                studentsConsidered: result.studentsConsidered,
                failedToProgress: result.failedToProgress,
            }
        });
    } catch (error) {
        next(error);
    }
};

export const batchUpdateStudentsAcademicContext = async (req, res, next) => {
    try {
        const { targetSeasonId, degreeTypeUpdates, scope, scopeId } = req.body;

        // Basic validation for required fields
        if (!targetSeasonId) {
            throw new AppError('Target season ID is required.', 400);
        }
        if (!Array.isArray(degreeTypeUpdates) || degreeTypeUpdates.length === 0) {
            throw new AppError('An array of degreeTypeUpdates is required.', 400);
        }
        if (!scope || !['ALL', 'FACULTY', 'DEPARTMENT', 'PROGRAM'].includes(scope)) {
            throw new AppError('Invalid scope provided. Must be ALL, FACULTY, DEPARTMENT, or PROGRAM.', 400);
        }
        if (scope !== 'ALL' && !scopeId) {
            throw new AppError(`Scope ID is required when scope is ${scope}.`, 400);
        }

        // Validate each entry in degreeTypeUpdates
        for (const update of degreeTypeUpdates) {
            if (!update.degreeType || !Object.values(DegreeType).includes(update.degreeType)) {
                throw new AppError(`Invalid or missing degreeType in an update entry. Found: ${update.degreeType}`, 400);
            }
            if (update.newSemesterId !== null && update.newSemesterId !== undefined && isNaN(parseInt(update.newSemesterId))) {
                 throw new AppError(`Invalid newSemesterId format for ${update.degreeType}. Must be a number or null/undefined.`, 400);
            }
            if (update.newLevelId !== null && update.newLevelId !== undefined && isNaN(parseInt(update.newLevelId))) {
                throw new AppError(`Invalid newLevelId format for ${update.degreeType}. Must be a number or null/undefined.`, 400);
            }
        }


        const result = await AcademicProgressionService.batchUpdateStudentsAcademicContext({
            targetSeasonId: parseInt(targetSeasonId, 10),
            degreeTypeUpdates,
            scope,
            scopeId: scopeId ? parseInt(scopeId, 10) : undefined
        });

        res.status(200).json({
            status: 'success',
            message: result.message,
            data: {
                updatedCount: result.updatedCount,
                studentsConsidered: result.studentsConsidered,
                failedToUpdate: result.failedToUpdate,
                updatesApplied: result.updatesApplied,
            }
        });
    } catch (error) {
        next(error);
    }
};

export const batchGraduateStudents = async (req, res, next) => {
    try {
        const { targetSeasonId, targetSemesterId, scope, scopeId, specificDegreeType } = req.body;

        if (!targetSeasonId || !scope) {
            throw new AppError('targetSeasonId and scope are required in the request body.', 400);
        }
        if (scope !== 'ALL' && !scopeId) {
            throw new AppError(`scopeId is required when scope is ${scope}.`, 400);
        }
        if (specificDegreeType && !Object.values(DegreeType).includes(specificDegreeType)) {
            throw new AppError(`Invalid specificDegreeType provided: ${specificDegreeType}.`, 400);
        }
        if (targetSemesterId !== null && targetSemesterId !== undefined) {
            const parsedTargetSemesterId = parseInt(targetSemesterId, 10);
            if (isNaN(parsedTargetSemesterId)) {
                throw new AppError('Invalid targetSemesterId format. Must be a number or null/undefined.', 400);
            }
        }

        const result = await AcademicProgressionService.batchGraduateStudents({
            targetSeasonId: parseInt(targetSeasonId, 10),
            targetSemesterId: targetSemesterId !== null && targetSemesterId !== undefined ? parseInt(targetSemesterId, 10) : undefined,
            scope,
            scopeId: scopeId ? parseInt(scopeId, 10) : undefined,
            specificDegreeType,
        });

        res.status(200).json({
            status: 'success',
            message: result.message,
            data: {
                graduatedCount: result.graduatedCount,
                studentsConsidered: result.studentsConsidered,
                failedToGraduate: result.failedToGraduate,
            }
        });
    } catch (error) {
        next(error);
    }
};