// src/routes/admissionOffer.routes.js
import { Router } from 'express';
import * as AdmissionOfferController from '../controllers/admissionOffer.controller.js';
import {
    authenticateToken,
    authorize,
    authenticateApplicantToken // For applicant-specific actions
    // Add authorizeAdminOrPermittedICTStaff('canManageAdmissions') if ICT can manage offers
} from '../middlewares/auth.middleware.js';

const router = Router();
const authorizeAdminOrICT = authorize(['admin', 'ictstaff']);

router.post('/',
    authenticateToken,
    authorizeAdminOrICT, 
    AdmissionOfferController.createAdmissionOffer
);
router.get('/program-stats',
    authenticateToken,
    authorizeAdminOrICT,
    AdmissionOfferController.getProgramAdmissionStats // New controller for stats
);
router.get('/',
    authenticateToken,
    authorizeAdminOrICT, // Or your specific 'canManageAdmissions' role
    AdmissionOfferController.getAllAdmissionOffers
);
router.post(
    '/batch-create',
    authenticateToken,
    authorizeAdminOrICT,
    AdmissionOfferController.createBatchAdmissionOffers
);

router.route('/:id') // :id is AdmissionOffer.id
    .get(
        authenticateToken,
        authenticateToken, // Or your specific 'canManageAdmissions' role
        AdmissionOfferController.getAdmissionOfferById
    )
    .put( // Admin updating limited fields of an offer
        authenticateToken,
        authenticateToken, // Or your specific 'canManageAdmissions' role
        AdmissionOfferController.updateAdmissionOfferAsAdmin
    )
    .delete( // NEW: Delete Admission Offer
        authenticateToken,
        authorizeAdminOrICT, 
        AdmissionOfferController.deleteAdmissionOffer
    );
    

// --- Applicant Routes (Specific to the logged-in applicant) ---
router.get('/me', // Applicant gets their own current offer
    authenticateApplicantToken,
    AdmissionOfferController.getMyAdmissionOffer
);
router.post(
    '/batch-email-notification',
    authenticateToken,
    authorizeAdminOrICT, // Or a specific role for sending notifications
    AdmissionOfferController.batchEmailAdmissionNotifications
);
router.post(
    '/batch-email-notification-admission',
    authenticateToken,
    authorizeAdminOrICT, // Or a specific role for sending notifications
    AdmissionOfferController.batchEmailNotificationAdmission
);
router.post('/me/respond', // Applicant accepts or rejects their offer
    authenticateApplicantToken,
    AdmissionOfferController.respondToMyAdmissionOffer
);



export default router;