// src/routes/admissionLetterTemplate.routes.js

import { Router } from 'express';
import * as AdmissionLetterTemplateController from '../controllers/admissionLetterTemplate.controller.js';
import { authenticateToken, authenticateApplicantToken, authorizeAdmin } from '../middlewares/auth.middleware.js';
import admissionLetterSectionRoutes from './admissionLetterSection.routes.js'; 
import uploadImageMiddleware from '../middlewares/uploadImage.middleware.js';

const router = Router();

const TEMPLATE_IMAGE_FIELDS = [
    { name: 'schoolLogo', maxCount: 1 },
    { name: 'registrarSignature', maxCount: 1 }
];

router.route('/')
    .post(
        authenticateToken, 
        authorizeAdmin, 
        uploadImageMiddleware(TEMPLATE_IMAGE_FIELDS, 'fields'), 
        AdmissionLetterTemplateController.createLetterTemplate
    )
    .get(authenticateToken, authorizeAdmin, AdmissionLetterTemplateController.getAllLetterTemplates);

// IMPORTANT: ADD THIS NEW ROUTE FOR APPLICANTS
router.get('/active', authenticateApplicantToken, AdmissionLetterTemplateController.getActiveLetterTemplateForApplicant); 

router.route('/:id') 
    .get(authenticateToken, authorizeAdmin, AdmissionLetterTemplateController.getLetterTemplateById)
    .put(
        authenticateToken, 
        authorizeAdmin, 
        uploadImageMiddleware(TEMPLATE_IMAGE_FIELDS, 'fields'), 
        AdmissionLetterTemplateController.updateLetterTemplate
    )
    .delete(authenticateToken, authorizeAdmin, AdmissionLetterTemplateController.deleteLetterTemplate);

router.use('/:templateId/sections', admissionLetterSectionRoutes);

export default router;