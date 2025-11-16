// src/controllers/exam.controller.js
import * as ExamService from '../services/exam.service.js';
import AppError from '../utils/AppError.js';

export const createExam = async (req, res, next) => {
    try {
        const newExam = await ExamService.createExam(req.body, req.user);
        res.status(201).json({ status: 'success', data: { exam: newExam } });
    } catch (error) { next(error); }
};

export const getExamById = async (req, res, next) => {
    try {
        const exam = await ExamService.getExamById(req.params.id, req.user);
        res.status(200).json({ status: 'success', data: { exam } });
    } catch (error) { next(error); }
};

export const getAllExams = async (req, res, next) => {
    try {
        const result = await ExamService.getAllExams(req.query, req.user);
        res.status(200).json({ status: 'success', data: result });
    } catch (error) { next(error); }
};

export const updateExam = async (req, res, next) => {
    try {
        if (Object.keys(req.body).length === 0) return next(new AppError('No data provided for update.', 400));
        const updatedExam = await ExamService.updateExam(req.params.id, req.body, req.user);
        res.status(200).json({ status: 'success', data: { exam: updatedExam } });
    } catch (error) { next(error); }
};

export const deleteExam = async (req, res, next) => {
    try {
        const result = await ExamService.deleteExam(req.params.id, req.user);
        res.status(200).json({ status: 'success', message: result.message });
    } catch (error) { next(error); }
};

// NEW: Controller for verifying exam password
export const verifyExamAccessPassword = async (req, res, next) => {
    try {
        const { password } = req.body;
        const { id } = req.params;
        const result = await ExamService.verifyExamAccessPassword(id, password, req.user);
        res.status(200).json({ status: 'success', data: result });
    } catch (error) {
        next(error);
    }
};

// NEW: Controller for updating exam status
export const updateExamStatus = async (req, res, next) => {
    try {
        const { status: newStatus } = req.body; // Expecting { "status": "ACTIVE" }
        const { id } = req.params;
        const updatedExam = await ExamService.updateExamStatus(id, newStatus, req.user);
        res.status(200).json({ status: 'success', data: { exam: updatedExam } });
    } catch (error) {
        next(error);
    }
};