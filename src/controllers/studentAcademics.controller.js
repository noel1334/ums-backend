// src/controllers/studentAcademics.controller.js (NEW FILE)

import * as StudentAcademicsService from '../services/studentAcademics.service.js';
import * as StudentService from '../services/student.service.js'; // Needed to lookup student by regNo
import AppError from '../utils/AppError.js';
 
export const getRegistrableCoursesByAdmin = async (req, res, next) => {
    try {
        const {
            studentIdentifier, // RegNo, JAMB No, or Email
            seasonId,
            semesterId,
            levelId, // Optional filter
            departmentId, // Optional filter
            programId // Optional filter
        } = req.query; // Use req.query as frontend sends search params as query string

        if (!studentIdentifier || !seasonId || !semesterId) {
            return next(new AppError('Student identifier, Season ID, and Semester ID are required.', 400));
        }

        // Pass optional filters object
        const filters = { levelId, departmentId, programId };

        const result = await StudentAcademicsService.getRegistrableCoursesForAdmin(
            studentIdentifier,
            seasonId,
            semesterId,
            req.user, // Pass requesting user for authorization checks
            filters
        );

        res.status(200).json({
            status: 'success',
            message: 'Registrable courses retrieved successfully for student.',
            data: result,
        });

    } catch (error) {
        next(error);
    }
};
