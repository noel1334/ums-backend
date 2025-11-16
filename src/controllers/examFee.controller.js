// src/controllers/examFee.controller.js
import * as ExamFeeService from '../services/examFee.service.js';

export const createOrUpdateExamFee = async (req, res, next) => {
    try {
        const fee = await ExamFeeService.createOrUpdateExamFee(req.body);
        res.status(201).json({ status: 'success', data: { fee } });
    } catch (error) { next(error); }
};

export const getFeeForExam = async (req, res, next) => {
    try {
        const { examId } = req.params;
        const fee = await ExamFeeService.getFeeForExam(examId);
        res.status(200).json({ status: 'success', data: { fee } });
    } catch (error) { next(error); }
};

export const deleteExamFee = async (req, res, next) => {
    try {
        const { id } = req.params;
        await ExamFeeService.deleteExamFee(id);
        res.status(204).json({ status: 'success', data: null });
    } catch (error) { next(error); }
};