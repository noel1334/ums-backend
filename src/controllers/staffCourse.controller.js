

import * as StaffCourseService from '../services/staffCourse.service.js';
import AppError from '../utils/AppError.js';
import catchAsync from '../utils/catchAsync.js'; // Assuming you have a catchAsync utility

// --- Controller Function: assignCourseToLecturer ---
export const assignCourseToLecturer = catchAsync(async (req, res, next) => {
    const assignment = await StaffCourseService.assignCourseToLecturer(req.body, req.user);
    res.status(201).json({
        status: 'success',
        message: 'Course assigned to lecturer successfully.',
        data: { assignment },
    });
});

// --- Controller Function: getStaffCourseAssignmentById ---
export const getStaffCourseAssignmentById = catchAsync(async (req, res, next) => {
    const assignment = await StaffCourseService.getStaffCourseAssignmentById(req.params.id);
    // Note: Fine-grained authorization for viewing specific assignments is handled in the service or middleware chain.
    res.status(200).json({ status: 'success', data: { assignment } });
});

// --- Controller Function: getAllStaffCourseAssignments ---
export const getAllStaffCourseAssignments = catchAsync(async (req, res, next) => {
    const result = await StaffCourseService.getAllStaffCourseAssignments(req.query, req.user);
    res.status(200).json({ status: 'success', data: result });
});

// --- Controller Function: updateStaffCourseAssignment ---
export const updateStaffCourseAssignment = catchAsync(async (req, res, next) => {
    // Note: Service layer currently throws an error if attempting to update core assignment details.
    const updatedAssignment = await StaffCourseService.updateStaffCourseAssignment(req.params.id, req.body, req.user);
    res.status(200).json({
        status: 'success',
        message: 'Assignment updated successfully.',
        data: { assignment: updatedAssignment },
    });
});

// --- Controller Function: removeCourseAssignment ---
export const removeCourseAssignment = catchAsync(async (req, res, next) => {
    await StaffCourseService.removeCourseAssignment(req.params.id, req.user);
    res.status(204).json({ status: 'success', data: null });
});

// --- NEW CONTROLLER FUNCTION: getMyAssignedCourses ---
/**
 * Fetches all courses assigned to the authenticated lecturer for a specific season and semester.
 */
export const getMyAssignedCourses = catchAsync(async (req, res, next) => {
    const { seasonId, semesterId } = req.query;

    if (!seasonId || !semesterId) {
        return next(new AppError('Season ID and Semester ID are required query parameters.', 400));
    }

    // The lecturer's ID is retrieved from the authenticated user object (req.user)
    const lecturerId = req.user.id; // Assuming req.user.id is correctly populated by auth middleware

    const result = await StaffCourseService.getLecturerAssignedCourses(lecturerId, seasonId, semesterId);

    res.status(200).json({
        status: 'success',
        message: 'Assigned courses retrieved successfully.',
        data: result,
    });
});