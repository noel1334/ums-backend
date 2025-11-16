// src/controllers/academicProgression.controller.js
import * as AcademicProgressionService from '../services/academicProgression.service.js';
import AppError from '../utils/AppError.js';

export const progressStudents = async (req, res, next) => {
    try {
        const { targetSeasonId, scope, scopeId } = req.body;

        if (!targetSeasonId || !scope) {
            return next(new AppError('targetSeasonId and scope are required in the request body.', 400));
        }
        if (scope !== 'ALL' && !scopeId && ['FACULTY', 'DEPARTMENT', 'PROGRAM'].includes(scope)) {
            return next(new AppError(`scopeId is required when scope is ${scope}.`, 400));
        }


        const result = await AcademicProgressionService.progressStudentsToNextLevel({
            targetSeasonId,
            scope,
            scopeId // Will be undefined if scope is 'ALL', which is fine for the service
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