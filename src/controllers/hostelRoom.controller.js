
import * as HostelRoomService from '../services/hostelRoom.service.js';
import AppError from '../utils/AppError.js';

export const createHostelRoom = async (req, res, next) => {
    try {
        const newRoom = await HostelRoomService.createHostelRoom(req.params.hostelId, req.body);
        res.status(201).json({ status: 'success', message: 'Hostel room created.', data: { room: newRoom } });
    } catch (error) { next(error); }
};
export const getHostelRoomById = async (req, res, next) => {
    try {
        const room = await HostelRoomService.getHostelRoomById(req.params.hostelId, req.params.roomId);
        res.status(200).json({ status: 'success', data: { room } });
    } catch (error) { next(error); }
};
export const getAllHostelRooms = async (req, res, next) => {
    try {
        const result = await HostelRoomService.getAllHostelRooms(req.params.hostelId, req.query);
        res.status(200).json({ status: 'success', data: result });
    } catch (error) { next(error); }
};
export const updateHostelRoom = async (req, res, next) => {
    try {
        if (Object.keys(req.body).length === 0) return next(new AppError('No data for update.', 400));
        const updatedRoom = await HostelRoomService.updateHostelRoom(req.params.hostelId, req.params.roomId, req.body);
        res.status(200).json({ status: 'success', message: 'Hostel room updated.', data: { room: updatedRoom } });
    } catch (error) { next(error); }
};
export const deleteHostelRoom = async (req, res, next) => {
    try {
        await HostelRoomService.deleteHostelRoom(req.params.hostelId, req.params.roomId);
        res.status(204).json({ status: 'success', data: null });
    } catch (error) { next(error); }
};