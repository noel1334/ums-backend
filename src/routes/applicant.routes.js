// src/routes/applicant.routes.js
import { Router } from 'express';
import * as applicantController from '../controllers/applicant.controller.js';
import { authenticateApplicantToken, authorize } from '../middlewares/auth.middleware.js'; // Assuming this path

const router = Router();

// --- Public / Registration Routes ---

// Route for ND/NCE self-registration (no JAMB, online screening required)
router.post('/register/direct-entry-nd-nce', applicantController.registerNdNceApplicant);

// Route for Postgraduate/Certificate self-registration (no JAMB, no online screening)
router.post('/register/postgraduate-certificate', applicantController.registerPostgraduateCertificateApplicant);

// NEW ROUTE: For Postgraduate/Master's/PhD/Certificate/Diploma self-registration WITH online screening
router.post('/register/postgraduate-online-screening', applicantController.registerPostgraduateWithOnlineScreeningApplicant); // <--- THIS LINE IS CRITICAL

// Applicant login route (flexible for email or JAMB RegNo)
router.post('/login', applicantController.loginApplicantScreening);

// --- Protected Applicant Profile Routes (Require Applicant-Specific Authentication) ---
router.get('/profile', authenticateApplicantToken, authorize(['applicant']), applicantController.getMyApplicationProfile);
router.put('/profile', authenticateApplicantToken, authorize(['applicant']), applicantController.updateMyApplicationProfile);
router.post('/profile/submit', authenticateApplicantToken, authorize(['applicant']), applicantController.submitApplication);


export default router;