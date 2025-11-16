// src/controllers/notification.controller.js
import * as NotificationService from '../services/notification.service.js';
import AppError from '../utils/AppError.js';

export const createNotification = async (req, res, next) => {
    try {
        // TODO: Input validation for req.body (recipientType, recipientId, message)
        const newNotification = await NotificationService.createNotification(req.body);
        res.status(201).json({
            status: 'success',
            message: 'Notification created successfully.',
            data: { notification: newNotification },
        });
    } catch (error) {
        next(error);
    }
};

export const getMyNotifications = async (req, res, next) => {
    try {
        const result = await NotificationService.getMyNotifications(req.user, req.query);
        res.status(200).json({ status: 'success', data: result });
    } catch (error) {
        next(error);
    }
};

export const getAllNotificationsAdmin = async (req, res, next) => {
    try {
        const result = await NotificationService.getAllNotificationsAdmin(req.query);
        res.status(200).json({ status: 'success', data: result });
    } catch (error) {
        next(error);
    }
};


export const updateNotificationReadStatus = async (req, res, next) => {
    try {
        const { notificationId } = req.params;
        const { isRead } = req.body; // Expect { "isRead": true } or { "isRead": false }
        if (typeof isRead !== 'boolean') {
            return next(new AppError('isRead field must be a boolean.', 400));
        }
        const updatedNotification = await NotificationService.updateNotificationReadStatus(notificationId, isRead, req.user);
        res.status(200).json({
            status: 'success',
            message: 'Notification status updated.',
            data: { notification: updatedNotification },
        });
    } catch (error) {
        next(error);
    }
};

export const markAllMyNotificationsAsRead = async (req, res, next) => {
    try {
        const result = await NotificationService.markAllMyNotificationsAsRead(req.user);
        res.status(200).json({ status: 'success', message: result.message });
    } catch (error) {
        next(error);
    }
};

export const deleteNotification = async (req, res, next) => {
    try {
        const { notificationId } = req.params;
        await NotificationService.deleteNotification(notificationId);
        res.status(204).json({ status: 'success', data: null });
    } catch (error) {
        next(error);
    }
};