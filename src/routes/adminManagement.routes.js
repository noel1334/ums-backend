// src/routes/adminManagement.routes.js

import express from 'express';
import * as adminManagementController from '../controllers/adminManagement.controller.js';
import { authenticateToken } from '../middlewares/auth.middleware.js'; 
import uploadImageMiddleware from '../middlewares/uploadImage.middleware.js';
import prisma from '../config/prisma.js'; 
import AppError from '../utils/AppError.js';

const router = express.Router();

/**
 * Authorization Middleware: Checks the database to verify if the 
 * authenticated user has administrative creation privileges.
 */
const authorizeSuperAdmin = async (req, res, next) => {
    try {
        if (!req.user || req.user.type !== 'admin') {
            return next(new AppError('Access denied. Administrator permissions are required.', 403));
        }

        const adminRecord = await prisma.admin.findUnique({
            where: { id: req.user.id }
        });

        if (adminRecord && adminRecord.isPermittedToAddAdmin) {
            return next();
        }

        next(new AppError('Access denied. Super administrator permissions are required for this action.', 403));
    } catch (error) {
        next(error);
    }
};

/**
 * Authorization Middleware: Allows an admin to access/edit their own profile, 
 * or allows Super Admins to manage any administrative record.
 */
const authorizeAdminSelfOrSuperAdmin = async (req, res, next) => {
    try {
        if (!req.user || req.user.type !== 'admin') {
            return next(new AppError('Access denied. Administrator permissions are required.', 403));
        }

        const targetId = parseInt(req.params.id, 10);
        if (isNaN(targetId)) {
            return next(new AppError('Invalid administrator identifier.', 400));
        }

        if (req.user.id === targetId) {
            return next();
        }

        const adminRecord = await prisma.admin.findUnique({
            where: { id: req.user.id }
        });

        if (adminRecord && adminRecord.isPermittedToAddAdmin) {
            return next();
        }

        next(new AppError('Access denied. You do not have permission to manage this administrator record.', 403));
    } catch (error) {
        next(error);
    }
};

// Apply base admin authentication token validation to all sub-routes
router.use(authenticateToken);

router.route('/')
    .post(authorizeSuperAdmin, uploadImageMiddleware('profileImg', 'single'), adminManagementController.handleCreateAdmin)
    .get(adminManagementController.handleGetAllAdmins); // ALLOWED: Any valid admin can view the list to let dashboards render

router.route('/:id')
    .get(authorizeAdminSelfOrSuperAdmin, adminManagementController.handleGetAdminById)
    .put(authorizeAdminSelfOrSuperAdmin, uploadImageMiddleware('profileImg', 'single'), adminManagementController.handleUpdateAdmin)
    .delete(authorizeSuperAdmin, adminManagementController.handleDeleteAdmin);

export default router;