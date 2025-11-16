// src/controllers/studentAssignment.controller.js
import * as StudentExamAssignmentService from '../services/studentExamAssignment.service.js'; // Re-use existing service
import AppError from '../utils/AppError.js';

/**
 * Gets all exam assignments for the authenticated student.
 * Accessible via /api/v1/student-assignments/me
 */
export const getMyAssignments = async (req, res, next) => {
    try {
        if (req.user.type !== 'student') {
            return next(new AppError('Unauthorized: Only students can access this endpoint.', 403));
        }

        // Change from req.user.userId to req.user.id
        const studentId = req.user.id; // <-- CORRECTED LINE
        
        const result = await StudentExamAssignmentService.getAssignmentsForStudent(studentId, req.query, req.user);
        res.status(200).json({ status: 'success', data: result });
    } catch (error) {
        next(error);
    }
};

/**
 * Gets all exam assignments for a specific student ID (for staff/admin).
 * Accessible via /api/v1/student-assignments/:studentId
 */
export const getStudentAssignments = async (req, res, next) => {
    try {
        const { studentId } = req.params;
        const result = await StudentExamAssignmentService.getAssignmentsForStudent(studentId, req.query, req.user);
        res.status(200).json({ status: 'success', data: result });
    } catch (error) {
        next(error);
    }
};