// src/controllers/examAttempt.controller.js
import * as ExamAttemptService from '../services/examAttempt.service.js';
import AppError from '../utils/AppError.js';

export const startExamAttempt = async (req, res, next) => {
    try {
        // examSessionId from body or params if nested route like /exam-sessions/:examSessionId/attempts/start
        const examSessionId = req.body.examSessionId || req.params.examSessionId;
        if (!examSessionId) return next(new AppError('Exam Session ID is required.', 400));

        const clientIpAddress = req.ip; // Or req.headers['x-forwarded-for'] if behind proxy
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
        const attemptId = req.params.attemptId;
        const studentId = req.user.id; // Ensure student can only save to their own attempt
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
        const attemptId = req.params.attemptId;
        const studentId = req.user.id;

        const result = await ExamAttemptService.submitExamAttempt(attemptId, studentId);
        res.status(200).json({ status: 'success', data: result });
    } catch (error) {
        next(error);
    }
};

export const getExamAttemptResult = async (req, res, next) => {
    try {
        const attemptId = req.params.attemptId;
        // Student ID can be from req.user (for self) or from params (for admin/lecturer view)
        const studentIdForAuth = req.user.id;

        const result = await ExamAttemptService.getExamAttemptResult(attemptId, studentIdForAuth, req.user);
        res.status(200).json({ status: 'success', data: result });
    } catch (error) {
        next(error);
    }
};