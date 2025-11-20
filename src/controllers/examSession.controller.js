import * as examSessionService from '../services/examSession.service.js';
import catchAsync from '../utils/catchAsync.js';
// NEW: Import the examAttempt service
import * as ExamAttemptService from '../services/examAttempt.service.js'


export const createExamSession = catchAsync(async (req, res, next) => {
    const { examId } = req.params; // Get examId from URL params
    const session = await examSessionService.createExamSession(examId, req.body, req.user);
    res.status(201).json({
        status: 'success',
        data: { session }
    });
});

export const getSessionsForExam = catchAsync(async (req, res, next) => {
    const { examId } = req.params;
    const result = await examSessionService.getSessions({ ...req.query, examId }, req.user); // Pass examId to generic service method
    res.status(200).json({
        status: 'success',
        data: result
    });
});

export const getExamSessionById = catchAsync(async (req, res, next) => {
    const { sessionId } = req.params;
    const session = await examSessionService.getExamSessionById(sessionId, req.user);
    res.status(200).json({
        status: 'success',
        data: { session }
    });
});

export const updateExamSession = catchAsync(async (req, res, next) => {
    const { sessionId } = req.params;
    const updatedSession = await examSessionService.updateExamSession(sessionId, req.body, req.user);
    res.status(200).json({
        status: 'success',
        data: { session: updatedSession }
    });
});

export const deleteExamSession = catchAsync(async (req, res, next) => {
    const { sessionId } = req.params;
    await examSessionService.deleteExamSession(sessionId, req.user);
    res.status(204).json({
        status: 'success',
        data: null
    });
});

// ===================================================================
// --- NEW CONTROLLER FUNCTIONS FOR ADMIN DASHBOARD ---
// ===================================================================

export const getSessionAttemptsSummary = async (req, res, next) => {
    try {
        const { sessionId } = req.params;
        const attempts = await ExamAttemptService.getAttemptsSummaryForSession(sessionId);
        res.status(200).json({ status: 'success', data: { attempts } });
    } catch (error) {
        next(error);
    }
};

export const getSessionResultsSummary = async (req, res, next) => {
    try {
        const { sessionId } = req.params;
        const results = await ExamAttemptService.getResultsSummaryForSession(sessionId);
        res.status(200).json({ status: 'success', data: { results } });
    } catch (error) {
        next(error);
    }
};