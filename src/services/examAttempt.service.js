// src/services/examAttempt.service.js
import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import { QuestionType, ExamStatus } from '../generated/prisma/index.js';

const calculateTimeUsed = (startTime, endTime) => {
    if (!startTime || !endTime) return null;
    return Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000);
};

// Helper to get randomized questions for a new exam attempt
const getQuestionsForAttempt = async (examId, questionsToAttempt) => {
    const questionsFromBank = await prisma.question.findMany({
        where: { examId: examId, isBankQuestion: true },
        include: { options: { orderBy: { optionKey: 'asc' } } }
    });

    if (questionsFromBank.length < questionsToAttempt) {
        throw new AppError(`Not enough questions in the bank (${questionsFromBank.length}) for this exam (requires ${questionsToAttempt}).`, 400);
    }

    const shuffled = questionsFromBank.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, questionsToAttempt);
};

// Handles both starting a new attempt and resuming an existing one.
export const startExamAttempt = async (studentId, examSessionId, clientIpAddress, clientUserAgent) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);

        const pStudentId = parseInt(studentId, 10);
        const pExamSessionId = parseInt(examSessionId, 10);

        // 1. Verify Student Assignment and Session Validity
        const assignment = await prisma.studentExamSessionAssignment.findUnique({
            where: { studentId_examSessionId: { studentId: pStudentId, examSessionId: pExamSessionId } },
            include: {
                examSession: { include: { exam: true } },
                student: { select: { isActive: true } }
            }
        });

        if (!assignment) throw new AppError('You are not assigned to this exam session.', 403);
        if (!assignment.student || !assignment.student.isActive) throw new AppError('Your student account is inactive.', 403);

        const { examSession } = assignment;
        const { exam } = examSession;

        if (!examSession.isActive) throw new AppError('This exam session is not currently active.', 403);
        if (exam.status !== ExamStatus.ACTIVE) throw new AppError(`This exam (${exam.title}) is not currently active.`, 403);

        const now = new Date();
        if (now < new Date(examSession.startTime)) throw new AppError('This exam session has not started yet.', 403);
        if (now > new Date(examSession.endTime)) throw new AppError('This exam session has already ended.', 403);
        
        // 2. Check for an existing attempt by this student for this session
        const existingAttempt = await prisma.examAttempt.findFirst({
            where: {
                studentId: pStudentId,
                examSessionId: pExamSessionId,
            }
        });
        
        if (existingAttempt && existingAttempt.isSubmitted) {
            throw new AppError('You have already completed and submitted this exam.', 409);
        }

        let attempt;
        let questionsForAttempt;
        let savedAnswers = {}; // Initialize empty object to hold answers

        if (existingAttempt) {
            // --- RESUME LOGIC ---
            attempt = existingAttempt;

            // Fetch the questions assigned to this specific attempt
            const attemptQuestions = await prisma.examAttemptQuestion.findMany({
                where: { examAttemptId: attempt.id },
                include: {
                    question: {
                        include: { options: { orderBy: { optionKey: 'asc' } } }
                    }
                },
                orderBy: { displayOrder: 'asc' }
            });
            questionsForAttempt = attemptQuestions.map(aq => aq.question);

            // --- FIX: Fetch the student's previously saved answers for this attempt ---
            const studentAnswersFromDb = await prisma.studentAnswer.findMany({
                where: { examAttemptId: attempt.id }
            });

            // --- FIX: Transform the saved answers into the format required by the frontend ---
            savedAnswers = studentAnswersFromDb.reduce((acc, ans) => {
                const question = questionsForAttempt.find(q => q.id === ans.questionId);
                if (question) {
                    if (question.questionType === 'MULTIPLE_CHOICE' || question.questionType === 'TRUE_FALSE') {
                        acc[ans.questionId] = ans.selectedOptionKey;
                    } else if (question.questionType === 'FILL_IN_THE_BLANKS') {
                        try {
                            // The answer is stored as a stringified array, so we parse it back
                            acc[ans.questionId] = JSON.parse(ans.answerText);
                        } catch (e) {
                            // Fallback in case the stored text is not valid JSON
                            acc[ans.questionId] = [ans.answerText]; 
                        }
                    } else { // For ESSAY and SHORT_ANSWER
                        acc[ans.questionId] = ans.answerText;
                    }
                }
                return acc;
            }, {});

        } else {
            // --- START NEW ATTEMPT LOGIC ---
            const selectedQuestions = await getQuestionsForAttempt(exam.id, exam.questionsToAttempt);
            if (selectedQuestions.length === 0) {
                throw new AppError('No questions could be prepared for this exam attempt.', 500);
            }
            questionsForAttempt = selectedQuestions;

            attempt = await prisma.$transaction(async (tx) => {
                const newAttempt = await tx.examAttempt.create({
                    data: {
                        studentId: pStudentId,
                        examId: exam.id,
                        examSessionId: pExamSessionId,
                        startTime: now,
                        ipAddress: clientIpAddress,
                        userAgent: clientUserAgent,
                    },
                });

                const questionsToLink = selectedQuestions.map((q, index) => ({
                    examAttemptId: newAttempt.id,
                    questionId: q.id,
                    displayOrder: index + 1,
                }));

                await tx.examAttemptQuestion.createMany({
                    data: questionsToLink,
                });

                return newAttempt;
            });
        }

        // 3. Return data for the frontend to render the exam
        return {
            attemptId: attempt.id,
            examTitle: exam.title,
            examType: exam.examType,
            durationMinutes: exam.durationMinutes,
            questionsToAttempt: exam.questionsToAttempt,
            sessionEndTime: examSession.endTime,
            attemptStartTime: attempt.startTime,
            questions: questionsForAttempt.map(q => ({
                id: q.id,
                questionText: q.questionText,
                questionType: q.questionType,
                marks: q.marks,
                options: q.options ? q.options.map(opt => ({
                    id: opt.id,
                    optionKey: opt.optionKey,
                    optionText: opt.optionText
                })) : []
            })),
            savedAnswers: savedAnswers // --- FIX: Include the saved answers in the API response ---
        };

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error starting/resuming exam attempt:", error.message, error.stack);
        throw new AppError('Could not start or resume the exam attempt.', 500);
    }
};
export const saveStudentAnswer = async (attemptId, studentId, answerData) => {
    try {
        if (!prisma) throw new AppError('Prisma client unavailable', 500);
        const { questionId, selectedOptionKey, answerText } = answerData;

        const pAttemptId = parseInt(attemptId, 10);
        const pQuestionId = parseInt(questionId, 10);

        // 1. Validate the attempt and session timing (No changes needed)
        const attempt = await prisma.examAttempt.findUnique({
            where: { id: pAttemptId },
            include: { examSession: true }
        });
        if (!attempt) throw new AppError('Exam attempt not found.', 404);
        if (attempt.studentId !== studentId) throw new AppError('Not authorized for this exam attempt.', 403);
        if (attempt.isSubmitted) throw new AppError('Cannot save answer for a submitted exam.', 400);
        const now = new Date();
        if (now > new Date(attempt.examSession.endTime)) {
            await submitExamAttempt(pAttemptId, studentId, true);
            throw new AppError('Exam session time is over. Answer not saved. Attempt has been auto-submitted.', 400);
        }

        // 2. Get the full question details (No changes needed)
        const questionInAttempt = await prisma.examAttemptQuestion.findUnique({
             where: { examAttemptId_questionId: { examAttemptId: pAttemptId, questionId: pQuestionId } },
             include: { question: true }
        });
        if (!questionInAttempt) {
            throw new AppError('This question is not part of your assigned exam questions.', 403);
        }
        const { question } = questionInAttempt;

        // 3. Prepare answer data with corrected grading logic
        let dataToSave = { examAttemptId: pAttemptId, questionId: pQuestionId };
        let isCorrect = null;
        let marksAwarded = 0;

        if (question.questionType === QuestionType.MULTIPLE_CHOICE || question.questionType === QuestionType.TRUE_FALSE) {
            if (!selectedOptionKey) throw new AppError('An option key is required for this question type.', 400);
            dataToSave.selectedOptionKey = selectedOptionKey;
            isCorrect = (question.correctOptionKey === selectedOptionKey);
            marksAwarded = isCorrect ? question.marks : 0;

        } else if ([QuestionType.SHORT_ANSWER, QuestionType.ESSAY, QuestionType.FILL_IN_THE_BLANKS].includes(question.questionType)) {
            if (answerText === undefined || answerText === null) throw new AppError('Answer text is required for this question type.', 400);
            dataToSave.answerText = answerText;

            const correctAnswer = question.explanation;

            if (correctAnswer && correctAnswer.trim() !== '') {
                
                // --- FIX STARTS HERE ---
                if (question.questionType === QuestionType.FILL_IN_THE_BLANKS) {
                    try {
                        // The student's answer is a stringified array, e.g., '["Albert Einstein"]'
                        const studentAnswerArray = JSON.parse(answerText);
                        // Get the first answer from the array (assuming one blank per question for now)
                        const studentAnswerSingle = studentAnswerArray[0] || ""; 
                        
                        // Now compare the plain strings, ignoring case and whitespace
                        isCorrect = studentAnswerSingle.trim().toLowerCase() === correctAnswer.trim().toLowerCase();
                    } catch (e) {
                        // If JSON.parse fails, the answer format is wrong, so it's incorrect.
                        console.error('Failed to parse FILL_IN_THE_BLANKS answer:', answerText);
                        isCorrect = false;
                    }
                } else {
                    // This is the existing logic for ESSAY and SHORT_ANSWER, which is correct.
                    isCorrect = answerText.trim().toLowerCase() === correctAnswer.trim().toLowerCase();
                }
                // --- FIX ENDS HERE ---

            } else {
                isCorrect = null; 
            }
            
            marksAwarded = isCorrect === true ? question.marks : 0;
        } else {
            throw new AppError(`Unsupported question type for saving answer: ${question.questionType}`, 400);
        }
        
        dataToSave.isCorrect = isCorrect;
        dataToSave.marksAwarded = marksAwarded;

        // 4. Upsert the student's answer (No changes needed)
        const savedAnswer = await prisma.studentAnswer.upsert({
            where: { examAttemptId_questionId: { examAttemptId: pAttemptId, questionId: pQuestionId } },
            update: dataToSave,
            create: dataToSave,
            select: { id: true, questionId: true, selectedOptionKey: true, answerText: true }
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

        return await prisma.$transaction(async (tx) => {
            // Find the attempt and include its related Exam details
            const attempt = await tx.examAttempt.findUnique({
                where: { id: pAttemptId },
                // --- MODIFICATION START: Include the Exam model ---
                include: {
                    exam: {
                        select: {
                            totalMarks: true,
                            passMark: true,
                            examType: true // <-- ADD THIS LIN
                        }
                    }
                }
                // --- MODIFICATION END ---
            });

            if (!attempt) throw new AppError('Exam attempt not found.', 404);
            if (attempt.studentId !== studentId) throw new AppError('Not authorized to submit this exam attempt.', 403);
            if (attempt.isSubmitted) return { message: 'Exam was already submitted.', attemptId: attempt.id, scoreAchieved: attempt.scoreAchieved, isGraded: attempt.isGraded };

            const endTime = new Date();
            const timeUsedSeconds = calculateTimeUsed(attempt.startTime, endTime);

            // Fetch all answers for this attempt to calculate the score
            const studentAnswers = await tx.studentAnswer.findMany({
                where: { examAttemptId: pAttemptId }
            });

            const totalScoreAchieved = studentAnswers.reduce((total, answer) => {
                return total + (answer.marksAwarded || 0);
            }, 0);
            
            const requiresManualGrading = studentAnswers.some(ans => ans.isCorrect === null);

            // Update the main ExamAttempt record
            const updatedAttempt = await tx.examAttempt.update({
                where: { id: pAttemptId },
                data: {
                    endTime,
                    timeUsedSeconds,
                    scoreAchieved: totalScoreAchieved,
                    isSubmitted: true,
                    isGraded: !requiresManualGrading,
                }
            });

            // --- MODIFICATION START: Add new fields to the return object ---
            return {
                message: autoSubmit ? 'Exam time ended. Your attempt has been auto-submitted.' : 'Exam submitted successfully.',
                attemptId: updatedAttempt.id,
                scoreAchieved: updatedAttempt.scoreAchieved,
                isGraded: updatedAttempt.isGraded,
                requiresManualGrading,
                // Add the exam's total marks and pass mark to the response
                totalMarks: attempt.exam.totalMarks,
                passMark: attempt.exam.passMark,
                examType: attempt.exam.examType
            };
            // --- MODIFICATION END ---
        });
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error submitting exam attempt:", error.message, error.stack);
        throw new AppError('Could not submit exam attempt.', 500);
    }
};
export const getExamAttemptResult = async (attemptId, studentIdForAuth, requestingUser) => {
    try {
        const pAttemptId = parseInt(attemptId, 10);
        if (isNaN(pAttemptId)) {
            throw new AppError('Invalid Exam Attempt ID provided.', 400);
        }

        const attempt = await prisma.examAttempt.findUnique({
            where: { id: pAttemptId },
            include: {
                // Basic info for the summary cards
                student: { select: { id: true, name: true, regNo: true } },
                exam: { select: { title: true, totalMarks: true, status: true } },
                examSession: { select: { sessionName: true } },

                // Get ALL questions assigned to this attempt via the link table
                questions: {
                    orderBy: { displayOrder: 'asc' },
                    include: {
                        question: { // For each linked question, get its full details
                            include: {
                                options: { orderBy: { optionKey: 'asc' } } // And all its options
                            }
                        }
                    }
                },

                // Get all answers the student actually provided
                studentAnswers: true,
            }
        });

        if (!attempt) {
            throw new AppError("Exam attempt not found.", 404);
        }

        // --- Authorization Check ---
        const isAdminOrManager = requestingUser.type === 'admin' || requestingUser.type === 'ictstaff';
        const isOwner = requestingUser.type === 'student' && attempt.studentId === studentIdForAuth;
        // NOTE: A more complex system might also check if the user is a lecturer for the course.
        if (!isAdminOrManager && !isOwner) {
            throw new AppError("You are not authorized to view this exam attempt.", 403);
        }

        // --- Data Processing ---

        // Create a fast lookup map of the student's answers.
        // Key: questionId, Value: studentAnswer object
        const studentAnswersMap = new Map(
            attempt.studentAnswers.map(ans => [ans.questionId, ans])
        );
        
        // Determine if the user should see the correct answers
        const examIsPublished = attempt.exam.status === ExamStatus.RESULTS_PUBLISHED;
        const canSeeFullDetails = isAdminOrManager || (isOwner && examIsPublished);

        // Map over the definitive list of ASSIGNED questions to build the analysis
        const questionAnalysis = attempt.questions.map(attemptQuestionLink => {
            const question = attemptQuestionLink.question;
            const studentAnswer = studentAnswersMap.get(question.id);

            return {
                id: question.id,
                questionText: question.questionText,
                options: canSeeFullDetails 
                    ? question.options.map(opt => ({ key: opt.optionKey, text: opt.optionText }))
                    : question.options.map(opt => ({ key: opt.optionKey, text: 'Answer hidden' })), // Hide options if results not published
                
                // If full details are allowed, provide correct keys, otherwise null
                correctAnswerKey: canSeeFullDetails ? question.correctOptionKey : null,
                explanation: canSeeFullDetails ? question.explanation : null,

                // Student's submission details
                studentAnswerKey: studentAnswer?.selectedOptionKey || null,
                answerText: studentAnswer?.answerText || null,
                isCorrect: studentAnswer?.isCorrect ?? null, // Use nullish coalescing for unanswered questions
                marksAwarded: studentAnswer?.marksAwarded || 0,
            };
        });

        // --- Format the Final Response Object ---
        const result = {
            // Student and Attempt Summary data
            studentName: attempt.student.name,
            studentId: attempt.student.id,
            regNo: attempt.student.regNo,
            examName: attempt.exam.title,
            sessionName: attempt.examSession.sessionName,
            startTime: attempt.startTime,
            endTime: attempt.endTime,
            timeUsedSeconds: attempt.timeUsedSeconds,
            totalScore: attempt.scoreAchieved,
            maxScore: attempt.exam.totalMarks,
            // REMOVED percentage: attempt.exam.totalMarks > 0 ? ((attempt.scoreAchieved / attempt.exam.totalMarks) * 100) : 0,

            // The detailed question-by-question breakdown
            questions: questionAnalysis
        };

        return result;

    } catch (error) {
        // Pass known AppErrors to the global error handler
        if (error instanceof AppError) {
            throw error;
        }
        // Log unexpected errors for debugging
        console.error("Error fetching exam attempt result:", error.message, error.stack);
        // Throw a generic error for the client
        throw new AppError('Could not retrieve the exam attempt result due to a server error.', 500);
    }
};

// ===================================================================
// --- NEW SERVICE FUNCTIONS FOR ADMIN DASHBOARD ---
// ===================================================================

/**
 * Fetches a detailed summary of all attempts for a given exam session.
 * Designed for the admin/ICT "View Attempts" page.
 */
export const getAttemptsSummaryForSession = async (examSessionId) => {
    const pSessionId = parseInt(examSessionId, 10);
    if (isNaN(pSessionId)) throw new AppError('Invalid Exam Session ID.', 400);

    const attempts = await prisma.examAttempt.findMany({
        where: { examSessionId: pSessionId },
        include: {
            student: {
                select: { id: true, name: true, regNo: true }
            },
            exam: { // <--- This includes the 'exam' model
                select: { questionsToAttempt: true, totalMarks: true } // <--- Selecting totalMarks here
            },
            _count: {
                select: { studentAnswers: true }
            }
        },
        orderBy: {
            startTime: 'asc'
        }
    });

    // Format the data to match the frontend UI
    const formattedAttempts = attempts.map(attempt => {
        const durationSeconds = attempt.timeUsedSeconds || (attempt.endTime ? (new Date(attempt.endTime) - new Date(attempt.startTime)) / 1000 : null);
        
        let durationStr = '-';
        if (durationSeconds) {
            const hours = Math.floor(durationSeconds / 3600);
            const minutes = Math.floor((durationSeconds % 3600) / 60);
            durationStr = `${hours > 0 ? `${hours}h ` : ''}${minutes}m`;
        }
        
        return {
            id: attempt.id,
            studentId: attempt.student.id,
            studentName: attempt.student.name,
            regNo: attempt.student.regNo,
            startTime: attempt.startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            endTime: attempt.endTime ? attempt.endTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '-',
            duration: durationStr,
            questionsAnswered: attempt._count.studentAnswers,
            totalQuestions: attempt.exam.questionsToAttempt,
            // --- MODIFIED LINES HERE ---
            score: attempt.scoreAchieved, // Now directly uses the raw score
            totalMarks: attempt.exam.totalMarks, // Provides the total marks for the exam
            // --- END MODIFICATION ---
            status: attempt.isSubmitted ? 'Completed' : 'In Progress' // Add more logic for 'Submitted Early' if needed
        };
    });

    return formattedAttempts;
};


/**
 * Fetches a summary of final results for a given exam session.
 * Designed for the admin/ICT "View Results" page.
 */
export const getResultsSummaryForSession = async (examSessionId) => {
    const pSessionId = parseInt(examSessionId, 10);
    if (isNaN(pSessionId)) throw new AppError('Invalid Exam Session ID.', 400);

    const submittedAttempts = await prisma.examAttempt.findMany({
        where: {
            examSessionId: pSessionId,
            isSubmitted: true // Only fetch submitted exams for results
        },
        include: {
            student: {
                select: { id: true, name: true, regNo: true }
            },
            exam: {
                select: { totalMarks: true, passMark: true }
            }
        },
        orderBy: {
            scoreAchieved: 'desc'
        }
    });

    // Simple grade calculation helper (keeping for potential internal use, but won't be in API response)
    const calculateGrade = (percentage) => {
        if (percentage >= 70) return 'A';
        if (percentage >= 60) return 'B';
        if (percentage >= 50) return 'C';
        if (percentage >= 45) return 'D';
        return 'F';
    };

    const formattedResults = submittedAttempts.map(attempt => {
        const percentage = ((attempt.scoreAchieved / attempt.exam.totalMarks) * 100); // Removed percentage calculation
        const status = percentage >= (attempt.exam.passMark || 50) ? 'Pass' : 'Fail'; // Removed status derivation from percentage

        return {
            id: attempt.id,
            studentId: attempt.student.id,
            studentName: attempt.student.name,
            regNo: attempt.student.regNo,
            totalScore: attempt.scoreAchieved,
            maxScore: attempt.exam.totalMarks,
             percentage: percentage.toFixed(0),
             grade: calculateGrade(percentage),
            status: attempt.isGraded ? 'Graded' : 'Pending Grading' // Generic status based on grading state
        };
    });

    return formattedResults;
};

// ===================================================================
// --- NEW SERVICE: Delete an exam attempt by its ID ---
// ===================================================================
export const deleteExamAttempt = async (attemptId) => {
    const pAttemptId = parseInt(attemptId, 10);
    if (isNaN(pAttemptId)) {
        throw new AppError('Invalid Exam Attempt ID provided.', 400);
    }

    try {
        // Prisma's delete will throw an error if the record is not found
        await prisma.examAttempt.delete({
            where: { id: pAttemptId },
        });
        return { message: 'Attempt deleted.' };
    } catch (error) {
        // Check if the error is because the record was not found
        if (error.code === 'P2025') {
            throw new AppError('Exam attempt not found.', 404);
        }
        // Re-throw other errors
        throw error;
    }
};