// src/services/notification.service.js
import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';

const notificationPublicSelection = {
    id: true,
    recipientType: true,
    recipientId: true,
    message: true,
    isRead: true,
    createdAt: true,
    // Include student or lecturer if they are populated
    Student: { select: { id: true, name: true, regNo: true } },
    Lecturer: { select: { id: true, name: true, staffId: true } }
};

// Function to create a notification (callable by Admin or system processes)
export const createNotification = async (notificationData) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const { recipientType, recipientId, message, studentId, lecturerId } = notificationData;

        if (!recipientType || !recipientId || !message) {
            throw new AppError('Recipient type, recipient ID, and message are required.', 400);
        }
        const pRecipientId = parseInt(recipientId, 10);
        if (isNaN(pRecipientId)) throw new AppError('Invalid Recipient ID.', 400);

        // Validate recipient exists based on type (optional but good)
        if (recipientType === 'STUDENT') {
            const student = await prisma.student.findUnique({ where: { id: pRecipientId } });
            if (!student) throw new AppError(`Student recipient with ID ${pRecipientId} not found.`, 404);
        } else if (recipientType === 'LECTURER') {
            const lecturer = await prisma.lecturer.findUnique({ where: { id: pRecipientId } });
            if (!lecturer) throw new AppError(`Lecturer recipient with ID ${pRecipientId} not found.`, 404);
        } else if (recipientType === 'ADMIN') {
            // Could target specific admin if you have multiple, or use a general admin group ID
        } // Add other types if needed

        const dataToCreate = {
            recipientType,
            recipientId: pRecipientId,
            message,
            isRead: false, // Default to unread
        };

        // Handle optional direct relations if provided and match recipientType/Id
        if (studentId && recipientType === 'STUDENT' && parseInt(studentId, 10) === pRecipientId) {
            dataToCreate.studentId = parseInt(studentId, 10);
        }
        if (lecturerId && recipientType === 'LECTURER' && parseInt(lecturerId, 10) === pRecipientId) {
            dataToCreate.lecturerId = parseInt(lecturerId, 10);
        }


        const newNotification = await prisma.notification.create({
            data: dataToCreate,
            select: notificationPublicSelection
        });
        return newNotification;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error creating notification:", error.message, error.stack);
        throw new AppError('Could not create notification.', 500);
    }
};

// Get notifications for the currently authenticated user
export const getMyNotifications = async (requestingUser, query) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const { isRead, page = 1, limit = 10 } = query;

        const where = {
            recipientId: requestingUser.id,
            // Determine recipientType based on requestingUser.type
            recipientType: requestingUser.type.toUpperCase() // Assumes types like 'STUDENT', 'LECTURER'
        };

        if (isRead !== undefined) {
            where.isRead = isRead === 'true';
        }

        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;

        const notifications = await prisma.notification.findMany({
            where,
            select: notificationPublicSelection,
            orderBy: { createdAt: 'desc' },
            skip,
            take: limitNum
        });
        const totalNotifications = await prisma.notification.count({ where });

        return {
            notifications,
            totalPages: Math.ceil(totalNotifications / limitNum),
            currentPage: pageNum,
            totalNotifications,
            unreadCount: await prisma.notification.count({ where: { ...where, isRead: false } })
        };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching my notifications:", error.message, error.stack);
        throw new AppError('Could not retrieve your notifications.', 500);
    }
};

// Admin: Get all notifications with filtering
export const getAllNotificationsAdmin = async (query) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const { recipientType, recipientId, isRead, page = 1, limit = 10 } = query;
        const where = {};

        if (recipientType) where.recipientType = recipientType.toUpperCase();
        if (recipientId) where.recipientId = parseInt(recipientId, 10);
        if (isRead !== undefined) where.isRead = isRead === 'true';

        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;

        const notifications = await prisma.notification.findMany({
            where, select: notificationPublicSelection, orderBy: { createdAt: 'desc' }, skip, take: limitNum
        });
        const totalNotifications = await prisma.notification.count({ where });
        return { notifications, totalPages: Math.ceil(totalNotifications / limitNum), currentPage: pageNum, totalNotifications };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching all notifications (admin):", error.message, error.stack);
        throw new AppError('Could not retrieve notifications list.', 500);
    }
};


// Mark a notification as read/unread (by recipient or admin)
export const updateNotificationReadStatus = async (notificationId, isRead, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const pNotificationId = parseInt(notificationId, 10);
        if (isNaN(pNotificationId)) throw new AppError('Invalid notification ID.', 400);
        if (typeof isRead !== 'boolean') throw new AppError('isRead must be true or false.', 400);

        const notification = await prisma.notification.findUnique({ where: { id: pNotificationId } });
        if (!notification) throw new AppError('Notification not found.', 404);

        // Authorization: Recipient or Admin
        if (requestingUser.type !== 'admin' &&
            !(notification.recipientId === requestingUser.id && notification.recipientType === requestingUser.type.toUpperCase())) {
            throw new AppError('You are not authorized to update this notification.', 403);
        }

        const updatedNotification = await prisma.notification.update({
            where: { id: pNotificationId },
            data: { isRead: isRead },
            select: notificationPublicSelection
        });
        return updatedNotification;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error updating notification read status:", error.message, error.stack);
        throw new AppError('Could not update notification status.', 500);
    }
};

// Mark ALL of a user's notifications as read
export const markAllMyNotificationsAsRead = async (requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);

        await prisma.notification.updateMany({
            where: {
                recipientId: requestingUser.id,
                recipientType: requestingUser.type.toUpperCase(),
                isRead: false
            },
            data: { isRead: true }
        });
        return { message: 'All your unread notifications have been marked as read.' };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error marking all notifications as read:", error.message, error.stack);
        throw new AppError('Could not mark notifications as read.', 500);
    }
}

// Delete a notification (Admin only for now)
export const deleteNotification = async (notificationId) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const pNotificationId = parseInt(notificationId, 10);
        if (isNaN(pNotificationId)) throw new AppError('Invalid notification ID.', 400);

        const notification = await prisma.notification.findUnique({ where: { id: pNotificationId } });
        if (!notification) throw new AppError('Notification not found for deletion.', 404);

        await prisma.notification.delete({ where: { id: pNotificationId } });
        return { message: 'Notification deleted successfully.' };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error deleting notification:", error.message, error.stack);
        throw new AppError('Could not delete notification.', 500);
    }
};