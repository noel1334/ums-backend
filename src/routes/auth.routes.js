import { Router } from 'express';
import * as AuthController from '../controllers/auth.controller.js';
import { authenticateToken } from '../middlewares/auth.middleware.js';
// Optional: import validation schemas if you implement them
// import { validateLogin } from '../validators/auth.validator.js';

const router = Router();

// For all login routes, the frontend will send:
// { "identifier": "user_identifier_here", "password": "user_password_here" }

router.post('/admin/login', /* validateLogin, */ AuthController.adminLogin); // Admin still uses email
router.post('/student/login', /* validateStudentLogin, */ AuthController.studentLogin);
router.post('/lecturer/login', /* validateLecturerLogin, */ AuthController.lecturerLogin);
router.post('/ict-staff/login', /* validateICTStaffLogin, */ AuthController.ictStaffLogin);

router.post('/exam-schedule/login', AuthController.loginToViewAccessibleExams);
// Student authenticates for a *specific* exam session to get token to *start an attempt*
router.post('/exam-session/access', AuthController.authenticateForExamSessionAccess);
router.post('/applicant/login', AuthController.loginApplicantScreening);

router.post('/logout', authenticateToken, AuthController.logoutUser);

export default router;