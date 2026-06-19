// src/routes/universitySetting.routes.js

import express from 'express';
import * as universitySettingController from '../controllers/universitySetting.controller.js';
import { authenticateToken, authorizeAdmin } from '../middlewares/auth.middleware.js';
import uploadImageMiddleware from '../middlewares/uploadImage.middleware.js'; 
import AppError from '../utils/AppError.js';

const router = express.Router();

/**
 * Permissive authentication middleware that delegates 
 * verification based on the decoded token type.
 */
const authenticateAnyUser = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next(new AppError('Authentication token is required.', 401));
    }

    const token = authHeader.split(' ')[1];
    
    try {
        const tokenParts = token.split('.');
        if (tokenParts.length !== 3) {
            return next(new AppError('Invalid token format.', 401));
        }

        const payloadJson = Buffer.from(tokenParts[1], 'base64').toString('utf-8');
        const decoded = JSON.parse(payloadJson);

        if (decoded && decoded.type === 'applicant') {
            return authenticateApplicantToken(req, res, next);
        }

        return authenticateToken(req, res, next);
    } catch (error) {
        return next(new AppError('Invalid or malformed authentication token payload.', 401));
    }
};

// Route endpoints configured inline (without router.use)
router.get('/', authenticateAnyUser, universitySettingController.handleGetSettings);

// FIXED: Changed 'profileImg' to 'logo' to match 'fd.append("logo", logoFile)' on the frontend
router.put('/', 
    authenticateToken, 
    authorizeAdmin, 
    uploadImageMiddleware('logo', 'single'), 
    universitySettingController.handleUpdateSettings
);

export default router;