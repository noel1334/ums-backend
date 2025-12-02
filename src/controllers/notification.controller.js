// src/controllers/notification.controller.js

import * as NotificationService from '../services/notification.service.js';
import AppError from '../utils/AppError.js';

// Existing: Admin creates a notification
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

// Existing: Get notifications for the authenticated user (now '/me')
export const getMyNotifications = async (req, res, next) => {
    try {
        const result = await NotificationService.getMyNotifications(req.user, req.query);
        res.status(200).json({ status: 'success', data: result });
    } catch (error) {
        next(error);
    }
};

// Existing: Admin gets all notifications
export const getAllNotificationsAdmin = async (req, res, next) => {
    try {
        const result = await NotificationService.getAllNotificationsAdmin(req.query);
        res.status(200).json({ status: 'success', data: result });
    } catch (error) {
        next(error);
    }
};

// Existing: Mark a specific notification as read/unread (now PATCH /:id/read)
export const updateNotificationReadStatus = async (req, res, next) => {
    try {
        // Note: The route param is now `id`, previously `notificationId`
        const { id } = req.params; 
        const { isRead } = req.body; // Expect { "isRead": true } or { "isRead": false }

        if (typeof isRead !== 'boolean') {
            return next(new AppError('isRead field must be a boolean.', 400));
        }
        
        // Pass the updated id to the service
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

// Existing: Mark all notifications for the authenticated user as read (now PATCH /me/mark-all-read)
export const markAllMyNotificationsAsRead = async (req, res, next) => {
    try {
        const result = await NotificationService.markAllMyNotificationsAsRead(req.user);
        res.status(200).json({ status: 'success', message: result.message });
    } catch (error) {
        next(error);
    }
};

// Existing: Admin deletes a notification
export const deleteNotification = async (req, res, next) => {
    try {
        const { notificationId } = req.params;
        await NotificationService.deleteNotification(notificationId);
        res.status(204).json({ status: 'success', data: null });
    } catch (error) {
        next(error);
    }
};

// NEW: Admin triggers payment reminder notifications
export const triggerPaymentReminder = async (req, res, next) => {
    try {
        // Optional: Admin could provide filters (e.g., specific examId, courseId) in req.body
        // For simplicity, we'll implement a general reminder for all pending payments first.
        const { count, details } = await NotificationService.triggerPaymentReminderNotifications(req.body); // Pass req.body for potential future filters
        res.status(200).json({
            status: 'success',
            message: `Triggered ${count} payment reminders.`,
            data: { count, details },
        });
    } catch (error) {
        next(error);
    }
};