// src/services/adminManagement.service.js

import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import { hashPassword } from '../utils/password.utils.js';

// Helper to sanitize admin data for responses
const sanitizeAdmin = (admin) => {
    if (!admin) return null;
    const { password, ...sanitized } = admin;
    return sanitized;
};

/**
 * Create a new Admin account.
 */
export const createAdmin = async (creatorId, data) => {
    try {
        const { email, password, name, phone, isPermittedToAddAdmin, location, bio, role, profileImg } = data;

        if (!email || !password) {
            throw new AppError('Email and password are required.', 400);
        }

        const trimmedEmail = String(email).trim();
        const trimmedName = name ? String(name).trim() : null;
        const trimmedPhone = phone ? String(phone).trim() : null;

        // Check for existing email
        const existingEmail = await prisma.admin.findUnique({ where: { email: trimmedEmail } });
        if (existingEmail) {
            throw new AppError('An administrator with this email already exists.', 400);
        }

        // Check for existing phone number if provided
        if (trimmedPhone) {
            const existingPhone = await prisma.admin.findUnique({ where: { phone: trimmedPhone } });
            if (existingPhone) {
                throw new AppError('An administrator with this phone number already exists.', 400);
            }
        }

        // Hash password using local utility
        const hashedPassword = await hashPassword(password);

        const newAdmin = await prisma.admin.create({
            data: {
                email: trimmedEmail,
                password: hashedPassword,
                name: trimmedName,
                phone: trimmedPhone,
                role: role || 'ADMIN',
                isPermittedToAddAdmin: isPermittedToAddAdmin ?? false,
                location: location || null,
                bio: bio || null,
                profileImg: profileImg || null,
            }
        });

        return sanitizeAdmin(newAdmin);
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error('[ADMIN_MANAGEMENT_SERVICE_ERROR] createAdmin:', error.message);
        throw new AppError('Could not complete administrative account creation.', 500);
    }
};

/**
 * Retrieve all Admin accounts.
 */
export const getAllAdmins = async () => {
    try {
        const admins = await prisma.admin.findMany({
            orderBy: { createdAt: 'desc' }
        });
        return admins.map(sanitizeAdmin);
    } catch (error) {
        console.error('[ADMIN_MANAGEMENT_SERVICE_ERROR] getAllAdmins:', error.message);
        throw new AppError('Could not retrieve administrators list.', 500);
    }
};

/**
 * Retrieve a single Admin by ID.
 */
export const getAdminById = async (id) => {
    try {
        const admin = await prisma.admin.findUnique({ where: { id } });
        if (!admin) {
            throw new AppError('Administrator account not found.', 404);
        }
        return sanitizeAdmin(admin);
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error('[ADMIN_MANAGEMENT_SERVICE_ERROR] getAdminById:', error.message);
        throw new AppError('Could not retrieve administrator account.', 500);
    }
};

/**
 * Update an existing Admin account's profile with security boundaries.
 */
export const updateAdmin = async (id, updateData, requestingUser) => {
    try {
        if (!requestingUser) {
            throw new AppError('User profile context is required for updates.', 401);
        }

        const existingAdmin = await prisma.admin.findUnique({ where: { id } });
        if (!existingAdmin) {
            throw new AppError('Administrator account not found.', 404);
        }

        const isSelfUpdate = requestingUser.id === id;

        let isSuperAdmin = false;
        if (!isSelfUpdate) {
            const actorRecord = await prisma.admin.findUnique({ where: { id: requestingUser.id } });
            isSuperAdmin = actorRecord?.isPermittedToAddAdmin || false;
        }

        const dataToUpdate = {};

        // Added 'bio' to the safe self-editable fields list
        const adminSelfEditableFields = ['name', 'phone', 'password', 'profileImg', 'location', 'bio'];

        if (isSelfUpdate) {
            for (const key of Object.keys(updateData)) {
                if (adminSelfEditableFields.includes(key)) {
                    const value = updateData[key];
                    if (key === 'password' && value) {
                        dataToUpdate.password = await hashPassword(String(value).trim());
                    } else if (key === 'phone') {
                        const phoneVal = (value === '' || value === null) ? null : String(value).trim();
                        if (phoneVal && phoneVal !== existingAdmin.phone) {
                            const phoneInUse = await prisma.admin.findUnique({ where: { phone: phoneVal } });
                            if (phoneInUse) {
                                throw new AppError('Phone number is already in use.', 400);
                            }
                        }
                        dataToUpdate.phone = phoneVal;
                    } else if (key === 'name' || key === 'profileImg' || key === 'location' || key === 'bio') {
                        dataToUpdate[key] = (value === '' || value === null) ? null : String(value).trim();
                    }
                }
            }
        } else if (isSuperAdmin) {
            if (updateData.name !== undefined) dataToUpdate.name = updateData.name;
            if (updateData.location !== undefined) dataToUpdate.location = updateData.location;
            if (updateData.bio !== undefined) dataToUpdate.bio = updateData.bio;
            if (updateData.role !== undefined) dataToUpdate.role = updateData.role;
            if (updateData.isPermittedToAddAdmin !== undefined) {
                dataToUpdate.isPermittedToAddAdmin = Boolean(updateData.isPermittedToAddAdmin);
            }
            if (updateData.profileImg !== undefined) dataToUpdate.profileImg = updateData.profileImg;

            if (updateData.email && updateData.email !== existingAdmin.email) {
                const emailInUse = await prisma.admin.findUnique({ where: { email: updateData.email } });
                if (emailInUse) {
                    throw new AppError('Email address is already in use.', 400);
                }
                dataToUpdate.email = updateData.email;
            }

            if (updateData.phone && updateData.phone !== existingAdmin.phone) {
                const phoneInUse = await prisma.admin.findUnique({ where: { phone: updateData.phone } });
                if (phoneInUse) {
                    throw new AppError('Phone number is already in use.', 400);
                }
                dataToUpdate.phone = updateData.phone;
            }

            if (updateData.password) {
                dataToUpdate.password = await hashPassword(updateData.password);
            }
        } else {
            throw new AppError('You are not authorized to update this administrator profile.', 403);
        }

        if (Object.keys(dataToUpdate).length === 0) {
            return sanitizeAdmin(existingAdmin);
        }

        const updatedAdmin = await prisma.admin.update({
            where: { id },
            data: dataToUpdate
        });

        return sanitizeAdmin(updatedAdmin);
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error('[ADMIN_MANAGEMENT_SERVICE_ERROR] updateAdmin:', error.message);
        throw new AppError('Could not complete administrator account update.', 500);
    }
};

/**
 * Delete an Admin account.
 */
export const deleteAdmin = async (targetId, actorId) => {
    try {
        if (targetId === actorId) {
            throw new AppError('Self-deletion of administrative accounts is not permitted.', 400);
        }

        const adminToDelete = await prisma.admin.findUnique({ where: { id: targetId } });
        if (!adminToDelete) {
            throw new AppError('Administrator account not found.', 404);
        }

        await prisma.admin.delete({ where: { id: targetId } });
        return { message: 'Administrator account successfully deleted.' };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error('[ADMIN_MANAGEMENT_SERVICE_ERROR] deleteAdmin:', error.message);
        throw new AppError('Could not complete administrator account deletion.', 500);
    }
};