
import * as HostelService from '../services/hostel.service.js';
import AppError from '../utils/AppError.js';

export const createHostel = async (req, res, next) => {
    try {
        const newHostel = await HostelService.createHostel(req.body);
        res.status(201).json({ status: 'success', message: 'Hostel created.', data: { hostel: newHostel } });
    } catch (error) { next(error); }
};
export const getHostelById = async (req, res, next) => {
    try {
        const hostel = await HostelService.getHostelById(req.params.id);
        res.status(200).json({ status: 'success', data: { hostel } });
    } catch (error) { next(error); }
};
export const getAllHostels = async (req, res, next) => {
    try {
        const result = await HostelService.getAllHostels(req.query);
        res.status(200).json({ status: 'success', data: result });
    } catch (error) { next(error); }
};
export const updateHostel = async (req, res, next) => {
    try {
        if (Object.keys(req.body).length === 0) return next(new AppError('No data for update.', 400));
        const updatedHostel = await HostelService.updateHostel(req.params.id, req.body);
        res.status(200).json({ status: 'success', message: 'Hostel updated.', data: { hostel: updatedHostel } });
    } catch (error) { next(error); }
};
export const deleteHostel = async (req, res, next) => {
    try {
        await HostelService.deleteHostel(req.params.id);
        res.status(204).json({ status: 'success', data: null });
    } catch (error) { next(error); }
};

export const getHostelRoomsWithOccupancyController = async (req, res, next) => {
    try {
        const { id: hostelId } = req.params; // Hostel ID from URL params
        const { seasonId } = req.query;     // Season ID from query params

        if (!seasonId) {
            return next(new AppError('Season ID is required for fetching room occupancy.', 400));
        }

        const rooms = await HostelService.getHostelRoomsWithOccupancy(hostelId, seasonId);
        res.status(200).json({ status: 'success', data: { rooms } });
    } catch (error) {
        next(error);
    }
};
