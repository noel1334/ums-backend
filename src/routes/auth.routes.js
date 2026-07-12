import { Router } from 'express';
import * as AuthController from '../controllers/auth.controller.js';
import { authenticateToken } from '../middlewares/auth.middleware.js';

const router = Router();

router.post('/admin/login', AuthController.adminLogin); 
router.post('/student/login', AuthController.studentLogin);
router.post('/lecturer/login', AuthController.lecturerLogin);
router.post('/ict-staff/login', AuthController.ictStaffLogin);

router.post('/exam-schedule/login', AuthController.loginToViewAccessibleExams);
router.post('/exam-session/access', AuthController.authenticateForExamSessionAccess);
router.post('/applicant/login', AuthController.loginApplicantScreening);

// --- PASSWORD RESET ROUTES ---
router.post('/forgot-password', AuthController.forgotPassword);
router.post('/reset-password', AuthController.resetPassword);

router.post('/logout', authenticateToken, AuthController.logoutUser);

export default router;