import { Router } from 'express';
import * as ResultController from '../controllers/result.controller.js';
import {
    authenticateToken,
    authorizeAdmin,
    authorizeResultManager, 
    authorizeResultViewer, 
    authorize,
} from '../middlewares/auth.middleware.js';

const router = Router();

// Define authorization helpers
const staffManagementRoles = ['admin', 'ictstaff', 'lecturer']; // Roles allowed to query external IDs
const studentRole = ['student']; // Role for self-service
const canGenerateAndDeleteResults = authorize(['admin', 'ictstaff']);

// Generate, Approve, Get All, Get By ID... (Remain the same)

router.post('/generate', authenticateToken, authorizeResultManager, ResultController.generateResultsForSemester);
router.patch('/approve-release', authenticateToken, authorizeAdmin, ResultController.approveResultsForRelease);
router.get('/', authenticateToken, authorizeResultViewer, ResultController.getAllResults);
router.get('/:id', authenticateToken, authorizeResultViewer, ResultController.getResultById);


// =================================================================================
// --- FIX 1: Student's OWN History (MUST COME FIRST) ---
// Correct path: /api/v1/results/student-history/me
router.get(
    '/student-history/me',
    authenticateToken,
    authorize(studentRole), // Only the student can use this path
    ResultController.getStudentResultHistoryMinimalController
);
// =================================================================================


// =================================================================================
// --- FIX 2: Staff Access Other Students (Second in Order) ---
// Correct path: /api/v1/results/student-history/123
router.get(
    '/student-history/:studentId',
    authenticateToken,
    authorize(staffManagementRoles), // Only staff can use the parameterized path
    ResultController.getStudentResultHistoryMinimalController
);
// =================================================================================
// Single Result Deletion
router.delete('/:id', authenticateToken, canGenerateAndDeleteResults, ResultController.deleteResult);

// Batch Result Deletion
// Using a POST for batch deletion is often preferred to allow a request body for IDs,
// although semantically DELETE can also have a body.
router.post('/batch-delete', authenticateToken, canGenerateAndDeleteResults, ResultController.deleteManyResults);

export default router;