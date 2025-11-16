import { Router } from 'express';
import * as JambApplicantController from '../controllers/jambApplicant.controller.js';
import {
    authenticateToken,
    authorizeAdmin,  
    authorize        
} from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/lookup/:jambRegNo', JambApplicantController.lookupJambApplicantByRegNo);

router.route('/')
    .post(
        authenticateToken,
        authorize(['admin', 'ictstaff']), // Allows if req.user.type is 'admin' OR 'ictstaff'
        JambApplicantController.createJambApplicant
    )
    .get(
        authenticateToken,
        authorize(['admin', 'ictstaff']), // Allows if req.user.type is 'admin' OR 'ictstaff'
        JambApplicantController.getAllJambApplicants
    );

router.post('/batch',
    authenticateToken,
    authorize(['admin', 'ictstaff']), // Allows if req.user.type is 'admin' OR 'ictstaff'
    JambApplicantController.batchCreateJambApplicants
);

router.get('/:id',
    authenticateToken,
    authorize(['admin', 'ictstaff']), // Allows if req.user.type is 'admin' OR 'ictstaff'
    JambApplicantController.getJambApplicantById
);

// Update a specific JambApplicant record
router.patch('/:id', 
    authenticateToken,
    authorize(['admin', 'ictstaff']), 
    JambApplicantController.updateJambApplicant
);
// Delete a specific JambApplicant record
// ONLY Admin can delete.
router.delete('/:id',
    authenticateToken,
     authorize(['admin', 'ictstaff']), 
    JambApplicantController.deleteJambApplicant
);
router.post('/batch-delete',
    authenticateToken,
    authorize(['admin', 'ictstaff']), // Or just 'admin' if you prefer
    JambApplicantController.batchDeleteJambApplicants
);
router.post('/batch-update',
    authenticateToken,
    authorize(['admin', 'ictstaff']),
    JambApplicantController.batchUpdateJambApplicants
);
router.post('/batch-email',
    authenticateToken,
    authorize(['admin', 'ictstaff']),
    JambApplicantController.batchEmailJambApplicants
);
export default router;