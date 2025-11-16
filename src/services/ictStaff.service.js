// src/services/ictStaff.service.js
import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import { hashPassword } from '../utils/password.utils.js';
import config from '../config/index.js'; // For ICTSTAFF_DEFAULT_PASSWORD

const ictStaffPublicFields = {
    id: true,
    staffId: true,
    name: true,
    email: true,
    phone: true,
    isActive: true,
    profileImg: true,
    // Permission flags (admins and potentially ICT staff themselves should see these)
    canManageCourses: true,
    canManageCourseRegistration: true,
    canManageScores: true,
    canManageResults: true,
    canViewAnalytics: true,
    canManageExams: true,
    createdAt: true,
    updatedAt: true,
};

// Fields an ICT staff member can edit on their own profile
const ictStaffSelfEditableFields = ['name', 'phone', 'password', 'profileImg'];
// Fields an Admin can edit on any ICT staff profile
const adminEditableICTStaffFields = [
    'name', 'email', 'phone', 'isActive', 'password', 'profileImg',
    'canManageCourses', 'canManageCourseRegistration', 'canManageScores',
    'canManageResults', 'canViewAnalytics', 'canManageExams'
];



const parseBoolean = (value) => {
    if (value === true || value === 'true') {
        return true;
    }
    // For all other cases (false, 'false', null, undefined, 0, etc.), return false.
    return false;
};

// --- CREATE FUNCTION ---
export const createICTStaff = async (ictStaffData) => {
    try {
        if (!prisma) { throw new AppError('Prisma client is not available.', 500); }
        const { email, name, phone, password: providedPassword, isActive, profileImg, canManageCourses, canManageCourseRegistration, canManageScores, canManageResults, canViewAnalytics, canManageExams } = ictStaffData;
        if (!email || !name) { throw new AppError('Email and Name are required.', 400); }
        const trimmedEmail = String(email).trim();
        const trimmedName = String(name).trim();
        const trimmedPhone = phone ? String(phone).trim() : null;
        
        const existingByEmail = await prisma.iCTStaff.findUnique({ where: { email: trimmedEmail } });
        if (existingByEmail) { throw new AppError(`An ICT Staff with the email '${trimmedEmail}' already exists.`, 409); }
        if (trimmedPhone) { const existingByPhone = await prisma.iCTStaff.findFirst({ where: { phone: trimmedPhone } }); if (existingByPhone) { throw new AppError(`An ICT Staff with the phone number '${trimmedPhone}' already exists.`, 409); } }

        let passwordToHash = providedPassword && String(providedPassword).trim() !== '' ? String(providedPassword).trim() : config.ictStaffDefaultPassword;
        if (!passwordToHash) { throw new AppError('Password is required, and no default password is configured.', 400); }
        const hashedPassword = await hashPassword(passwordToHash);

        const newStaffWithFinalStaffId = await prisma.$transaction(async (tx) => {
            const createdStaff = await tx.iCTStaff.create({
                data: {
                    email: trimmedEmail,
                    name: trimmedName,
                    phone: trimmedPhone,
                    password: hashedPassword,
                    profileImg: profileImg ? String(profileImg).trim() : null,
                    isActive: isActive !== undefined ? parseBoolean(isActive) : true,
                    canManageCourses: parseBoolean(canManageCourses),
                    canManageCourseRegistration: parseBoolean(canManageCourseRegistration),
                    canManageScores: parseBoolean(canManageScores),
                    canManageResults: parseBoolean(canManageResults),
                    canViewAnalytics: parseBoolean(canViewAnalytics),
                    canManageExams: parseBoolean(canManageExams),
                },
                select: { id: true, createdAt: true }
            });
            const yearOfCreation = new Date(createdStaff.createdAt).getFullYear();
            const sequencePart = createdStaff.id.toString().padStart(3, '0');
            const finalStaffId = `ICT/${yearOfCreation}/${sequencePart}`;
            const finalUpdatedStaff = await tx.iCTStaff.update({ where: { id: createdStaff.id }, data: { staffId: finalStaffId }, select: ictStaffPublicFields });
            return finalUpdatedStaff;
        });
        return newStaffWithFinalStaffId;
    } catch (error) {
        if (error instanceof AppError) { throw error; }
        throw new AppError('Could not create ICT Staff account.', 500);
    }
};

export const getICTStaffById = async (id) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const staffIdNum = parseInt(id, 10);
        if (isNaN(staffIdNum)) throw new AppError('Invalid ICT Staff ID format. It must be a number.', 400);

        const staff = await prisma.iCTStaff.findUnique({
            where: { id: staffIdNum },
            select: ictStaffPublicFields // Includes permission flags
        });

        if (!staff) throw new AppError('ICT Staff not found.', 404);
        return staff;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error(`[ICTSTAFF_SERVICE_ERROR] Error fetching ICT Staff by ID ${id}:`, error.message, error.stack);
        throw new AppError('Could not retrieve ICT Staff information.', 500);
    }
};

export const getAllICTStaff = async (query) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);

        const {
            name,
            email,
            staffId,
            isActive,
            page: queryPage = "1", // Default to string "1"
            limit: queryLimit = "10" // Default to string "10"
        } = query;

        const where = {};

        // For MySQL, case-insensitivity is often handled by column collation.
        // Using 'contains' without 'mode: "insensitive"' will use the DB's default.
        if (name && String(name).trim()) where.name = { contains: String(name).trim() };
        if (email && String(email).trim()) where.email = { contains: String(email).trim() };
        if (staffId && String(staffId).trim()) where.staffId = { contains: String(staffId).trim() };

        if (isActive !== undefined && isActive !== "") { // Check for presence, not just truthiness
            where.isActive = isActive === 'true';
        }

        let pageNum = parseInt(queryPage, 10);
        let limitNum = parseInt(queryLimit, 10);

        if (isNaN(pageNum) || pageNum < 1) {
            console.warn(`[getAllICTStaff] Invalid page query '${queryPage}', defaulting to 1.`);
            pageNum = 1;
        }
        if (isNaN(limitNum) || limitNum < 1) {
            console.warn(`[getAllICTStaff] Invalid limit query '${queryLimit}', defaulting to 10.`);
            limitNum = 10;
        }

        const skip = (pageNum - 1) * limitNum;

        console.log("[getAllICTStaff] Executing query with where:", JSON.stringify(where), `skip: ${skip}, take: ${limitNum}`);

        const staffList = await prisma.iCTStaff.findMany({
            where,
            select: ictStaffPublicFields,
            orderBy: { name: 'asc' },
            skip,
            take: limitNum,
        });

        const totalStaff = await prisma.iCTStaff.count({ where });

        return {
            staff: staffList,
            totalPages: Math.ceil(totalStaff / limitNum),
            currentPage: pageNum,
            totalStaff
        };
    } catch (error) {
        // Log the actual Prisma error or any other error
        console.error("[ICTSTAFF_SERVICE_ERROR] Critical Error in getAllICTStaff:", error);
        if (error instanceof AppError) throw error; // Re-throw if it's already an AppError
        // For Prisma validation errors or other unexpected errors, send a generic 500
        throw new AppError('Could not retrieve ICT Staff list due to a server issue.', 500);
    }
};

export const updateICTStaff = async (id, updateData, requestingUser) => {
    try {
        if (!prisma) { throw new AppError('Prisma client is not available.', 500); }
        const staffIdToUpdate = parseInt(id, 10);
        if (isNaN(staffIdToUpdate)) { throw new AppError('Invalid ICT Staff ID format.', 400); }

        const staffToUpdate = await prisma.iCTStaff.findUnique({ where: { id: staffIdToUpdate } });
        if (!staffToUpdate) { throw new AppError('ICT Staff not found for update.', 404); }

        const dataForDb = {};

        if (requestingUser.type === 'admin') {
            for (const key of adminEditableICTStaffFields) {
                if (updateData.hasOwnProperty(key)) {
                    const value = updateData[key];

                    if (key === 'email') {
                        if (value && String(value).trim() !== staffToUpdate.email) {
                            const trimmedEmail = String(value).trim();
                            const existing = await prisma.iCTStaff.findFirst({ where: { email: trimmedEmail, id: { not: staffIdToUpdate } } });
                            if (existing) throw new AppError('Email already in use.', 409);
                            dataForDb.email = trimmedEmail;
                        }
                    } else if (key === 'phone') {
                        const phoneVal = (value === '' || value === null) ? null : String(value).trim();
                        if (phoneVal && phoneVal !== staffToUpdate.phone) {
                            const existing = await prisma.iCTStaff.findFirst({ where: { phone: phoneVal, id: { not: staffIdToUpdate } } });
                            if (existing) throw new AppError('Phone number already in use.', 409);
                        }
                        dataForDb.phone = phoneVal;
                    } else if (key === 'password' && value) {
                        dataForDb.password = await hashPassword(String(value).trim());
                    } else if (key === 'isActive' || key.startsWith('canManage') || key.startsWith('canView')) {
                        dataForDb[key] = parseBoolean(value);
                    } else if (key === 'name' || key === 'profileImg') {
                        dataForDb[key] = (value === '' || value === null) ? null : String(value).trim();
                    }
                }
            }
        } else if (requestingUser.type === 'ictstaff' && requestingUser.id === staffIdToUpdate) {
            for (const key of Object.keys(updateData)) {
                if (ictStaffSelfEditableFields.includes(key)) {
                    const value = updateData[key];
                    if (key === 'password' && value) {
                        dataForDb.password = await hashPassword(String(value).trim());
                    } else if (key === 'phone') {
                        const phoneVal = (value === '' || value === null) ? null : String(value).trim();
                        if (phoneVal && phoneVal !== staffToUpdate.phone) {
                           const existing = await prisma.iCTStaff.findFirst({ where: { phone: phoneVal, id: { not: staffIdToUpdate } } });
                           if (existing) throw new AppError('This phone number is already in use.', 409);
                        }
                        dataForDb.phone = phoneVal;
                    } else if (key === 'name' || key === 'profileImg') {
                        dataForDb[key] = (value === '' || value === null) ? null : String(value).trim();
                    }
                }
            }
        } else {
            throw new AppError('You are not authorized to update this ICT Staff profile.', 403);
        }

        if (Object.keys(dataForDb).length === 0) {
            return staffToUpdate;
        }

        const updatedStaff = await prisma.iCTStaff.update({
            where: { id: staffIdToUpdate },
            data: dataForDb,
            select: ictStaffPublicFields
        });
        return updatedStaff;
    } catch (error) {
        if (error instanceof AppError) { throw error; }
        console.error(`[ICTSTAFF_SERVICE_ERROR] Error updating ICT Staff ID ${id}:`, error.message, error.stack);
        throw new AppError('Could not update ICT Staff profile.', 500);
    }
};


export const deleteICTStaff = async (id) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const staffIdNum = parseInt(id, 10);
        if (isNaN(staffIdNum)) throw new AppError('Invalid ICT Staff ID format.', 400);

        const staff = await prisma.iCTStaff.findUnique({ where: { id: staffIdNum } });
        if (!staff) throw new AppError('ICT Staff not found for deletion.', 404);

        // Check for dependencies if ICTStaff is linked to other models with Restrict rules
        // e.g., if ICTStaff authored Questions or created Exams and those have ON DELETE RESTRICT
        const authoredQuestionsCount = await prisma.question.count({ where: { addedByICTStaffId: staffIdNum } });
        if (authoredQuestionsCount > 0) {
            throw new AppError(`Cannot delete ICT Staff. They have authored ${authoredQuestionsCount} questions. Reassign or delete questions first.`, 400);
        }
        const createdExamsCount = await prisma.exam.count({ where: { createdByICTStaffId: staffIdNum } });
        if (createdExamsCount > 0) {
            throw new AppError(`Cannot delete ICT Staff. They have created ${createdExamsCount} exams. Reassign or delete exams first.`, 400);
        }

        await prisma.iCTStaff.delete({ where: { id: staffIdNum } });
        return { message: `ICT Staff '${staff.name}' (ID: ${id}) deleted successfully.` };
    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2003') { // Foreign key constraint violation
            throw new AppError('Cannot delete ICT Staff. They are still referenced by other records in the system.', 400);
        }
        console.error(`[ICTSTAFF_SERVICE_ERROR] Error deleting ICT Staff ${id}:`, error.message, error.stack);
        throw new AppError('Could not delete ICT Staff account.', 500);
    }
};