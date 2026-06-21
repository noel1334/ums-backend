// src/routes/score.routes.js

import { Router } from 'express';
import * as ScoreController from '../controllers/score.controller.js';
import {
    authenticateToken,
    authorize,
} from '../middlewares/auth.middleware.js';

const router = Router();

// Define authorization groups for clarity
const canManageScores = authorize(['admin', 'ictstaff', 'lecturer']); 
const canApproveAsExaminer = authorize(['admin', 'EXAMINER']);
const canAcceptAsHOD = authorize(['admin', 'HOD']);
const canViewScores = authorize(['admin', 'ictstaff', 'lecturer', 'student']);
const canManageApprovals = authorize(['admin', 'ictstaff', 'HOD', 'EXAMINER']);

// --- CORE ROUTES ---

// Create a new score record (POST /scores)
router.post('/', authenticateToken, canManageScores, ScoreController.createScore);

// Get a list of scores (GET /scores)
router.get('/', authenticateToken, canViewScores, ScoreController.getAllScores);

// =========================================================================
// --- BATCH & CBT Dispatches (Defined BEFORE route parameters ':id') ---
// =========================================================================

// BATCH UPDATE (PUT /scores/batch)
router.put('/batch', authenticateToken, canManageScores, ScoreController.batchUpdateScores); 

// BATCH DELETE (DELETE /scores/batch)
router.delete('/batch', authenticateToken, canManageScores, ScoreController.batchDeleteScores);

// BATCH CREATE (POST /scores/batch)
router.post('/batch', authenticateToken, canManageScores, ScoreController.batchCreateScores);

// --- NEW: Submit CBT Scores to Score Model (POST /scores/submit-cbt) ---
router.post('/submit-cbt', authenticateToken, canManageScores, ScoreController.submitCbtScores);


// Single item routes using route parameter (:id)
router.route('/:id')
    .get(authenticateToken, canViewScores, ScoreController.getScoreById)
    .put(authenticateToken, canManageScores, ScoreController.updateScore) // Single Update
    .delete(authenticateToken, canManageScores, ScoreController.deleteScore); // Single Delete


// --- WORKFLOW ROUTES ---

// Examiner approves a score
router.patch(
    '/:id/approve-examiner',
    authenticateToken,
    canApproveAsExaminer,
    ScoreController.approveScoreByExaminer
);

// HOD accepts a score
router.patch(
    '/:id/accept-hod',
    authenticateToken,
    canAcceptAsHOD,
    ScoreController.acceptScoreByHOD
);

// Examiner de-approves a score
router.patch(
    '/:id/deapprove-examiner',
    authenticateToken,
    canManageApprovals,
    ScoreController.deapproveScoreByExaminer
);

// HOD de-accepts a score
router.patch(
    '/:id/deaccept-hod',
    authenticateToken,
    canManageApprovals,
    ScoreController.deacceptScoreByHOD
);

export default router;