// src/controllers/dashboard.controller.js
import * as DashboardService from '../services/dashboard.service.js';
// AppError is handled by next(error)

export const getCoreCounts = async (req, res, next) => {
    try {
        const counts = await DashboardService.getCoreCounts(req.user);
        res.status(200).json({ status: 'success', data: counts });
    } catch (error) {
        next(error);
    }
};

export const getFeeComplianceRate = async (req, res, next) => {
    try {
        // seasonId should be in req.query
        if (!req.query.seasonId) {
            return next(new AppError('Season ID query parameter is required.', 400));
        }
        const rate = await DashboardService.getFeeComplianceRate(req.query, req.user);
        res.status(200).json({ status: 'success', data: rate });
    } catch (error) {
        next(error);
    }
};

export const getAverageGPA = async (req, res, next) => {
    try {
        // seasonId, semesterId, departmentId (optional) in req.query
        const gpaData = await DashboardService.getAverageGPA(req.query, req.user);
        res.status(200).json({ status: 'success', data: gpaData });
    } catch (error) {
        next(error);
    }
};

export const getCourseRegistrationCompletion = async (req, res, next) => {
    try {
        if (!req.query.seasonId || !req.query.semesterId) {
            return next(new AppError('Season ID and Semester ID query parameters are required.', 400));
        }
        const completionData = await DashboardService.getCourseRegistrationCompletionPercentage(req.query, req.user);
        res.status(200).json({ status: 'success', data: completionData });
    } catch (error) {
        next(error);
    }
};

export const getResultsProcessed = async (req, res, next) => {
    try {
        if (!req.query.seasonId || !req.query.semesterId) {
            return next(new AppError('Season ID and Semester ID query parameters are required.', 400));
        }
        const processedData = await DashboardService.getResultsProcessedPercentage(req.query, req.user);
        res.status(200).json({ status: 'success', data: processedData });
    } catch (error) {
        next(error);
    }
};

// Combined dashboard endpoint
export const getDashboardSummary = async (req, res, next) => {
    try {
        const { seasonId, semesterId } = req.query; // seasonId and semesterId are crucial for time-sensitive stats

        if (!seasonId) { // semesterId might be optional for some stats like core counts
            // For simplicity, let's make seasonId generally required for dashboard summary
            // Fallback to current active season if not provided, or throw error
            const activeSeason = await prisma.season.findFirst({ where: { isActive: true } });
            if (!activeSeason && !seasonId) { // If no explicit seasonId and no active season
                return next(new AppError('Active season not found and Season ID query parameter is required for dashboard summary.', 400));
            }
            req.query.seasonId = seasonId || activeSeason?.id.toString(); // Use active season if no seasonId
        }
        if (!semesterId && (req.query.registrationCompletion || req.query.resultsProcessed)) { // semester is crucial for these
            const activeSemester = await prisma.semester.findFirst({ where: { isActive: true, seasonId: parseInt(req.query.seasonId) } });
            if (!activeSemester && !semesterId) {
                return next(new AppError('Active semester not found for the season and Semester ID query parameter is required for some stats.', 400));
            }
            req.query.semesterId = semesterId || activeSemester?.id.toString();
        }


        const coreCounts = await DashboardService.getCoreCounts(req.user);
        const feeCompliance = await DashboardService.getFeeComplianceRate(req.query, req.user);
        const averageGpa = await DashboardService.getAverageGPA(req.query, req.user);
        const registrationCompletion = req.query.semesterId ? await DashboardService.getCourseRegistrationCompletionPercentage(req.query, req.user) : { registrationPercentage: 'N/A - Semester required' };
        const resultsProcessed = req.query.semesterId ? await DashboardService.getResultsProcessedPercentage(req.query, req.user) : { resultsProcessedPercentage: 'N/A - Semester required' };

        res.status(200).json({
            status: 'success',
            data: {
                coreCounts,
                feeCompliance,
                averageGpa,
                registrationCompletion,
                resultsProcessed,
            }
        });

    } catch (error) {
        next(error);
    }
};