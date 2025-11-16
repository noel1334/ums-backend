// src/routes/onlineScreening.routes.js
import { Router } from 'express';
import * as OnlineScreeningController from '../controllers/onlineScreening.controller.js';
import {
    authenticateToken,
    authorize 
} from '../middlewares/auth.middleware.js';

const router = Router();


router.route('/')
    .post(
        authenticateToken,
        authorize(['admin', 'ictstaff']),
        OnlineScreeningController.createOnlineScreeningAccount
        
    )
    .get(
        authenticateToken,
        authorize(['admin', 'ictstaff']),
        OnlineScreeningController.getAllOnlineScreeningAccounts
    );

router.post('/batch',
    authenticateToken,
    authorize(['admin', 'ictstaff']),
    OnlineScreeningController.batchCreateOnlineScreeningAccounts
);
router.get('/stats',
    authenticateToken,
    authorize(['admin', 'ictstaff']),
    OnlineScreeningController.getStats
);

router.post('/batch-delete', // New Route
    authenticateToken,
    authorize(['admin', 'ictstaff']),
    OnlineScreeningController.batchDeleteOnlineScreeningAccounts
);

router.route('/:id')
    .get(
        authenticateToken,
        authorize(['admin', 'ictstaff']),
        OnlineScreeningController.getOnlineScreeningAccountById
    )
    .put(
        authenticateToken,
        authorize(['admin', 'ictstaff']),
        OnlineScreeningController.updateOnlineScreeningAccount
    )
    .delete(
        authenticateToken,
        authorize(['admin', 'ictstaff']),
        OnlineScreeningController.deleteOnlineScreeningAccount
    );

    
export default router;
