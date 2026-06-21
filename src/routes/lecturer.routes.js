// src/routes/lecturer.routes.js

import { Router } from 'express';
import * as LecturerController from '../controllers/lecturer.controller.js';
import {
    authenticateToken,
    authorizeAdmin,
    authorize, 
} from '../middlewares/auth.middleware.js';
import uploadImageMiddleware from '../middlewares/uploadImage.middleware.js';
import AppError from '../utils/AppError.js';

const router = Router();

// Middleware to check if the requester is the lecturer themselves or an admin
const authorizeSelfOrAdminForLecturer = (req, res, next) => {
    const targetId = parseInt(req.params.id, 10);
    if (isNaN(targetId)) {
        return next(new AppError('Invalid lecturer ID parameter.', 400));
    }
    
    if (req.user.type === 'admin' || (req.user.type === 'lecturer' && targetId === req.user.id)) {
        return next();
    }
    
    // For HOD viewing specific lecturer in their dept, controller will verify
    if (req.user.type === 'lecturer' && req.user.role !== 'HOD') { 
        return next(new AppError('You are not authorized for this lecturer record.', 403));
    }
    next(); 
};

router.get(
    '/my-department',
    authenticateToken,
    authorize(['HOD', 'admin']), 
    LecturerController.getDepartmentLecturers
);

router.route('/me')
    .get(authenticateToken, authorize(['lecturer']), LecturerController.getMyLecturerProfile)
    .put(authenticateToken, authorize(['lecturer']), uploadImageMiddleware('profileImg', 'single'), LecturerController.updateMyLecturerProfile);

// Dedicated route for HOD / EXAMINER signature uploads
router.put(
    '/me/signature',
    authenticateToken,
    authorize(['HOD', 'EXAMINER']), 
    uploadImageMiddleware('signatureImg', 'single'),
    LecturerController.updateMySignature
);

router.route('/')
    .post(authenticateToken, authorizeAdmin, uploadImageMiddleware('profileImg', 'single'), LecturerController.createLecturer)
    .get(authenticateToken, authorize(['admin', 'HOD']), LecturerController.getAllLecturers); 

router.route('/:id')
    .get(authenticateToken, authorize(['admin', 'lecturer', 'student']), LecturerController.getLecturerById) 
    .put(
        authenticateToken, 
        authorize(['admin', 'lecturer']), 
        uploadImageMiddleware('profileImg', 'single'), 
        authorizeSelfOrAdminForLecturer, // FIXED: Corrected reference here
        LecturerController.updateLecturer
    ) 
    .delete(authenticateToken, authorizeAdmin, LecturerController.deleteLecturer);

export default router;