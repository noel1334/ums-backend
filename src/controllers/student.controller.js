// src/controllers/student.controller.js

import * as StudentService from '../services/student.service.js';
import * as StudentAcademicsService from '../services/studentAcademics.service.js';
import AppError from '../utils/AppError.js';
import { LecturerRole } from '../generated/prisma/index.js';
import catchAsync from '../utils/catchAsync.js';

// Admin creates student
export const createStudent = async (req, res, next) => {
    try {
        const newStudent = await StudentService.createStudent(req.body);
        res.status(201).json({
            status: 'success',
            message: 'Student created successfully',
            data: { student: newStudent },
        });
    } catch (error) {
        next(error);
    }
};

// Admin deletes student
export const deleteStudent = async (req, res, next) => {
    try {
        await StudentService.deleteStudent(req.params.id);
        res.status(204).json({
            status: 'success',
            data: null,
        });
    } catch (error) {
        next(error);
    }
};

// Student gets their own profile
export const getMyProfile = async (req, res, next) => {
    try {
        // FIXED: Added req.user as the second argument to match the service signature
        const student = await StudentService.getStudentById(req.user.id, req.user); 
        res.status(200).json({
            status: 'success',
            data: { student },
        });
    } catch (error) {
        next(error);
    }
};

// Student updates their own profile (limited fields)
export const updateMyProfile = async (req, res, next) => {
    try {
        if (Object.keys(req.body).length === 0) {
            return next(new AppError('No data provided for update.', 400));
        }
        const updatedStudent = await StudentService.updateStudent(req.user.id, req.body, req.user);
        res.status(200).json({
            status: 'success',
            message: 'Your profile has been updated successfully.',
            data: { student: updatedStudent },
        });
    } catch (error) {
        next(error);
    }
};

export const getAllStudents = async (req, res, next) => {
    try {
        const result = await StudentService.getAllStudents(req.query, req.user);
        res.status(200).json({ status: 'success', data: result });
    } catch (error) {
        next(error);
    }
};

// Modified getStudentById to allow HOD to view students in their department
export const getStudentById = async (req, res, next) => {
    try {
        const studentId = parseInt(req.params.id, 10);
        if (isNaN(studentId)) return next(new AppError('Invalid student ID format.', 400));

        // FIXED: Added req.user as the second argument to match the service signature
        const student = await StudentService.getStudentById(studentId, req.user); 

        // Authorization checks (re-checked here for robust error messages)
        const { user } = req; 
        if (user.type === 'admin' || (user.type === 'student' && user.id === studentId)) {
            // Allowed
        } else if (user.type === 'lecturer' && user.role === LecturerRole.HOD && student && user.departmentId === student.departmentId) {
            // HOD viewing student in their department
        } else {
            return next(new AppError('You are not authorized to view this student profile.', 403));
        }
        res.status(200).json({ status: 'success', data: { student } });
    } catch (error) {
        next(error);
    }
};

export const updateStudent = async (req, res, next) => {
    try {
        if (Object.keys(req.body).length === 0) {
            return next(new AppError('No data provided for update.', 400));
        }
        const studentId = parseInt(req.params.id, 10);
        const updatedStudent = await StudentService.updateStudent(studentId, req.body, req.user);
        res.status(200).json({
            status: 'success',
            message: 'Student updated successfully',
            data: { student: updatedStudent },
        });
    } catch (error) {
        next(error);
    }
};

export const getMyCourseStudents = catchAsync(async (req, res, next) => {
    const result = await StudentService.getMyCourseStudentsList(req.user, req.query);
    res.status(200).json({
        status: 'success',
        data: result,
    });
});

export const getMyRegistrableCourses = async (req, res, next) => {
    try {
        const { seasonId, semesterId } = req.query;
        if (!seasonId || !semesterId) {
            return next(new AppError('Target Season ID and Semester ID are required in query.', 400));
        }

        const result = await StudentAcademicsService.getRegistrableCoursesForStudent(
            req.user.id,
            seasonId,
            semesterId
        );
        res.status(200).json({
            status: 'success',
            data: result,
        });
    } catch (error) {
        next(error);
    }
};

export const getMyProgramCurriculumCourses = async (req, res, next) => {
    try {
        const { seasonId, semesterId, levelId } = req.query;
        if (!seasonId || !semesterId) {
            return next(new AppError('Season ID and Semester ID are required in query.', 400));
        }

        const result = await StudentAcademicsService.getStudentCurriculumCoursesForPeriod(
            req.user.id,
            seasonId,
            semesterId,
            levelId
        );
        res.status(200).json({
            status: 'success',
            data: { settings: result }
        });
    } catch (error) {
        next(error);
    }
};

export const getDepartmentStudents = async (req, res, next) => {
    try {
        const result = await StudentService.getDepartmentStudents(req.user, req.query);
        res.status(200).json({
            status: 'success',
            data: result,
        });
    } catch (error) {
        next(error);
    }
};

export const getStudentsForAssignedCourse = async (req, res, next) => {
    try {
        const result = await StudentService.getStudentsForAssignedCourse(req.user, req.query);
        res.status(200).json({
            status: 'success',
            data: result,
        });
    } catch (error) {
        next(error);
    }
};

export const batchCreateStudents = async (req, res, next) => {
    try {
        const studentDataArray = req.body.students;
        
        if (!Array.isArray(studentDataArray) || studentDataArray.length === 0) {
            return next(new AppError('Student data must be a non-empty array in the request body.', 400));
        }
        if (studentDataArray.length > 500) {
            return next(new AppError('Batch size too large. Please send a maximum of 500 students at a time.', 400));
        }

        const result = await StudentService.batchCreateStudents(studentDataArray, req.user);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
};