// src/routes/auth.routes.js

import { Router } from 'express';
import * as AuthController from '../controllers/auth.controller.js';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { 
    adminLoginSchema, 
    identifierLoginSchema, 
    applicantLoginSchema, // Updated schema
    forgotPasswordSchema, 
    resetPasswordSchema,
    examScheduleLoginSchema,
    examSessionAccessSchema
} from '../validations/auth.validation.js';

const router = Router();

// --- LOGIN ENDPOINTS ---
router.post('/admin/login', validate(adminLoginSchema), AuthController.adminLogin); 
router.post('/student/login', validate(identifierLoginSchema), AuthController.studentLogin);
router.post('/lecturer/login', validate(identifierLoginSchema), AuthController.lecturerLogin);
router.post('/ict-staff/login', validate(identifierLoginSchema), AuthController.ictStaffLogin);

// FIXED: Using applicantLoginSchema
router.post('/applicant/login', validate(applicantLoginSchema), AuthController.loginApplicantScreening);

// --- CBT EXAM ACCESS ---
router.post('/exam-schedule/login', validate(examScheduleLoginSchema), AuthController.loginToViewAccessibleExams);
router.post('/exam-session/access', validate(examSessionAccessSchema), AuthController.authenticateForExamSessionAccess);

// --- PASSWORD RESET ---
router.post('/forgot-password', validate(forgotPasswordSchema), AuthController.forgotPassword);
router.post('/reset-password', validate(resetPasswordSchema), AuthController.resetPassword);

// --- LOGOUT ---
router.post('/logout', authenticateToken, AuthController.logoutUser);

export default router;