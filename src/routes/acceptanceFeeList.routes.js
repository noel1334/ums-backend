// src/routes/acceptanceFeeList.routes.js
import { Router } from 'express';
import * as AcceptanceFeeListController from '../controllers/acceptanceFeeList.controller.js';
import { authenticateToken, authorizeAdmin, authenticateApplicantToken } from '../middlewares/auth.middleware.js'; // Assuming authenticateApplicantToken exists

const router = Router();

// --- Admin Routes ---
router.route('/')
    .post(authenticateToken, authorizeAdmin, AcceptanceFeeListController.createAcceptanceFee)
    .get(authenticateToken, authorizeAdmin, AcceptanceFeeListController.getAllAcceptanceFees);

router.route('/:id')
    .get(authenticateToken, authorizeAdmin, AcceptanceFeeListController.getAcceptanceFeeById)
    .put(authenticateToken, authorizeAdmin, AcceptanceFeeListController.updateAcceptanceFee)
    .delete(authenticateToken, authorizeAdmin, AcceptanceFeeListController.deleteAcceptanceFee);

// --- Applicant Route ---
// Applicant gets their specific applicable acceptance fee
router.get('/me/applicable',
    authenticateApplicantToken, // Special auth for logged-in applicant on screening portal
    AcceptanceFeeListController.getMyApplicableAcceptanceFee
);

export default router;