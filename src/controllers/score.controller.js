// src/controllers/score.controller.js

import * as ScoreService from '../services/score.service.js';
import AppError from '../utils/AppError.js';
import catchAsync from '../utils/catchAsync.js';

// --- NEW: Submit CBT Exam Scores to the Score Model ---
export const submitCbtScores = catchAsync(async (req, res, next) => {
    const result = await ScoreService.submitCbtScores(req.body, req.user);
    res.status(200).json({
        status: 'success',
        message: result.message,
        data: result,
    });
});

// CREATE a new score
export const createScore = catchAsync(async (req, res, next) => {
    const newScore = await ScoreService.createScore(req.body, req.user);
    res.status(201).json({
        status: 'success',
        message: 'Score recorded successfully.',
        data: { score: newScore },
    });
});

// UPDATE an existing score (SINGLE ITEM)
export const updateScore = catchAsync(async (req, res, next) => {
    const updatedScore = await ScoreService.updateScore(req.params.id, req.body, req.user);
    res.status(200).json({
        status: 'success',
        message: 'Score updated successfully.',
        data: { score: updatedScore },
    });
});

// GET a single score by ID
export const getScoreById = catchAsync(async (req, res, next) => {
    const score = await ScoreService.getScoreById(req.params.id, req.user);
    res.status(200).json({ status: 'success', data: { score } });
});

// GET all scores with filtering
export const getAllScores = catchAsync(async (req, res, next) => {
    const result = await ScoreService.getAllScores(req.query, req.user);
    res.status(200).json({ status: 'success', data: result });
});

// DELETE a single score (SINGLE ITEM)
export const deleteScore = catchAsync(async (req, res, next) => {
    await ScoreService.deleteScore(req.params.id, req.user);
    res.status(204).json({ status: 'success', data: null });
});

// APPROVE score by Examiner
export const approveScoreByExaminer = catchAsync(async (req, res, next) => {
    const approvedScore = await ScoreService.approveScoreByExaminer(req.params.id, req.user);
    res.status(200).json({
        status: 'success',
        message: 'Score approved by examiner successfully.',
        data: { score: approvedScore },
    });
});

// ACCEPT score by HOD
export const acceptScoreByHOD = catchAsync(async (req, res, next) => {
    const acceptedScore = await ScoreService.acceptScoreByHOD(req.params.id, req.user);
    res.status(200).json({
        status: 'success',
        message: 'Score accepted by HOD successfully.',
        data: { score: acceptedScore },
    });
});

// BATCH CREATE new scores
export const batchCreateScores = catchAsync(async (req, res, next) => {
    const createdScores = await ScoreService.batchCreateScores(req.body, req.user);
    res.status(201).json({
        status: 'success',
        message: `${createdScores.length} scores recorded successfully.`,
        data: { scores: createdScores },
    });
});

// BATCH UPDATE scores
export const batchUpdateScores = catchAsync(async (req, res, next) => {
    const scoresData = req.body; 
    
    if (!Array.isArray(scoresData)) {
        throw new AppError('Request body must be an array of scores for batch update.', 400);
    }
    
    const updatedScores = await ScoreService.batchUpdateScores(scoresData, req.user);
    
    res.status(200).json({
        status: 'success',
        message: `${updatedScores.length} scores updated successfully.`,
        data: { scores: updatedScores },
    });
});

// BATCH DELETE scores
export const batchDeleteScores = catchAsync(async (req, res, next) => {
    const scoreIds = req.body.scoreIds || req.body;
    
    if (!Array.isArray(scoreIds) || scoreIds.length === 0) {
        throw new AppError('An array of score IDs is required in the request body for batch delete.', 400);
    }
    
    const deletedCount = await ScoreService.batchDeleteScores(scoreIds, req.user);
    
    res.status(200).json({
        status: 'success',
        message: `${deletedCount} scores deleted successfully.`,
        data: null,
    });
});

// DE-APPROVAL score by Examiner
export const deapproveScoreByExaminer = catchAsync(async (req, res, next) => {
    const score = await ScoreService.deapproveScoreByExaminer(req.params.id, req.user);
    res.status(200).json({
        status: 'success',
        message: 'Examiner approval has been revoked.',
        data: { score },
    });
});

// DE-ACCEPT score by HOD
export const deacceptScoreByHOD = catchAsync(async (req, res, next) => {
    const score = await ScoreService.deacceptScoreByHOD(req.params.id, req.user);
    res.status(200).json({
        status: 'success',
        message: 'HOD acceptance has been revoked.',
        data: { score },
    });
});