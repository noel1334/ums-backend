// src/controllers/notification.controller.js

import * as NotificationService from '../services/notification.service.js';
import AppError from '../utils/AppError.js';

export const createNotification = async (req, res, next) => {
    try {
        // Services returns dynamic output object { count, message, notification }
        const result = await NotificationService.createNotification(req.body);
        
        res.status(201).json({
            status: 'success',
            message: result.message || 'Notification processed successfully.',
            data: result,
        });
    } catch (error) {
        next(error);
    }
};

// ... (Rest of your controller remains identical) ...
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
        const { id } = req.params; 
        const { isRead } = req.body;

        if (typeof isRead !== 'boolean') {
            return next(new AppError('isRead field must be a boolean.', 400));
        }
        
        const updatedNotification = await NotificationService.updateNotificationReadStatus(id, isRead, req.user);
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

export const triggerPaymentReminder = async (req, res, next) => {
    try {
        const { count, details } = await NotificationService.triggerPaymentReminderNotifications(req.body);
        res.status(200).json({
            status: 'success',
            message: `Triggered ${count} payment reminders.`,
            data: { count, details },
        });
    } catch (error) {
        next(error);
    }
};