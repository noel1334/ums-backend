// src/services/examFee.service.js
import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';

const selection = {
    id: true,
    amount: true,
    description: true,
    isActive: true,
    exam: {
        select: {
            id: true,
            title: true,
            course: { select: { code: true } },
            semester: { select: { name: true } },
            season: { select: { name: true } },
        }
    }
};

/**
 * Creates or updates a fee for a specific exam.
 */
export const createOrUpdateExamFee = async (data) => {
    const { examId, amount, description, isActive } = data;
    if (!examId || amount == null) {
        throw new AppError('Exam ID and amount are required.', 400);
    }

    const exam = await prisma.exam.findUnique({ where: { id: parseInt(examId, 10) } });
    if (!exam) throw new AppError('Exam not found.', 404);

    const feeData = {
        examId: exam.id,
        amount: parseFloat(amount),
        description,
        isActive: isActive !== undefined ? isActive : true,
    };

    const fee = await prisma.examFee.upsert({
        where: { examId: exam.id }, // Uniqueness is on examId
        create: feeData,
        update: {
            amount: feeData.amount,
            description: feeData.description,
            isActive: feeData.isActive
        },
        select: selection
    });

    return fee;
};

/**
 * Gets the fee configuration for a specific exam.
 */
export const getFeeForExam = async (examId) => {
    const pExamId = parseInt(examId, 10);
    const fee = await prisma.examFee.findUnique({
        where: { examId: pExamId },
        select: selection
    });
    // It's okay if a fee doesn't exist, we just return null.
    return fee;
};

/**
 * Deletes the fee configuration for a specific exam.
 */
export const deleteExamFee = async (feeId) => {
    const pFeeId = parseInt(feeId, 10);
    await prisma.examFee.delete({ where: { id: pFeeId } });
    return { message: 'Exam fee configuration removed successfully.' };
};