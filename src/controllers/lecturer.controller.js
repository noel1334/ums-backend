
import * as LecturerService from '../services/lecturer.service.js';
import AppError from '../utils/AppError.js';
import { LecturerRole } from '../generated/prisma/index.js'; // ADJUST PATH IF NEEDED


export const createLecturer = async (req, res, next) => {
    try {
        const lecturerData = { ...req.body };
        if (req.fileUrl) { // Check if an image URL was attached by the middleware
            lecturerData.profileImg = req.fileUrl;
        }

        const newLecturer = await LecturerService.createLecturer(lecturerData);
        res.status(201).json({
            status: 'success',
            message: 'Lecturer created successfully with auto-generated Staff ID.',
            data: { lecturer: newLecturer },
        });
    } catch (error) {
        next(error);
    }
};

export const getLecturerById = async (req, res, next) => {
    try {
        const lecturerId = parseInt(req.params.id, 10);
        const lecturer = await LecturerService.getLecturerById(lecturerId);

        // Authorization: Admin, HOD (for their dept), or self
        if (req.user.type === 'admin') {
            // Admin can view
        } else if (req.user.type === 'lecturer') {
            if (req.user.id === lecturerId) {
                // Self view
            } else if (req.user.role === LecturerRole.HOD && req.user.departmentId === lecturer.departmentId) {
                // HOD viewing lecturer in their department
            } else {
                return next(new AppError('You are not authorized to view this lecturer profile.', 403));
            }
        } else {
            return next(new AppError('You are not authorized to view this lecturer profile.', 403));
        }

        res.status(200).json({ status: 'success', data: { lecturer } });
    } catch (error) {
        next(error);
    }
};

export const getAllLecturers = async (req, res, next) => {
    try {
        // Service handles filtering for HOD based on req.user
        const result = await LecturerService.getAllLecturers(req.query, req.user);
        res.status(200).json({ status: 'success', data: result });
    } catch (error) {
        next(error);
    }
};

export const updateLecturer = async (req, res, next) => {
    try {
        if (Object.keys(req.body).length === 0 && !req.fileUrl) { // Also check if only an image is being updated
            return next(new AppError('No data or image provided for update.', 400));
        }
        const lecturerId = parseInt(req.params.id, 10);
        const updateData = { ...req.body };

        if (req.fileUrl) { // Check if an image URL was attached
            updateData.profileImg = req.fileUrl;
        }

        const updatedLecturer = await LecturerService.updateLecturer(lecturerId, updateData, req.user);
        res.status(200).json({
            status: 'success',
            message: 'Lecturer updated successfully',
            data: { lecturer: updatedLecturer },
        });
    } catch (error) {
        next(error);
    }
};

export const deleteLecturer = async (req, res, next) => {
    try {
        await LecturerService.deleteLecturer(req.params.id);
        res.status(204).json({ status: 'success', data: null });
    } catch (error) {
        next(error);
    }
};

export const getMyLecturerProfile = async (req, res, next) => {
    try {
        const lecturer = await LecturerService.getLecturerById(req.user.id);
        res.status(200).json({ status: 'success', data: { lecturer } });
    } catch (error) {
        next(error);
    }
};

export const updateMyLecturerProfile = async (req, res, next) => {
    try {
        if (Object.keys(req.body).length === 0 && !req.fileUrl) { // Check if only image is updated
            return next(new AppError('No data or image provided for update.', 400));
        }
        const updateData = { ...req.body };

        if (req.fileUrl) { // Check if an image URL was attached
            updateData.profileImg = req.fileUrl;
        }

        const updatedLecturer = await LecturerService.updateLecturer(req.user.id, updateData, req.user);
        res.status(200).json({
            status: 'success',
            message: 'Your profile updated successfully',
            data: { lecturer: updatedLecturer },
        });
    } catch (error) {
        next(error);
    }
};

export const getDepartmentLecturers = async (req, res, next) => {
    try {
        // The service will handle authorization based on req.user
        const result = await LecturerService.getDepartmentLecturers(req.user, req.query);
        res.status(200).json({ status: 'success', data: result });
    } catch (error) {
        next(error);
    }
};