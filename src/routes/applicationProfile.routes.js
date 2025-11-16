// src/routes/applicationProfile.routes.js
import { Router } from 'express';
import * as ApplicationProfileController from '../controllers/applicationProfile.controller.js';
import {
    authenticateToken, // For Admin routes
    authorize,
    authenticateApplicantToken // For Applicant self-service routes
} from '../middlewares/auth.middleware.js';
import uploadImageMiddleware from '../middlewares/uploadImage.middleware.js';

const router = Router();
const canView = authorize(['admin', 'ictstaff']);

router.post('/initiate', ApplicationProfileController.createApplicantProfile);


// Routes for an authenticated applicant (they have logged into the screening portal)
router.get('/me', authenticateApplicantToken, ApplicationProfileController.getMyApplicationProfile);
router.put('/me', authenticateApplicantToken, ApplicationProfileController.updateMyApplicationProfile);
router.post('/me/submit', authenticateApplicantToken, ApplicationProfileController.submitMyApplicationProfile);

router.get(
    '/', 
    authenticateToken,
    canView,
    ApplicationProfileController.getAllApplicationProfilesAsAdmin
);
router.get('/:id',
    authenticateToken, 
    canView, 
    ApplicationProfileController.getApplicationProfileByIdAsAdmin
);
router.post('/me/document', 
    authenticateApplicantToken, 
    uploadImageMiddleware('documentFile', 'single'), 
    ApplicationProfileController.uploadApplicantDocument
);

router.patch(
    '/:id/admin-update',
    authenticateToken,
  canView,
    ApplicationProfileController.updateProfileByAdmin
);
router.put('/me/step/:step', authenticateApplicantToken, uploadImageMiddleware('profileImg', 'single'),  ApplicationProfileController.saveApplicationStep);


export default router;