// src/routes/admissionLetterSection.routes.js
import { Router } from 'express';
import * as AdmissionLetterSectionController from '../controllers/admissionLetterSection.controller.js';
import { authenticateToken, authorizeAdmin } from '../middlewares/auth.middleware.js';

// This router is intended to be nested under /admission-letter-templates/:templateId
const router = Router({ mergeParams: true }); // mergeParams allows access to :templateId from parent

// All operations are Admin only and in context of a template
router.route('/')
    .post(authenticateToken, authorizeAdmin, AdmissionLetterSectionController.addSectionToTemplate)
    .get(authenticateToken, authorizeAdmin, AdmissionLetterSectionController.getSectionsForTemplate);

router.route('/:sectionId')
    .get(authenticateToken, authorizeAdmin, AdmissionLetterSectionController.getSectionById)
    .put(authenticateToken, authorizeAdmin, AdmissionLetterSectionController.updateSectionInTemplate)
    .delete(authenticateToken, authorizeAdmin, AdmissionLetterSectionController.deleteSectionFromTemplate);

export default router;