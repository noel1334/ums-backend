
import { Router } from 'express';
import * as ScreeningFeeListController from '../controllers/screeningFeeList.controller.js';
import { authenticateApplicantToken, authenticateToken, authorizeAdmin } from '../middlewares/auth.middleware.js';

const router = Router();

// All operations are Admin only
router.route('/')
    .post(authenticateToken, authorizeAdmin, ScreeningFeeListController.createScreeningFee)
    .get(authenticateToken, authorizeAdmin, ScreeningFeeListController.getAllScreeningFees);

router.get('/applicable', 
    authenticateApplicantToken,
    ScreeningFeeListController.getApplicableFee
);

router.route('/:id')
    .get(authenticateToken, authorizeAdmin, ScreeningFeeListController.getScreeningFeeById)
    .put(authenticateToken, authorizeAdmin, ScreeningFeeListController.updateScreeningFee)
    .delete(authenticateToken, authorizeAdmin, ScreeningFeeListController.deleteScreeningFee);

export default router;