// src/controllers/examAttempt.controller.js

import * as ExamAttemptService from '../services/examAttempt.service.js';
import AppError from '../utils/AppError.js';

export const startExamAttempt = async (req, res, next) => {
    try {
        // --- THIS IS THE FIX ---
        // The examSessionId is in the URL parameters, not the body.
        // We get it directly from req.params.
        const { examSessionId } = req.params;
        // --- END OF FIX ---

        if (!examSessionId) {
            // This check is now a safeguard in case the route changes unexpectedly.
            return next(new AppError('Exam Session ID is missing from the URL.', 400));
        }

        const clientIpAddress = req.ip;
        const clientUserAgent = req.headers['user-agent'];

        const attemptDetails = await ExamAttemptService.startExamAttempt(
            req.user.id, // Student ID from authenticated user
            examSessionId,
            clientIpAddress,
            clientUserAgent
        );
        res.status(200).json({ status: 'success', data: attemptDetails });
    } catch (error) {
        next(error);
    }
};

export const saveStudentAnswer = async (req, res, next) => {
    try {
        const { attemptId } = req.params; // Correctly get attemptId from params
        const studentId = req.user.id;
        const { questionId, selectedOptionKey, answerText } = req.body;

        if (!questionId || (selectedOptionKey === undefined && answerText === undefined)) {
            return next(new AppError('Question ID and an answer (selectedOptionKey or answerText) are required.', 400));
        }

        const savedAnswer = await ExamAttemptService.saveStudentAnswer(attemptId, studentId, { questionId, selectedOptionKey, answerText });
        res.status(200).json({ status: 'success', data: { answer: savedAnswer } });
    } catch (error) {
        next(error);
    }
};

export const submitExamAttempt = async (req, res, next) => {
    try {
        const { attemptId } = req.params; // Correctly get attemptId from params
        const studentId = req.user.id;

        const result = await ExamAttemptService.submitExamAttempt(attemptId, studentId);
        res.status(200).json({ status: 'success', data: result });
    } catch (error) {
        next(error);
    }
};

export const getExamAttemptResult = async (req, res, next) => {
    try {
        const { attemptId } = req.params; // Correctly get attemptId from params
        const studentIdForAuth = req.user.id;

        const result = await ExamAttemptService.getExamAttemptResult(attemptId, studentIdForAuth, req.user);
        res.status(200).json({ status: 'success', data: result });
    } catch (error) {
        next(error);
    }
};

// ===================================================================
// --- NEW CONTROLLER: Handle deleting an exam attempt ---
// ===================================================================
export const deleteExamAttempt = async (req, res, next) => {
    try {
        const { attemptId } = req.params;
        await ExamAttemptService.deleteExamAttempt(attemptId);
        res.status(200).json({ status: 'success', message: 'Exam attempt deleted successfully.' });
    } catch (error) {
        next(error);
    }
};