
import * as FacultyService from '../services/faculty.service.js';
import AppError from '../utils/AppError.js';

export const createFaculty = async (req, res, next) => {
    try {
        const { name, facultyCode, description } = req.body;
        if (!name || !facultyCode) {
            return next(new AppError('Faculty name and faculty code are required.', 400));
        }
        const faculty = await FacultyService.createFaculty({ name, facultyCode, description });
        res.status(201).json({
            status: 'success',
            message: 'Faculty created successfully',
            data: { faculty },
        });
    } catch (error) {
        next(error);
    }
};

export const getAllFaculties = async (req, res, next) => { // Corrected: Now a proper controller function
    try {
        const faculties = await FacultyService.getAllFaculties(); // Calls the service
        res.status(200).json({
            status: 'success',
            results: faculties.length,
            data: { faculties },
        });
    } catch (error) {
        next(error);
    }
};

export const getFacultyById = async (req, res, next) => { // Corrected
    try {
        const facultyId = req.params.id; // Get ID from request parameters
        const faculty = await FacultyService.getFacultyById(facultyId); // Calls the service
        res.status(200).json({
            status: 'success',
            data: { faculty },
        });
    } catch (error) {
        next(error);
    }
};

export const updateFaculty = async (req, res, next) => {
    try {
        if (Object.keys(req.body).length === 0) {
            return next(new AppError('No data provided for update.', 400));
        }
        const facultyId = req.params.id;
        const faculty = await FacultyService.updateFaculty(facultyId, req.body);
        res.status(200).json({
            status: 'success',
            message: 'Faculty updated successfully',
            data: { faculty },
        });
    } catch (error) {
        next(error);
    }
};

export const deleteFaculty = async (req, res, next) => { // Corrected
    try {
        const facultyId = req.params.id;
        await FacultyService.deleteFaculty(facultyId); // Calls the service
        res.status(204).json({ // 204 No Content for successful deletion
            status: 'success',
            data: null,
        });
    } catch (error) {
        next(error);
    }
};