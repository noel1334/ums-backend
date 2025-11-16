// src/controllers/venue.controller.js
import * as VenueService from '../services/venue.service.js';
import AppError from '../utils/AppError.js';

export const createVenue = async (req, res, next) => {
    try {
        if (!req.body.name) return next(new AppError('Venue name is required.', 400));
        const venue = await VenueService.createVenue(req.body);
        res.status(201).json({ status: 'success', message: 'Venue created.', data: { venue } });
    } catch (error) { next(error); }
};

export const getAllVenues = async (req, res, next) => {
    try {
        const result = await VenueService.getAllVenues(req.query);
        res.status(200).json({ status: 'success', data: result });
    } catch (error) { next(error); }
};

export const getVenueById = async (req, res, next) => {
    try {
        const venue = await VenueService.getVenueById(req.params.id);
        res.status(200).json({ status: 'success', data: { venue } });
    } catch (error) { next(error); }
};

export const updateVenue = async (req, res, next) => {
    try {
        if (Object.keys(req.body).length === 0) return next(new AppError('No data provided for update.', 400));
        const venue = await VenueService.updateVenue(req.params.id, req.body);
        res.status(200).json({ status: 'success', message: 'Venue updated.', data: { venue } });
    } catch (error) { next(error); }
};

export const deleteVenue = async (req, res, next) => {
    try {
        const result = await VenueService.deleteVenue(req.params.id);
        res.status(200).json({ status: 'success', message: result.message });
    } catch (error) { next(error); }
};