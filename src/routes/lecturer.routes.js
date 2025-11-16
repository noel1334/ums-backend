// src/routes/lecturer.routes.js
import { Router } from 'express';
import * as LecturerController from '../controllers/lecturer.controller.js';
import {
    authenticateToken,
    authorizeAdmin,
    authorize, // General authorize
    authorizeHOD, // Specific for HOD or Admin
} from '../middlewares/auth.middleware.js';
import uploadImageMiddleware from '../middlewares/uploadImage.middleware.js';


const router = Router();

// Middleware to check if the requester is the lecturer themselves or an admin
// HOD access for specific lecturer is handled in controller/service after fetching lecturer
const authorizeSelfOrAdminForLecturer = (req, res, next) => {
    const targetId = parseInt(req.params.id, 10);
    if (req.user.type === 'admin' || (req.user.type === 'lecturer' && targetId === req.user.id)) {
        return next();
    }
    // For HOD viewing specific lecturer in their dept, controller will verify
    // If it's just a general lecturer trying to access another lecturer, block.
    if (req.user.type === 'lecturer' && req.user.role !== 'HOD') { // HOD check is more complex for single GET
        return next(new AppError('You are not authorized for this lecturer record.', 403));
    }
    next(); // Allow HODs through, controller/service will do final dept check
    
};


router.get(
    '/my-department',
    authenticateToken,
    authorize(['HOD', 'admin']), 
    LecturerController.getDepartmentLecturers
);

router.route('/me')
    .get(authenticateToken, authorize(['lecturer']),   LecturerController.getMyLecturerProfile)
    .put(authenticateToken, authorize(['lecturer']), uploadImageMiddleware('profileImg', 'single'), LecturerController.updateMyLecturerProfile);

router.route('/')
    .post(authenticateToken, authorizeAdmin,  uploadImageMiddleware('profileImg', 'single'), LecturerController.createLecturer)
    .get(authenticateToken, authorize(['admin', 'HOD']), LecturerController.getAllLecturers); // Service filters for HOD

router.route('/:id')
    .get(authenticateToken, authorize(['admin', 'lecturer']), /* authorizeSelfOrAdminOrHOD */ LecturerController.getLecturerById) // Controller handles specific auth
    .put(authenticateToken, authorize(['admin', 'lecturer']),  uploadImageMiddleware('profileImg', 'single'), authorizeSelfOrAdminForLecturer, LecturerController.updateLecturer) // Service handles field restrictions
    .delete(authenticateToken, authorizeAdmin, LecturerController.deleteLecturer);

export default router;