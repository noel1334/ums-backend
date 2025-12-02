// src/routes/notification.routes.js

import { Router } from 'express';
import * as NotificationController from '../controllers/notification.controller.js';
import { authenticateToken, authorizeAdmin, authorize } from '../middlewares/auth.middleware.js';

const router = Router();

// =========================================================================
//  User-Specific Notification Routes (Accessible by recipients and Admins)
// =========================================================================

/**
 * @route GET /api/v1/notifications/me
 * @desc Fetch notifications for the authenticated user (student, lecturer, ICT staff, admin).
 * @access Private (Any authenticated user)
 */
router.get(
    '/me', // Changed from '/my-notifications' to '/me'
    authenticateToken,
    authorize(['student', 'lecturer', 'ictstaff', 'admin']),
    NotificationController.getMyNotifications
);

/**
 * @route PATCH /api/v1/notifications/me/mark-all-read
 * @desc Mark all notifications for the authenticated user as read.
 * @access Private (Any authenticated user)
 */
router.patch(
    '/me/mark-all-read', // Changed from '/my-notifications/mark-all-read' to '/me/mark-all-read'
    authenticateToken,
    authorize(['student', 'lecturer', 'ictstaff', 'admin']),
    NotificationController.markAllMyNotificationsAsRead
);

/**
 * @route PATCH /api/v1/notifications/:id/read
 * @desc Mark a specific notification as read/unread for the authenticated user or an Admin.
 * @access Private (Recipient or Admin)
 */
router.patch(
    '/:id/read', // Changed from '/:notificationId/read-status' to '/:id/read'
    authenticateToken,
    authorize(['student', 'lecturer', 'ictstaff', 'admin']), // Service does specific recipient/admin check
    NotificationController.updateNotificationReadStatus
);

// =========================================================================
//  Admin-Only Notification Management Routes
// =========================================================================

/**
 * @route POST /api/v1/notifications/
 * @desc Admin creates a notification to a specific recipient.
 * @access Private (Admin)
 */
router.post(
    '/',
    authenticateToken,
    authorizeAdmin,
    NotificationController.createNotification
);

/**
 * @route GET /api/v1/notifications/all
 * @desc Admin gets a paginated list of all notifications with filters.
 * @access Private (Admin)
 */
router.get(
    '/all',
    authenticateToken,
    authorizeAdmin,
    NotificationController.getAllNotificationsAdmin
);

/**
 * @route DELETE /api/v1/notifications/:notificationId
 * @desc Admin deletes a specific notification.
 * @access Private (Admin)
 */
router.delete(
    '/:notificationId',
    authenticateToken,
    authorizeAdmin,
    NotificationController.deleteNotification
);

/**
 * @route POST /api/v1/notifications/payment-reminder
 * @desc Admin triggers payment reminder notifications for students with pending exam fees.
 * @access Private (Admin)
 */
router.post(
    '/payment-reminder',
    authenticateToken,
    authorizeAdmin,
    NotificationController.triggerPaymentReminder // NEW Controller function
);

export default router;