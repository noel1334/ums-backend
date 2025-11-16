
import { GradeLetter } from '../generated/prisma/index.js';

export const calculateGradeAndPoint = (totalScore) => {
    if (totalScore === null || totalScore === undefined) return { grade: null, point: null };
    if (totalScore >= 70) return { grade: GradeLetter.A, point: 5.0 };
    if (totalScore >= 60) return { grade: GradeLetter.B, point: 4.0 };
    if (totalScore >= 50) return { grade: GradeLetter.C, point: 3.0 };
    if (totalScore >= 45) return { grade: GradeLetter.D, point: 2.0 };
    if (totalScore >= 40) return { grade: GradeLetter.E, point: 1.0 };
    return { grade: GradeLetter.F, point: 0.0 };
    // Adjust scale as per your institution's policy
};