// src/routes/registrationControl.routes.js
import express from 'express';
import * as registrationControlController from '../controllers/registrationControl.controller.js';
import { authenticateApplicantToken, authenticateToken, authorizeAdmin } from '../middlewares/auth.middleware.js';

import { DegreeType } from '../generated/prisma/index.js'; // For type checking/validation if needed

const router = express.Router();



router
    .route('/')
    .post( authenticateToken, authorizeAdmin, registrationControlController.createRegistrationControl) // For initial setup of control entries
    .get(registrationControlController.getAllRegistrationControls); // For admin panel to view all

router
    .route('/:degreeType')
    .put(authenticateToken, authorizeAdmin, registrationControlController.updateRegistrationControl); // For admin to toggle/update status

// Applicant-facing route (can be accessed by anyone, so no 'protect' middleware here directly)
// Or, if your application has a general applicant protection for all its API, you might apply it.
// For now, let's assume it can be public. If not, add `protect` and `authorize(['applicant', 'admin'])`.
router.get('/:degreeType/status', registrationControlController.getRegistrationStatus);

export default router;