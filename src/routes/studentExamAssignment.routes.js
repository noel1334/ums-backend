// src/routes/studentExamAssignment.routes.js
import { Router } from 'express';
import * as StudentExamAssignmentController from '../controllers/studentExamAssignment.controller.js';
import { authenticateToken, authorizeAdminOrPermittedICTStaff, authorize } from '../middlewares/auth.middleware.js';

const router = Router(); // <<< IMPORTANT: Removed { mergeParams: true } because it's top-level

const canManageExamAssignments = authorizeAdminOrPermittedICTStaff('canManageExams');

// --- Single Assignment Operations (now explicitly include examId and sessionId) ---

// POST /api/v1/exam-assignments/exam/:examId/session/:sessionId
// Creates a single assignment for a specific exam and session
router.post('/exam/:examId/session/:sessionId',
    authenticateToken,
    canManageExamAssignments,
    StudentExamAssignmentController.assignStudentToExamSession
);

// GET /api/v1/exam-assignments/exam/:examId/session/:sessionId
// Gets all assignments for a specific exam session
router.get('/exam/:examId/session/:sessionId',
    authenticateToken,
    canManageExamAssignments,
    StudentExamAssignmentController.getAssignmentsForSession
);

// Routes for a specific assignment record BY ITS OWN ID
// These are not nested under exam/session, but operate on a specific assignment globally
// GET /api/v1/exam-assignments/:assignmentId
// PATCH /api/v1/exam-assignments/:assignmentId/seat
// DELETE /api/v1/exam-assignments/:assignmentId
router.route('/:assignmentId')
    .get(authenticateToken, canManageExamAssignments, StudentExamAssignmentController.getAssignmentById)
    .patch(authenticateToken, canManageExamAssignments, StudentExamAssignmentController.updateAssignmentSeat)
    .delete(authenticateToken, canManageExamAssignments, StudentExamAssignmentController.removeStudentFromExamSession);


// --- Batch Assignment Operations (now explicitly include examId and sessionId) ---

// POST /api/v1/exam-assignments/batch-assign-random/exam/:examId
// Randomly assigns a batch of students to *any eligible session* within the specified :examId.
router.post('/batch-assign-random/exam/:examId',
    authenticateToken,
    authorize(['admin', 'ictstaff', 'HOD', 'DEAN', 'EXAMINER']),
    StudentExamAssignmentController.batchAssignStudentsToExamSessions // This controller uses req.params.examId
);

// POST /api/v1/exam-assignments/batch-assign-specific/session/:sessionId
// Assigns a batch of students to *this specific session* (specified by :sessionId).
router.post('/batch-assign-specific/session/:sessionId',
    authenticateToken,
    authorize(['admin', 'ictstaff', 'HOD', 'DEAN', 'EXAMINER']),
    StudentExamAssignmentController.batchAssignStudentsToSpecificSession // This controller uses req.params.sessionId
);

// DELETE /api/v1/exam-assignments/batch-unassign-from-session/:sessionId
// Batch unassigns students from *this specific session* (specified by :sessionId).
router.delete('/batch-unassign-from-session/:sessionId',
    authenticateToken,
    authorize(['admin', 'ictstaff', 'HOD', 'DEAN', 'EXAMINER']),
    StudentExamAssignmentController.batchUnassignStudentsFromSession
);

// DELETE /api/v1/exam-assignments/batch-unassign-from-exam/:examId
// Batch unassigns students from *all sessions of the specified exam* (specified by :examId).
router.delete('/batch-unassign-from-exam/:examId',
    authenticateToken,
    authorize(['admin', 'ictstaff', 'HOD', 'DEAN', 'EXAMINER']),
    StudentExamAssignmentController.batchUnassignStudentsFromExam
);

export default router;