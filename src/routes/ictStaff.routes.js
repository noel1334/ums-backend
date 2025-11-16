// src/routes/ictStaff.routes.js
import { Router } from 'express';
import * as ICTStaffController from '../controllers/ictStaff.controller.js';
import {
    authenticateToken,
    authorizeAdmin,
    authorize,
    authorizeICTStaff,
} from '../middlewares/auth.middleware.js';
import uploadImageMiddleware from '../middlewares/uploadImage.middleware.js';

const router = Router();



// Routes for the logged-in ICT staff member to manage their own profile
router.route('/me')
    .get(authenticateToken, authorizeICTStaff, ICTStaffController.getMyICTProfile)
    .put(authenticateToken, authorizeICTStaff,  uploadImageMiddleware('profileImg', 'single'), ICTStaffController.updateMyICTProfile);

// Admin-only routes for creating and listing all ICT staff
router.route('/')
    .post(authenticateToken, authorizeAdmin,  uploadImageMiddleware('profileImg', 'single'), ICTStaffController.createICTStaff)
    .get(authenticateToken, authorizeAdmin, ICTStaffController.getAllICTStaff);

// Routes for a specific ICT staff by ID
router.route('/:id')
    .get(authenticateToken, authorizeAdmin, authorizeICTStaff, ICTStaffController.getICTStaffById) // CORRECTED: Uses specific auth
    .put(authenticateToken, authorizeAdmin,  uploadImageMiddleware('profileImg', 'single'), authorizeICTStaff, ICTStaffController.updateICTStaff) // CORRECTED: Uses specific auth
    .delete(authenticateToken, authorizeAdmin, ICTStaffController.deleteICTStaff); // Admin only for delete

export default router;