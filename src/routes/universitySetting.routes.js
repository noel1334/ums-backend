// src/routes/universitySetting.routes.js

import express from 'express';
import jwt from 'jsonwebtoken'; // Used to inspect the token type
import * as universitySettingController from '../controllers/universitySetting.controller.js';
import { 
    authenticateToken, 
    authenticateApplicantToken, 
    authorizeAdmin 
} from '../middlewares/auth.middleware.js';
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
        // Decode token without verification to inspect the "type" field
        const decoded = jwt.decode(token);

        if (decoded && decoded.type === 'applicant') {
            // Route to applicant authentication
            return authenticateApplicantToken(req, res, next);
        }

        // Route to standard internal user authentication
        return authenticateToken(req, res, next);
    } catch (error) {
        return next(new AppError('Invalid or malformed authentication token.', 401));
    }
};

// Routing configurations
router.route('/')
    .get(authenticateAnyUser, universitySettingController.handleGetSettings) // Accessible by all authenticated users & applicants
    .put(authenticateToken, authorizeAdmin, universitySettingController.handleUpdateSettings); // Restrict updates to internal Admins only

export default router;