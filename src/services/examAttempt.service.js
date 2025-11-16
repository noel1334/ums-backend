// src/services/examAttempt.service.js
import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import { QuestionType, ExamStatus } from '../generated/prisma/index.js';

const calculateTimeUsed = (startTime, endTime) => {
    if (!startTime || !endTime) return null;
    return Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000);
};

// Helper to get randomized questions for an exam attempt
const getQuestionsForAttempt = async (examId, questionsToAttempt) => {
    // Fetch more than needed to allow randomization if bank is larger
    const questionsFromBank = await prisma.question.findMany({
        where: { examId: examId, isBankQuestion: true }, // Assuming questions are marked as bank questions
        include: { options: { orderBy: { optionKey: 'asc' } } } // Fetch options too
    });

    if (questionsFromBank.length < questionsToAttempt) {
        throw new AppError(`Not enough questions in the bank (${questionsFromBank.length}) for this exam (requires ${questionsToAttempt}).`, 400);
    }

    // Simple shuffle and pick
    const shuffled = questionsFromBank.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, questionsToAttempt);
};

export const startExamAttempt = async (studentId, examSessionId, clientIpAddress, clientUserAgent) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);

        const pStudentId = parseInt(studentId, 10);
        const pExamSessionId = parseInt(examSessionId, 10);

        // 1. Verify Student Assignment and Session Validity
        const assignment = await prisma.studentExamSessionAssignment.findUnique({
            where: { studentId_examSessionId: { studentId: pStudentId, examSessionId: pExamSessionId } },
            include: {
                examSession: { include: { exam: true, venue: true } },
                student: { select: { isActive: true } }
            }
        });

        if (!assignment) throw new AppError('You are not assigned to this exam session.', 403);
        if (!assignment.student || !assignment.student.isActive) throw new AppError('Your student account is inactive.', 403);

        const { examSession } = assignment;
        const { exam } = examSession;

        if (!examSession.isActive) throw new AppError('This exam session is not currently active.', 403);
        if (exam.status !== ExamStatus.ACTIVE) throw new AppError(`This exam (${exam.title}) is not currently active (status: ${exam.status}).`, 403);

        const now = new Date();
        if (now < new Date(examSession.startTime)) throw new AppError('This exam session has not started yet.', 403);
        if (now > new Date(examSession.endTime)) throw new AppError('This exam session has already ended.', 403);

        // 2. Check for Existing In-Progress Attempts for this session by this student
        const existingAttempt = await prisma.examAttempt.findFirst({
            where: {
                studentId: pStudentId,
                examSessionId: pExamSessionId,
                isSubmitted: false, // Look for an unsubmitted attempt
                endTime: null // Or check if endTime is in the future (if attempts can be paused)
            }
        });

        if (existingAttempt) {
            // Logic to resume attempt or prevent multiple starts (simplest: prevent)
            // For now, let's assume one start. If resume is needed, this logic changes.
            throw new AppError('You already have an active attempt for this exam session. Multiple attempts not allowed.', 409);
        }
        // Or check if already submitted and graded to prevent re-attempt unless it's a makeup
        const submittedGradedAttempt = await prisma.examAttempt.findFirst({
            where: { studentId: pStudentId, examSessionId: pExamSessionId, isSubmitted: true }
        });
        if (submittedGradedAttempt && exam.examType !== 'MAKEUP') { // Example rule
            throw new AppError('You have already completed an attempt for this exam session.', 409);
        }


        // 3. Fetch Questions
        const questionsForAttempt = await getQuestionsForAttempt(exam.id, exam.questionsToAttempt);
        if (questionsForAttempt.length === 0) {
            throw new AppError('No questions could be prepared for this exam attempt.', 500);
        }

        // 4. Create ExamAttempt record
        const newAttempt = await prisma.examAttempt.create({
            data: {
                studentId: pStudentId,
                examId: exam.id,
                examSessionId: pExamSessionId,
                startTime: now,
                ipAddress: clientIpAddress,
                userAgent: clientUserAgent,
                // endTime, scoreAchieved, isSubmitted, isGraded will be updated later
            },
        });

        // Return data needed by the client to start the exam
        return {
            attemptId: newAttempt.id,
            examTitle: exam.title,
            examType: exam.examType,
            courseCode: exam.courseId, // You would fetch course code if needed here via include
            durationMinutes: exam.durationMinutes,
            questionsToAttempt: exam.questionsToAttempt,
            sessionStartTime: examSession.startTime,
            sessionEndTime: examSession.endTime,
            attemptStartTime: newAttempt.startTime,
            questions: questionsForAttempt.map(q => ({ // Sanitize questions for client
                id: q.id,
                questionText: q.questionText,
                questionType: q.questionType,
                marks: q.marks,
                displayOrder: q.displayOrder,
                options: q.options.map(opt => ({
                    id: opt.id,
                    optionKey: opt.optionKey,
                    optionText: opt.optionText
                })) // Exclude isCorrect from options sent to student
            }))
        };

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error starting exam attempt:", error.message, error.stack);
        throw new AppError('Could not start exam attempt.', 500);
    }
};


export const saveStudentAnswer = async (attemptId, studentId, answerData) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const { questionId, selectedOptionKey, answerText } = answerData;

        const pAttemptId = parseInt(attemptId, 10);
        const pQuestionId = parseInt(questionId, 10);

        // 1. Validate attempt and question
        const attempt = await prisma.examAttempt.findUnique({
            where: { id: pAttemptId },
            include: { examSession: { include: { exam: true } } }
        });

        if (!attempt) throw new AppError('Exam attempt not found.', 404);
        if (attempt.studentId !== studentId) throw new AppError('Not authorized for this exam attempt.', 403);
        if (attempt.isSubmitted) throw new AppError('Cannot save answer for a submitted exam.', 400);

        const now = new Date();
        if (now > new Date(attempt.examSession.endTime)) {
             // Auto-submit if time is up (more complex logic needed here, potentially a separate job)
            await submitExamAttempt(pAttemptId, studentId, true); // true for autoSubmit
            throw new AppError('Exam session time is over. Answer not saved. Attempt may have been auto-submitted.', 400);
        }


        const question = await prisma.question.findUnique({
            where: { id: pQuestionId, examId: attempt.examId } // Ensure question belongs to the attempt's exam
        });
        if (!question) throw new AppError('Question not found for this exam.', 404);

        // 2. Prepare answer data
        let dataToSave = {
            examAttemptId: pAttemptId,
            questionId: pQuestionId,
        };
        let isCorrect = null;
        let marksAwarded = 0;

        if (question.questionType === QuestionType.MULTIPLE_CHOICE || question.questionType === QuestionType.TRUE_FALSE) {
            if (!selectedOptionKey) throw new AppError('Selected option key is required for this question type.', 400);
            dataToSave.selectedOptionKey = selectedOptionKey;
            if (question.correctOptionKey === selectedOptionKey) {
                isCorrect = true;
                marksAwarded = question.marks;
            } else {
                isCorrect = false;
            }
        } else if (question.questionType === QuestionType.SHORT_ANSWER || question.questionType === QuestionType.ESSAY) {
            if (answerText === undefined || answerText === null) throw new AppError('Answer text is required for this question type.', 400);
            dataToSave.answerText = answerText;
            // isCorrect and marksAwarded will be null for these types until manually graded
        } else {
            throw new AppError(`Unsupported question type for saving answer: ${question.questionType}`, 400);
        }
        dataToSave.isCorrect = isCorrect;
        dataToSave.marksAwarded = marksAwarded;


        // 3. Upsert: Create or Update the answer
        const savedAnswer = await prisma.studentAnswer.upsert({
            where: { examAttemptId_questionId: { examAttemptId: pAttemptId, questionId: pQuestionId } },
            update: dataToSave,
            create: dataToSave,
            select: { id: true, questionId: true, selectedOptionKey: true, answerText: true, isCorrect: true, marksAwarded: true }
        });

        return savedAnswer;

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error saving student answer:", error.message, error.stack);
        throw new AppError('Could not save answer.', 500);
    }
};


export const submitExamAttempt = async (attemptId, studentId, autoSubmit = false) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const pAttemptId = parseInt(attemptId, 10);

        const attempt = await prisma.examAttempt.findUnique({
            where: { id: pAttemptId },
            include: {
                studentAnswers: true,
                examSession: { include: { exam: true } }
            }
        });

        if (!attempt) throw new AppError('Exam attempt not found.', 404);
        if (attempt.studentId !== studentId) throw new AppError('Not authorized for this exam attempt.', 403);
        if (attempt.isSubmitted) throw new AppError('Exam already submitted.', 400);

        const endTime = new Date();
        const timeUsedSeconds = calculateTimeUsed(attempt.startTime, endTime);

        // Calculate total score from auto-graded answers
        let totalScoreAchieved = 0;
        let allQuestionsAnsweredAndAutoGraded = true;
        let requiresManualGrading = false;

        const questionsInExam = await prisma.question.findMany({
            where: { examId: attempt.examId },
            select: { id: true, questionType: true, marks: true }
        });


        for (const question of questionsInExam) {
            const studentAnswer = attempt.studentAnswers.find(sa => sa.questionId === question.id);
            if (studentAnswer && studentAnswer.marksAwarded !== null) {
                totalScoreAchieved += studentAnswer.marksAwarded;
            } else {
                // If an answer is missing or not auto-graded (e.g. essay), it's not fully auto-graded
                allQuestionsAnsweredAndAutoGraded = false;
                if (question.questionType === QuestionType.ESSAY || question.questionType === QuestionType.SHORT_ANSWER) {
                    requiresManualGrading = true;
                }
            }
        }

        const updatedAttempt = await prisma.examAttempt.update({
            where: { id: pAttemptId },
            data: {
                endTime: endTime,
                timeUsedSeconds: timeUsedSeconds,
                scoreAchieved: totalScoreAchieved, // This is the auto-graded score
                isSubmitted: true,
                isGraded: allQuestionsAnsweredAndAutoGraded && !requiresManualGrading, // Graded if all auto-gradable and answered
            }
        });

        // Update Exam status if needed (e.g., if all attempts for a session are submitted) - complex, separate logic

        return {
            message: autoSubmit ? 'Exam time ended. Attempt auto-submitted successfully.' : 'Exam attempt submitted successfully.',
            attemptId: updatedAttempt.id,
            scoreAchieved: updatedAttempt.scoreAchieved, // Auto-graded score
            isGraded: updatedAttempt.isGraded,
            requiresManualGrading: requiresManualGrading
        };

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error submitting exam attempt:", error.message, error.stack);
        throw new AppError('Could not submit exam attempt.', 500);
    }
};

export const getExamAttemptResult = async (attemptId, studentId, requestingUser) => {
    try {
        const pAttemptId = parseInt(attemptId, 10);
        const attempt = await prisma.examAttempt.findUnique({
            where: {id: pAttemptId},
            include: {
                exam: {select: {title: true, examType:true, totalMarks: true, passMark: true, course: {select: {code:true, title:true}}}},
                examSession: {select: {sessionName:true, startTime: true, endTime: true}},
                studentAnswers: {
                    include: {question: {select: {questionText: true, marks:true, questionType:true, correctOptionKey:true, explanation:true, options:true}}},
                    orderBy: {question: {displayOrder: 'asc'}}
                },
                student: {select: {name: true, regNo: true}}
            }
        });

        if(!attempt) throw new AppError("Exam attempt not found.", 404);

        // Authorization
        const isAdminOrManager = requestingUser.type === 'admin' || (requestingUser.type === 'ictstaff' && requestingUser.canManageExams);
        const isLecturerForCourse = false; // TODO: Implement check if lecturer is for this course/exam
        const isOwner = requestingUser.type === 'student' && attempt.studentId === studentId;

        if (!isAdminOrManager && !isLecturerForCourse && !isOwner) {
            throw new AppError("You are not authorized to view this exam attempt.", 403);
        }

        // Only show full details (like correct answers) if exam results are published or user is privileged
        const examIsPublished = attempt.exam.status === ExamStatus.RESULTS_PUBLISHED;
        const canSeeFullDetails = isAdminOrManager || isLecturerForCourse || (isOwner && examIsPublished);


        const attemptResult = {
            id: attempt.id,
            studentName: attempt.student.name,
            studentRegNo: attempt.student.regNo,
            examTitle: attempt.exam.title,
            examType: attempt.exam.examType,
            course: attempt.exam.course,
            sessionName: attempt.examSession.sessionName,
            startTime: attempt.startTime,
            endTime: attempt.endTime,
            timeUsedSeconds: attempt.timeUsedSeconds,
            scoreAchieved: attempt.scoreAchieved,
            totalMarks: attempt.exam.totalMarks,
            passMark: attempt.exam.passMark,
            isSubmitted: attempt.isSubmitted,
            isGraded: attempt.isGraded,
            answers: attempt.studentAnswers.map(ans => ({
                questionId: ans.questionId,
                questionText: ans.question.questionText,
                questionType: ans.question.questionType,
                questionMarks: ans.question.marks,
                selectedOptionKey: ans.selectedOptionKey,
                answerText: ans.answerText,
                isCorrect: canSeeFullDetails ? ans.isCorrect : undefined, // Hide if not privileged/published
                marksAwarded: ans.marksAwarded,
                correctOptionKey: canSeeFullDetails ? ans.question.correctOptionKey : undefined, // Hide if not privileged/published
                explanation: canSeeFullDetails ? ans.question.explanation : undefined, // Hide if not privileged/published
                options: canSeeFullDetails ? ans.question.options : ans.question.options.map(o => ({optionKey: o.optionKey, optionText: o.optionText})), // Hide correct answers on options
            }))
        };

        return attemptResult;

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching exam attempt result:", error.message, error.stack);
        throw new AppError('Could not retrieve exam attempt result.', 500);
    }
};