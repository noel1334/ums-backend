import * as DepartmentService from '../services/department.service.js';
import AppError from '../utils/AppError.js';

export const createDepartment = async (req, res, next) => {
    try {
        const { name, facultyId } = req.body;
        if (!name || !facultyId) { // Basic validation
            return next(new AppError('Department name and faculty ID are required.', 400));
        }
        const department = await DepartmentService.createDepartment({ name, facultyId });
        res.status(201).json({
            status: 'success',
            message: 'Department created successfully',
            data: { department },
        });
    } catch (error) {
        next(error);
    }
};

export const getAllDepartments = async (req, res, next) => {
    try {
        const departments = await DepartmentService.getAllDepartments(req.query);
        res.status(200).json({
            status: 'success',
            results: departments.length,
            data: { departments },
        });
    } catch (error) {
        next(error);
    }
};

export const getDepartmentById = async (req, res, next) => {
    try {
        const department = await DepartmentService.getDepartmentById(req.params.id);
        res.status(200).json({
            status: 'success',
            data: { department },
        });
    } catch (error) {
        next(error);
    }
};

export const updateDepartment = async (req, res, next) => {
    try {
        // Ensure there's at least some data to update
        if (Object.keys(req.body).length === 0) {
            return next(new AppError('No data provided for update.', 400));
        }
        const department = await DepartmentService.updateDepartment(req.params.id, req.body);
        res.status(200).json({
            status: 'success',
            message: 'Department updated successfully',
            data: { department },
        });
    } catch (error) {
        next(error);
    }
};

export const deleteDepartment = async (req, res, next) => {
    try {
        await DepartmentService.deleteDepartment(req.params.id);
        res.status(204).json({
            status: 'success',
            data: null,
        });
    } catch (error) {
        next(error);
    }
};