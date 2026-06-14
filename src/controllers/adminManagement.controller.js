// src/controllers/adminManagement.controller.js

import * as adminManagementService from '../services/adminManagement.service.js';
import AppError from '../utils/AppError.js';

export const handleCreateAdmin = async (req, res, next) => {
    try {
        const actorId = req.user.id;
        const adminData = { ...req.body };

        // Handle uploaded profile image if present
        if (req.fileUrl) {
            adminData.profileImg = req.fileUrl;
        }

        const newAdmin = await adminManagementService.createAdmin(actorId, adminData);
        
        res.status(201).json({
            status: 'success',
            data: { admin: newAdmin }
        });
    } catch (error) {
        next(error);
    }
};

export const handleGetAllAdmins = async (req, res, next) => {
    try {
        const admins = await adminManagementService.getAllAdmins();
        
        res.status(200).json({
            status: 'success',
            data: { admins }
        });
    } catch (error) {
        next(error);
    }
};

export const handleGetAdminById = async (req, res, next) => {
    try {
        const adminId = parseInt(req.params.id, 10);
        if (isNaN(adminId)) {
            throw new AppError('Invalid administrator identifier.', 400);
        }

        const admin = await adminManagementService.getAdminById(adminId);
        
        res.status(200).json({
            status: 'success',
            data: { admin }
        });
    } catch (error) {
        next(error);
    }
};

export const handleUpdateAdmin = async (req, res, next) => {
    try {
        const adminId = parseInt(req.params.id, 10);
        if (isNaN(adminId)) {
            throw new AppError('Invalid administrator identifier.', 400);
        }

        const updateData = { ...req.body };
        
        // Handle uploaded profile image if updated
        if (req.fileUrl) {
            updateData.profileImg = req.fileUrl;
        }

        // Pass req.user to evaluate modifying privileges inside the service
        const updatedAdmin = await adminManagementService.updateAdmin(adminId, updateData, req.user);
        
        res.status(200).json({
            status: 'success',
            data: { admin: updatedAdmin }
        });
    } catch (error) {
        next(error);
    }
};

export const handleDeleteAdmin = async (req, res, next) => {
    try {
        const targetId = parseInt(req.params.id, 10);
        const actorId = req.user.id;

        if (isNaN(targetId)) {
            throw new AppError('Invalid administrator identifier.', 400);
        }

        const result = await adminManagementService.deleteAdmin(targetId, actorId);
        
        res.status(200).json({
            status: 'success',
            message: result.message
        });
    } catch (error) {
        next(error);
    }
};