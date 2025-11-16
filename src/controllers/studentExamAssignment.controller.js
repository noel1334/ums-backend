// src/controllers/studentExamAssignment.controller.js
import * as StudentExamAssignmentService from '../services/studentExamAssignment.service.js';
import AppError from '../utils/AppError.js';

// --- Single Assignment Operations ---
export const assignStudentToExamSession = async (req, res, next) => {
    try {
        const { examId, sessionId } = req.params; // <<< Get from req.params now
        if (!examId || !sessionId) return next(new AppError('Exam ID and Session ID are required in route parameters.', 400));
        const assignmentData = {
            ...req.body,
            examId: parseInt(examId, 10), // Ensure it's a number for the service
            examSessionId: parseInt(sessionId, 10)
        };
        const newAssignment = await StudentExamAssignmentService.assignStudentToExamSession(assignmentData);
        res.status(201).json({ status: 'success', data: { assignment: newAssignment } });
    } catch (error) { next(error); }
};

export const getAssignmentsForSession = async (req, res, next) => {
    try {
        const { examId, sessionId } = req.params; // <<< Get from req.params now
        if (!examId || !sessionId) return next(new AppError('Exam ID and Session ID are required in route parameters.', 400));
        const result = await StudentExamAssignmentService.getAssignmentsForSession(sessionId, req.query); // Service expects sessionId
        res.status(200).json({ status: 'success', data: result });
    } catch (error) { next(error); }
};

// --- These top-level student-centric routes (getMyAssignments, getStudentAssignments)
//     are now handled by src/controllers/studentAssignment.controller.js.
//     The function below would only be relevant if it were designed for student assignments *within a specific exam/session*,
//     which is not the intent here. Leaving as a comment for context if you decided to put it back here for a different purpose.
/*
export const getAssignmentsForStudent = async (req, res, next) => {
    try {
        const { studentId } = req.params; // If studentId is part of the path
        // No examId or sessionId from parent params in this top-level mounted router.
        // If you need to filter assignments for a student *by exam/session* from here,
        // those filters would need to come from query parameters (e.g., ?examId=X&sessionId=Y)
        const result = await StudentExamAssignmentService.getAssignmentsForStudent(studentId, req.query, req.user);
        res.status(200).json({ status: 'success', data: result });
    } catch (error) { next(error); }
};
*/

export const getAssignmentById = async (req, res, next) => {
    try {
        const { assignmentId } = req.params;
        const assignment = await StudentExamAssignmentService.getAssignmentById(assignmentId /*, req.user*/);
        res.status(200).json({ status: 'success', data: { assignment } });
    } catch (error) { next(error); }
};

export const updateAssignmentSeat = async (req, res, next) => {
    try {
        const { assignmentId } = req.params;
        const { seatNumber } = req.body;
        if (seatNumber === undefined) {
             return next(new AppError('The "seatNumber" field is required in the request body (can be null or empty string).', 400));
        }
        const updatedAssignment = await StudentExamAssignmentService.updateAssignmentSeat(assignmentId, seatNumber);
        res.status(200).json({ status: 'success', data: { assignment: updatedAssignment } });
    } catch (error) { next(error); }
};

export const removeStudentFromExamSession = async (req, res, next) => {
    try {
        const { assignmentId } = req.params;
        const result = await StudentExamAssignmentService.removeStudentFromExamSession(assignmentId);
        res.status(200).json({ status: 'success', message: result.message });
    } catch (error) { next(error); }
};

// --- Batch Assignment Operations ---
export const batchAssignStudentsToExamSessions = async (req, res, next) => {
    try {
        const { examId } = req.params; // <<< Get from req.params now
        if (!examId) return next(new AppError('Exam ID is missing from route parameters.', 400));

        const { studentFilters, options } = req.body;
        if (!studentFilters || Object.keys(studentFilters).length === 0) {
            return next(new AppError('Student filters are required for batch assignment.', 400));
        }

        const result = await StudentExamAssignmentService.batchAssignStudentsToExamSessions(
            examId, // Pass examId to service
            studentFilters,
            options,
            req.user
        );
        res.status(200).json({ status: 'success', data: result });
    } catch (error) {
        next(error);
    }
};

export const batchAssignStudentsToSpecificSession = async (req, res, next) => {
    try {
        const { sessionId } = req.params; // <<< Get from req.params now
        if (!sessionId) return next(new AppError('Exam Session ID is missing from route parameters.', 400));

        const { studentFilters, options } = req.body;
        if (!studentFilters || Object.keys(studentFilters).length === 0) {
            return next(new AppError('Student filters are required for batch assignment to a specific session.', 400));
        }

        const result = await StudentExamAssignmentService.batchAssignStudentsToSpecificSession(
            sessionId, // Pass sessionId to service
            studentFilters,
            options,
            req.user
        );
        res.status(200).json({ status: 'success', data: result });
    } catch (error) {
        next(error);
    }
};

// --- Batch Unassign Operations ---
export const batchUnassignStudentsFromSession = async (req, res, next) => {
    try {
        const { sessionId } = req.params; // <<< Get from req.params now
        if (!sessionId) return next(new AppError('Exam Session ID is missing from route parameters for unassignment.', 400));

        const { studentFilters } = req.body;
        const result = await StudentExamAssignmentService.batchUnassignStudents(
            sessionId,
            'session',
            studentFilters,
            req.user
        );
        res.status(200).json({ status: 'success', data: result });
    } catch (error) {
        next(error);
    }
};

export const batchUnassignStudentsFromExam = async (req, res, next) => {
    try {
        const { examId } = req.params; // <<< Get from req.params now
        if (!examId) return next(new AppError('Exam ID is missing from route parameters for unassignment.', 400));

        const { studentFilters } = req.body;
        const result = await StudentExamAssignmentService.batchUnassignStudents(
            examId,
            'exam',
            studentFilters,
            req.user
        );
        res.status(200).json({ status: 'success', data: result });
    } catch (error) {
        next(error);
    }
};