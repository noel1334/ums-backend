// src/routes/schoolFeeList.routes.js
import { Router } from 'express';
import * as SchoolFeeListController from '../controllers/schoolFeeList.controller.js';
import { authenticateToken, authorizeAdmin, authorize } from '../middlewares/auth.middleware.js';

const router = Router();

// Listing School Fees (Student, Admin, HOD view)
router.get(
    '/',
    authenticateToken,
    authorize(['admin', 'student', 'lecturer']), // Students, Admins, HODs - Lecturer added
    SchoolFeeListController.getApplicableSchoolFees
);

// Admin ONLY CUD operations
router.post(
    '/',
    authenticateToken,
    authorizeAdmin,
    SchoolFeeListController.createSchoolFeeItem
);

router.route('/:id')
    .get(authenticateToken, authorizeAdmin, SchoolFeeListController.getSchoolFeeItemById) // Admin gets specific item
    .put(authenticateToken, authorizeAdmin, SchoolFeeListController.updateSchoolFeeItem)
    .delete(authenticateToken, authorizeAdmin, SchoolFeeListController.deleteSchoolFeeItem);

export default router;