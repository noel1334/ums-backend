// src/routes/dashboard.routes.js
import { Router } from 'express';
import * as DashboardController from '../controllers/dashboard.controller.js';
import { authenticateToken, authorizeAnalyticsViewer } from '../middlewares/auth.middleware.js';

const router = Router();

// All dashboard routes require a user who can view analytics
router.use(authenticateToken, authorizeAnalyticsViewer);

router.get('/summary', DashboardController.getDashboardSummary); // Combined endpoint
router.get('/core-counts', DashboardController.getCoreCounts);
router.get('/fee-compliance', DashboardController.getFeeComplianceRate);
router.get('/average-gpa', DashboardController.getAverageGPA);
router.get('/registration-completion', DashboardController.getCourseRegistrationCompletion);
router.get('/results-processed', DashboardController.getResultsProcessed);

export default router;