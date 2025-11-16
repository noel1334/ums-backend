
import * as CoursePrerequisiteService from '../services/coursePrerequisite.service.js';
import AppError from '../utils/AppError.js';

export const addCoursePrerequisite = async (req, res, next) => {
    try {
        const courseId = req.params.courseId; // From nested route
        const { prerequisiteId } = req.body;
        if (!prerequisiteId) return next(new AppError('Prerequisite ID is required in body.', 400));

        const newPrerequisite = await CoursePrerequisiteService.addCoursePrerequisite({ courseId, prerequisiteId });
        res.status(201).json({
            status: 'success',
            message: 'Course prerequisite added.',
            data: { prerequisiteLink: newPrerequisite },
        });
    } catch (error) {
        next(error);
    }
};
export const getAllCoursePrerequisites = async (req, res, next) => {
    try {
        const result = await CoursePrerequisiteService.getAllCoursePrerequisites(req.query, req.user);
        res.status(200).json({
            status: 'success',
            data: result,
        });
    } catch (error) {
        next(error);
    }
};
export const getPrerequisitesForCourse = async (req, res, next) => {
    try {
        const prerequisites = await CoursePrerequisiteService.getPrerequisitesForCourse(req.params.courseId, req.user);
        res.status(200).json({ status: 'success', data: { prerequisites } });
    } catch (error) {
        next(error);
    }
};

// This controller might be better suited in a general course info route if not nested
export const getCoursesRequiringPrerequisite = async (req, res, next) => {
    try {
        const courses = await CoursePrerequisiteService.getCoursesRequiringPrerequisite(req.params.prerequisiteId, req.user);
        res.status(200).json({ status: 'success', data: { courses } });
    } catch (error) {
        next(error);
    }
};


export const removeCoursePrerequisite = async (req, res, next) => {
    try {
        const { courseId, prerequisiteId } = req.params;
        await CoursePrerequisiteService.removeCoursePrerequisite(courseId, prerequisiteId);
        res.status(204).json({ status: 'success', data: null });
    } catch (error) {
        next(error);
    }
};