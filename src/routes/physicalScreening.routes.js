// src/routes/physicalScreening.routes.js
import { Router } from 'express';
import * as PhysicalScreeningController from '../controllers/physicalScreening.controller.js';
import {
    authenticateToken,
    authorize 
} from '../middlewares/auth.middleware.js';

const router = Router();
const canManagePhysicalScreening =  authorize(['admin', 'ictstaff']);

router.route('/')
    .post(authenticateToken, canManagePhysicalScreening, PhysicalScreeningController.createPhysicalScreeningRecord)
    .get(authenticateToken, canManagePhysicalScreening, PhysicalScreeningController.getAllPhysicalScreeningRecords);

// --- ADD THE BATCH DELETE ROUTE HERE ---
router.post('/batch-delete',
    authenticateToken,
    canManagePhysicalScreening,
    PhysicalScreeningController.batchDeletePhysicalScreeningRecords
);

router.post('/add-single', 
    authenticateToken, 
    canManagePhysicalScreening, 
    PhysicalScreeningController.addSingleToScreening
);

router.post('/add-batch', 
    authenticateToken, 
    canManagePhysicalScreening, 
    PhysicalScreeningController.addBatchToScreening
);

router.get('/application-profile/:applicationProfileId',
    authenticateToken,
    canManagePhysicalScreening,
    PhysicalScreeningController.getPhysicalScreeningByApplicationProfileId
);

router.route('/:id')
    .get(authenticateToken, canManagePhysicalScreening, PhysicalScreeningController.getPhysicalScreeningRecordById)
    .put(authenticateToken, canManagePhysicalScreening, PhysicalScreeningController.updatePhysicalScreeningRecord)
    .delete(authenticateToken, canManagePhysicalScreening, PhysicalScreeningController.deletePhysicalScreeningRecord);
    
 router.post('/batch-update',
    authenticateToken,
    canManagePhysicalScreening,
    PhysicalScreeningController.batchUpdatePhysicalScreeningRecords );
    
    router.post('/batch-email',
    authenticateToken,
    canManagePhysicalScreening,
    PhysicalScreeningController.batchEmailPhysicalScreening // Use the correct controller
);

      
export default router;