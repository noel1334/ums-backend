// src/services/notification.service.js

import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import { PaymentStatus } from '../generated/prisma/index.js';

const notificationPublicSelection = {
    id: true,
    recipientType: true,
    recipientId: true,
    message: true,
    isRead: true,
    createdAt: true,
    Student: { select: { id: true, name: true, regNo: true } },
    Lecturer: { select: { id: true, name: true, staffId: true } }
};

/**
 * Handle notification dispatches (Supports Single, Explicit Batch, and Academic Bulk dispatches)
 */
export const createNotification = async (notificationData) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const { recipientType, recipientId, recipientIds, filters, message } = notificationData;

        if (!recipientType || !message) {
            throw new AppError('Recipient type and message are required.', 400);
        }

        const rType = recipientType.toUpperCase();

        // =========================================================================
        //  CASE 1: Academic Bulk Dispatch (Filtered by Level, Program, Dept, DegreeType)
        // =========================================================================
        if (rType === 'STUDENT' && filters) {
            const { levelId, programId, departmentId, degreeType } = filters;

            const whereClause = { isActive: true };
            if (levelId) whereClause.currentLevelId = parseInt(levelId, 10);
            if (programId) whereClause.programId = parseInt(programId, 10);
            if (departmentId) whereClause.departmentId = parseInt(departmentId, 10);
            if (degreeType) {
                whereClause.program = { degreeType }; // Filter nested program relation by DegreeType enum
            }

            // Find all matching students
            const targetedStudents = await prisma.student.findMany({
                where: whereClause,
                select: { id: true }
            });

            if (targetedStudents.length === 0) {
                return { count: 0, message: 'No students matched the selected filters.' };
            }

            // Map payload
            const notificationsPayload = targetedStudents.map(student => ({
                recipientType: 'STUDENT',
                recipientId: student.id,
                studentId: student.id,
                message,
                isRead: false
            }));

            // Execute high-performance bulk creation
            const result = await prisma.notification.createMany({
                data: notificationsPayload
            });

            return { 
                count: result.count, 
                message: `Successfully sent ${result.count} targeted academic notifications.` 
            };
        }

        // =========================================================================
        //  CASE 2: Explicit Batch Dispatch (List of specified IDs)
        // =========================================================================
        if (Array.isArray(recipientIds) && recipientIds.length > 0) {
            const cleanIds = recipientIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));

            if (cleanIds.length === 0) {
                throw new AppError('Invalid recipient IDs provided for batch dispatch.', 400);
            }

            const notificationsPayload = cleanIds.map(id => {
                const record = {
                    recipientType: rType,
                    recipientId: id,
                    message,
                    isRead: false
                };
                if (rType === 'STUDENT') record.studentId = id;
                if (rType === 'LECTURER') record.lecturerId = id;
                return record;
            });

            const result = await prisma.notification.createMany({
                data: notificationsPayload
            });

            return { 
                count: result.count, 
                message: `Successfully sent ${result.count} batch notifications.` 
            };
        }

        // =========================================================================
        //  CASE 3: Standard Single Dispatch
        // =========================================================================
        if (!recipientId) {
            throw new AppError('A valid recipient ID or group target filter must be provided.', 400);
        }
        
        const pRecipientId = parseInt(recipientId, 10);
        if (isNaN(pRecipientId)) throw new AppError('Invalid Recipient ID.', 400);

        if (rType === 'STUDENT') {
            const student = await prisma.student.findUnique({ where: { id: pRecipientId } });
            if (!student) throw new AppError(`Student recipient with ID ${pRecipientId} not found.`, 404);
        } else if (rType === 'LECTURER') {
            const lecturer = await prisma.lecturer.findUnique({ where: { id: pRecipientId } });
            if (!lecturer) throw new AppError(`Lecturer recipient with ID ${pRecipientId} not found.`, 404);
        }

        const dataToCreate = {
            recipientType: rType,
            recipientId: pRecipientId,
            message,
            isRead: false,
        };

        if (rType === 'STUDENT') dataToCreate.studentId = pRecipientId;
        if (rType === 'LECTURER') dataToCreate.lecturerId = pRecipientId;

        const newNotification = await prisma.notification.create({
            data: dataToCreate,
            select: notificationPublicSelection
        });

        return { count: 1, notification: newNotification };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error dispatching notifications:", error.message);
        throw new AppError('Could not process notification dispatch.', 500);
    }
};

// ... (Rest of your service code: getMyNotifications, getAllNotificationsAdmin, etc., remains the same) ...

export const getMyNotifications = async (requestingUser, query) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const { isRead, page = 1, limit = 10 } = query;

        const where = {
            recipientId: requestingUser.id,
            recipientType: requestingUser.type.toUpperCase()
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
        console.error("Error fetching my notifications:", error.message);
        throw new AppError('Could not retrieve your notifications.', 500);
    }
};

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
        console.error("Error fetching all notifications (admin):", error.message);
        throw new AppError('Could not retrieve notifications list.', 500);
    }
};

export const updateNotificationReadStatus = async (notificationId, isRead, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const pNotificationId = parseInt(notificationId, 10);
        if (isNaN(pNotificationId)) throw new AppError('Invalid notification ID.', 400);
        if (typeof isRead !== 'boolean') throw new AppError('isRead must be true or false.', 400);

        const notification = await prisma.notification.findUnique({ where: { id: pNotificationId } });
        if (!notification) throw new AppError('Notification not found.', 404);

        if (requestingUser.type !== 'admin' && requestingUser.type !== 'ictstaff' &&
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
        console.error("Error updating notification read status:", error.message);
        throw new AppError('Could not update notification status.', 500);
    }
};

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
        console.error("Error marking all notifications as read:", error.message);
        throw new AppError('Could not mark notifications as read.', 500);
    }
};

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
        console.error("Error deleting notification:", error.message);
        throw new AppError('Could not delete notification.', 500);
    }
};

export const triggerPaymentReminderNotifications = async (filters = {}) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);

        const reminderWhereClause = {
            paymentStatus: PaymentStatus.PENDING,
        };

        const pendingPayments = await prisma.studentExamPayment.findMany({
            where: reminderWhereClause,
            include: {
                student: {
                    select: { id: true, name: true, regNo: true }
                },
                exam: {
                    select: { id: true, title: true, course: { select: { code: true } } }
                }
            }
        });

        if (pendingPayments.length === 0) {
            return { count: 0, details: [] };
        }

        const notificationsCreated = [];
        for (const payment of pendingPayments) {
            const message = `Reminder: Your payment of ₦${payment.amountExpected.toLocaleString()} for ${payment.exam.course.code} - ${payment.exam.title} is still pending. Please complete your payment to avoid issues.`;
            
            const newNotification = await prisma.notification.create({
                data: {
                    recipientType: 'STUDENT',
                    recipientId: payment.student.id,
                    studentId: payment.student.id,
                    message: message,
                    isRead: false,
                },
                select: { id: true, recipientId: true, message, createdAt: true }
            });
            notificationsCreated.push(newNotification);
        }

        return {
            count: notificationsCreated.length,
            details: notificationsCreated.map(n => ({ id: n.id, recipientId: n.recipientId, message: n.message })),
        };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error triggering payment reminder notifications:", error.message);
        throw new AppError('Could not trigger payment reminder notifications.', 500);
    }
};