import { Router } from 'express';
import * as NotificationController from '../controllers/notification.controller.js';
import { authenticateToken, authorizeAdmin, authorize } from '../middlewares/auth.middleware.js';

const router = Router();

// Student/Lecturer gets their own notifications
router.get(
    '/my-notifications',
    authenticateToken,
    authorize(['student', 'lecturer', 'ictstaff', 'admin']), // Any authenticated user can get their own
    NotificationController.getMyNotifications
);

// Student/Lecturer marks all their notifications as read
router.patch(
    '/my-notifications/mark-all-read',
    authenticateToken,
    authorize(['student', 'lecturer', 'ictstaff', 'admin']),
    NotificationController.markAllMyNotificationsAsRead
);


// Student/Lecturer/Admin marks a specific notification as read/unread
router.patch(
    '/:notificationId/read-status',
    authenticateToken,
    authorize(['student', 'lecturer', 'ictstaff', 'admin']), // Service does specific recipient check
    NotificationController.updateNotificationReadStatus
);


// --- Admin Only Routes ---
// Admin creates a notification
router.post(
    '/',
    authenticateToken,
    authorizeAdmin,
    NotificationController.createNotification
);

// Admin gets all notifications (with filters)
router.get(
    '/all', // Differentiate from /my-notifications
    authenticateToken,
    authorizeAdmin,
    NotificationController.getAllNotificationsAdmin
);

// Admin deletes a notification
router.delete(
    '/:notificationId',
    authenticateToken,
    authorizeAdmin,
    NotificationController.deleteNotification
);


export default router;