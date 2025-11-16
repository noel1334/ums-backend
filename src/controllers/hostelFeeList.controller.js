// src/controllers/hostelFeeList.controller.js

import * as HostelFeeListService from '../services/hostelFeeList.service.js';
import AppError from '../utils/AppError.js';

export const createHostelFeeList = async (req, res, next) => {
    try {
        const newHostelFeeList = await HostelFeeListService.createHostelFeeList(req.body);
        res.status(201).json({ status: 'success', message: 'Hostel Fee List entry created.', data: { hostelFeeList: newHostelFeeList } });
    } catch (error) { next(error); }
};

export const getHostelFeeListById = async (req, res, next) => {
    try {
        const hostelFeeList = await HostelFeeListService.getHostelFeeListById(req.params.id);
        res.status(200).json({ status: 'success', data: { hostelFeeList } });
    } catch (error) { next(error); }
};

export const getAllHostelFeeLists = async (req, res, next) => {
    try {
        const result = await HostelFeeListService.getAllHostelFeeLists(req.query);
        res.status(200).json({ status: 'success', data: result });
    } catch (error) { next(error); }
};

export const updateHostelFeeList = async (req, res, next) => {
    try {
        if (Object.keys(req.body).length === 0) return next(new AppError('No data for update.', 400));
        const updatedHostelFeeList = await HostelFeeListService.updateHostelFeeList(req.params.id, req.body);
        res.status(200).json({ status: 'success', message: 'Hostel Fee List entry updated.', data: { hostelFeeList: updatedHostelFeeList } });
    } catch (error) { next(error); }
};

export const deleteHostelFeeList = async (req, res, next) => {
    try {
        const result = await HostelFeeListService.deleteHostelFeeList(req.params.id);
        res.status(200).json({ status: 'success', message: result.message }); // 200 or 204 depending on preference
    } catch (error) { next(error); }
};

/**
 * Handles the request to retrieve hostel fee lists relevant to the requesting student.
 * Assumes req.user contains the authenticated student's ID and type.
 */
export const getStudentHostelFees = async (req, res, next) => {
    try {
        // Ensure the requesting user is a student
        if (req.user.type !== 'student') {
            throw new AppError('Not authorized to view student-specific hostel fees.', 403);
        }
        
        const studentId = req.user.id; // Get student ID from authenticated user object
        const result = await HostelFeeListService.getStudentHostelFees(studentId, req.query);
        res.status(200).json({ status: 'success', data: result });
    } catch (error) { next(error); }
};