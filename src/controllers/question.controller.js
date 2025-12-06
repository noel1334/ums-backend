import * as QuestionService from '../services/question.service.js'; // Correctly imported as QuestionService
import AppError from '../utils/AppError.js';
import catchAsync from '../utils/catchAsync.js';


// Assumes examId will be in req.params from a nested route like /exams/:examId/questions
export const createQuestion = async (req, res, next) => {
    try {
        const examId = req.params.examId;
        if (!examId) return next(new AppError('Exam ID is required in path.', 400));
        const newQuestion = await QuestionService.createQuestion(examId, req.body, req.user);
        res.status(201).json({ status: 'success', data: { question: newQuestion } });
    } catch (error) { next(error); }
};

export const createMultipleQuestions = catchAsync(async (req, res, next) => {
  const { examId } = req.params;
  // CRUCIAL CHANGE: Extract the 'questions' array from req.body
  const questionsData = req.body.questions;

  // Optional: Add an explicit check here as well for robustness
  if (!Array.isArray(questionsData) || questionsData.length === 0) {
    throw new AppError('No questions array found in the request body.', 400);
  }

  const createdQuestions = await QuestionService.createMultipleQuestions( // FIX: Changed to QuestionService
    examId,
    questionsData, // Pass the extracted array directly to the service
    req.user // Assuming req.user contains the authenticated user's data
  );

  res.status(201).json({
    status: 'success',
    message: `${createdQuestions.length} questions added to the exam successfully.`,
    data: { questions: createdQuestions },
  });
});


export const getQuestionsForExam = async (req, res, next) => {
    try {
        const examId = req.params.examId;
        if (!examId) return next(new AppError('Exam ID is required in path.', 400));
        const result = await QuestionService.getQuestionsForExam(examId, req.query, req.user);
        res.status(200).json({ status: 'success', data: result });
    } catch (error) { next(error); }
};

export const getQuestionById = async (req, res, next) => { // This is for a specific question by its own ID
    try {
        const question = await QuestionService.getQuestionById(req.params.questionId, req.user);
        res.status(200).json({ status: 'success', data: { question } });
    } catch (error) { next(error); }
};

export const updateQuestion = async (req, res, next) => { // Updates a specific question by its ID
    try {
        if (Object.keys(req.body).length === 0) return next(new AppError('No data for update.', 400));
        const updatedQuestion = await QuestionService.updateQuestion(req.params.questionId, req.body, req.user);
        res.status(200).json({ status: 'success', data: { question: updatedQuestion } });
    } catch (error) { next(error); }
};

export const updateMultipleQuestions = async (req, res, next) => {
    try {
        const examId = req.params.examId;
        if (!examId) return next(new AppError('Exam ID is required in path.', 400));
        // Expect req.body to be an array of { id: questionId, data: { ...updateFields } }
        const updatedQuestions = await QuestionService.updateMultipleQuestions(examId, req.body, req.user);
        res.status(200).json({ status: 'success', data: { questions: updatedQuestions } });
    } catch (error) { next(error); }
};


export const deleteQuestion = async (req, res, next) => { // Deletes a specific question by its ID
    try {
        const result = await QuestionService.deleteQuestion(req.params.questionId, req.user);
        res.status(200).json({ status: 'success', message: result.message });
    } catch (error) { next(error); }
};