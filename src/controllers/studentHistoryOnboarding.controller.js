import * as StudentHistoryOnboardingService from '../services/studentHistoryOnboarding.service.js';
import AppError from '../utils/AppError.js';
import catchAsync from '../utils/catchAsync.js';

/**
 * Onboard an individual legacy student with historical results
 */
export const onboardSingleOldStudent = catchAsync(async (req, res, next) => {
    if (Object.keys(req.body).length === 0) {
        return next(new AppError('No legacy student payload provided.', 400));
    }

    const legacyStudent = await StudentHistoryOnboardingService.onboardOldStudent(req.body);

    res.status(201).json({
        status: 'success',
        message: 'Legacy student profile with academic history onboarded successfully.',
        data: { student: legacyStudent }
    });
});

/**
 * Onboard a batch of legacy students from Excel/JSON import
 */
export const batchOnboardOldStudents = catchAsync(async (req, res, next) => {
    const studentDataArray = req.body.students;

    if (!Array.isArray(studentDataArray) || studentDataArray.length === 0) {
        return next(new AppError('Legitimate array list of legacy students must be provided.', 400));
    }

    if (studentDataArray.length > 500) {
        return next(new AppError('Legacy batch payload size exceeded. Please restrict uploads to 500 items per request.', 400));
    }

    const summaryResult = await StudentHistoryOnboardingService.batchOnboardOldStudents(studentDataArray);

    res.status(200).json(summaryResult);
});