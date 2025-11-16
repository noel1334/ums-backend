import * as RegistrationService from '../services/studentCourseRegistration.service.js';
import AppError from '../utils/AppError.js'; // Ensure AppError is correctly imported
import catchAsync from '../utils/catchAsync.js'; // Ensure catchAsync is imported

// --- Controller Function: registerStudentForCourse ---
// Used for students registering themselves or staff registering for one or more students
export const registerStudentForCourse = catchAsync(async (req, res, next) => {
    const { registrations } = req.body; // Frontend sends { registrations: [...] }
    if (!Array.isArray(registrations) || registrations.length === 0) {
        return next(new AppError('No courses provided for registration.', 400));
    }

    const newRegistrations = [];
    for (const reg of registrations) {
        let registrationDataForService = { ...reg };

        // If the user is a student, ensure studentId is set from their own user ID
        // If it's staff, `reg.studentId` from the frontend payload will be used.
        if (req.user.type === 'student') {
            if (registrationDataForService.studentId && parseInt(registrationDataForService.studentId, 10) !== req.user.id) {
                return next(new AppError("Students can only register themselves.", 403));
            }
            registrationDataForService.studentId = req.user.id;
        }
        // For staff roles, reg.studentId will already be populated from the frontend form

        const newReg = await RegistrationService.registerStudentForCourse(registrationDataForService, req.user);
        newRegistrations.push(newReg);
    }

    res.status(201).json({
        status: 'success',
        message: 'Courses registered successfully.',
        data: { registrations: newRegistrations },
    });
});

// --- Controller Function: getRegistrationById ---
// Used for viewing a single registration's details
export const getRegistrationById = catchAsync(async (req, res, next) => {
    const registration = await RegistrationService.getStudentCourseRegistrationById(req.params.id, req.user);
    res.status(200).json({ status: 'success', data: { registration } });
});

// --- Controller Function: getAllRegistrations ---
// Used for listing all registrations (with filters)
export const getAllRegistrations = catchAsync(async (req, res, next) => {
    const result = await RegistrationService.getAllStudentCourseRegistrations(req.query, req.user);
    res.status(200).json({ status: 'success', data: result });
});

// --- Controller Function: getRegistrationCompletionCount ---
export const getRegistrationCompletionCount = catchAsync(async (req, res, next) => {
    const result = await RegistrationService.getCourseRegistrationCompletionCount(req.query);
    res.status(200).json({
        status: 'success',
        data: result,
    });
});

// --- Controller Function: updateRegistration (for individual registration update) ---
export const updateRegistration = catchAsync(async (req, res, next) => {
    if (Object.keys(req.body).length === 0) {
        return next(new AppError('No data provided for update.', 400));
    }
    const updatedRegistration = await RegistrationService.updateStudentCourseRegistration(req.params.id, req.body, req.user);
    res.status(200).json({
        status: 'success',
        message: 'Registration updated successfully.',
        data: { registration: updatedRegistration },
    });
});

// --- Controller Function: deleteRegistration (for individual registration deletion) ---
export const deleteRegistration = catchAsync(async (req, res, next) => {
    await RegistrationService.deleteStudentCourseRegistration(req.params.id, req.user);
    res.status(204).json({ status: 'success', data: null });
});

// --- Controller Function: getMyRegisteredCourses (for student's self-view) ---
export const getMyRegisteredCourses = catchAsync(async (req, res, next) => {
    // req.user.id is guaranteed to be student's ID here by authorization
    const result = await RegistrationService.getStudentRegisteredCourses(req.user.id, req.query);
    res.status(200).json({
        status: 'success',
        message: 'Successfully retrieved your registered courses.',
        data: result,
    });
});

// --- Controller Function: deleteMultipleRegistrations (for bulk deletion) ---
export const deleteMultipleRegistrations = catchAsync(async (req, res, next) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
        return next(new AppError('No registration IDs provided for deletion.', 400));
    }
    const result = await RegistrationService.deleteMultipleStudentCourseRegistrations(ids, req.user);
    res.status(200).json({
        status: 'success',
        message: result.message,
        data: null,
    });
});

// --- Controller Function: updateMyRegistrationsForPeriod (for student's self comprehensive update) ---
// This handles a student comprehensively adding/removing courses for a given period (season/semester/level)
export const updateMyRegistrationsForPeriod = catchAsync(async (req, res, next) => {
    const { seasonId, semesterId, levelId, desiredCourses } = req.body; // Expect full desired state
    if (!seasonId || !semesterId || !levelId || !desiredCourses) {
        return next(new AppError('Season ID, Semester ID, Level ID, and desiredCourses array are required.', 400));
    }
    // Student's own ID will be pulled from req.user by the service for self-updates
    const studentId = req.user.id;
    const result = await RegistrationService.updateMyRegistrationsForPeriod(
        studentId, seasonId, semesterId, levelId, desiredCourses, req.user
    );
    res.status(200).json({
        status: 'success',
        message: result.message,
        data: result,
    });
});

// --- NEW CONTROLLER FUNCTION: updateStudentRegistrationsByStaff ---
// Allows staff (Admin, ICT, HOD, Examiner) to comprehensively update a specific student's registrations for a period.
export const updateStudentRegistrationsByStaff = catchAsync(async (req, res, next) => {
    const studentId = req.params.studentId; // Get studentId from URL params for target student
    const { seasonId, semesterId, levelId, desiredCourses } = req.body;

    if (!studentId || !seasonId || !semesterId || !levelId || !desiredCourses) {
        return next(new AppError('Student ID, Season ID, Semester ID, Level ID, and desiredCourses array are required.', 400));
    }

    const result = await RegistrationService.updateStudentRegistrationsForPeriodByStaff(
        studentId, seasonId, semesterId, levelId, desiredCourses, req.user
    );

    res.status(200).json({
        status: 'success',
        message: result.message,
        data: result,
    });
});

// --- THIS IS THE FUNCTION TO FIX ---
export const getRegisteredStudents = async (req, res, next) => {
    try {
        const { courseId, semesterId, seasonId } = req.query;

        if (!courseId || !semesterId || !seasonId) {
            return next(new AppError('Query parameters "courseId", "semesterId", and "seasonId" are required.', 400));
        }

        // >>>>>> THE FIX IS ON THIS LINE <<<<<<
        // Change "StudentCourseRegistrationService" to "RegistrationService"
        const result = await RegistrationService.getRegisteredStudents(
            { courseId, semesterId, seasonId },
            req.query
        );

        res.status(200).json({ status: 'success', data: result });
    } catch (error) {
        next(error);
    }
};