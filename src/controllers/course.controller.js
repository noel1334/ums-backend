import * as CourseService from '../services/course.service.js';
import AppError from '../utils/AppError.js';

export const createCourse = async (req, res, next) => {
    try {
        const newCourse = await CourseService.createCourse(req.body);
        res.status(201).json({
            status: 'success',
            message: 'Course created successfully.',
            data: { course: newCourse },
        });
    } catch (error) {
        next(error);
    }
};

export const getCourseById = async (req, res, next) => {
    try {
        const course = await CourseService.getCourseById(req.params.id, req.user); // Pass req.user
        res.status(200).json({ status: 'success', data: { course } });
    } catch (error) {
        next(error);
    }
};

export const getAllCourses = async (req, res, next) => {
    try {
        const result = await CourseService.getAllCourses(req.query, req.user); // Pass req.user
        res.status(200).json({ status: 'success', data: result });
    } catch (error) {
        next(error);
    }
};

export const updateCourse = async (req, res, next) => {
    try {
        if (Object.keys(req.body).length === 0) {
            return next(new AppError('No data provided for update.', 400));
        }
        const updatedCourse = await CourseService.updateCourse(req.params.id, req.body);
        res.status(200).json({
            status: 'success',
            message: 'Course updated successfully.',
            data: { course: updatedCourse },
        });
    } catch (error) {
        next(error);
    }
};

export const setCourseActiveStatus = async (req, res, next) => {
    try {
        const { isActive } = req.body; // Get isActive from request body

        if (isActive === undefined || typeof isActive !== 'boolean') {
            return next(new AppError('The "isActive" field (true or false) is required in the request body.', 400));
        }

        const result = await CourseService.setCourseActiveStatus(req.params.id, isActive);
        res.status(200).json({
            status: 'success',
            message: result.message,
            data: {
                isActive: result.newStatus
            }
        });
    } catch (error) {
        next(error);
    }
};

export const deleteCourse = async (req, res, next) => { // This is your permanent delete
    try {
        const result = await CourseService.deleteCourse(req.params.id); // Calls the permanent delete service
        res.status(200).json({
            status: 'success',
            message: result.message,
        });
    } catch (error) {
        next(error);
    }
};