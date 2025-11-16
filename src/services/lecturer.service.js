import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import { hashPassword } from '../utils/password.utils.js';
import { LecturerRole } from '../generated/prisma/index.js';
import config from '../config/index.js'; // For LECTURER_DEFAULT_PASSWORD

const lecturerPublicSelection = {
    id: true, staffId: true, title: true, name: true, email: true, phone: true,
    isActive: true, role: true, departmentId: true, profileImg: true,
    createdAt: true, updatedAt: true,
    department: { select: { id: true, name: true, faculty: { select: { id: true, name: true } } } }
};

const lecturerSelfEditableFields = ['title', 'name', 'phone', 'password', 'profileImg'];
const adminEditableFields = [
    'title', 'name', 'email', 'phone', 'isActive',
    'password', 'role', 'departmentId', 'profileImg'
];

export const createLecturer = async (lecturerData) => {
    console.log("[createLecturer Service] Called with data:", lecturerData);
    try {
        if (!prisma) {
            console.error("[createLecturer Service] Prisma client is not available.");
            throw new AppError('Prisma client is not available.', 500);
        }

        const {
            title, name, departmentId, email, phone, role,
            isActive, password: providedPassword, profileImg
        } = lecturerData;

        // --- Input Validation ---
        if (!name || !departmentId || !email) {
            throw new AppError('Name, Department ID, and Email are required fields.', 400);
        }
        const trimmedName = String(name).trim();
        const trimmedEmail = String(email).trim();
        const trimmedPhone = phone ? String(phone).trim() : null;
        const trimmedTitle = title ? String(title).trim() : null;
        

        const pDepartmentId = parseInt(String(departmentId), 10);
        if (isNaN(pDepartmentId)) {
            throw new AppError('Invalid Department ID format. It must be a number.', 400);
        }

        const pRoleString = role || LecturerRole.LECTURER;
        if (!Object.values(LecturerRole).includes(pRoleString)) {
            throw new AppError(`Invalid lecturer role: '${pRoleString}'.`, 400);
        }

        // --- Check Existence of Department ---
        const departmentExists = await prisma.department.findUnique({ where: { id: pDepartmentId } });
        if (!departmentExists) {
            throw new AppError(`Department with ID ${pDepartmentId} not found.`, 404);
        }

        // --- Uniqueness Checks (before transaction for early exit) ---
        const existingByEmail = await prisma.lecturer.findUnique({ where: { email: trimmedEmail } });
        if (existingByEmail) {
            throw new AppError(`A lecturer with the email '${trimmedEmail}' already exists.`, 409);
        }
        if (trimmedPhone) {
            const existingByPhone = await prisma.lecturer.findFirst({ where: { phone: trimmedPhone } });
            if (existingByPhone) {
                throw new AppError(`A lecturer with the phone number '${trimmedPhone}' already exists.`, 409);
            }
        }

        // --- Unique HOD/EXAMINER per department CHECK ---
        if (pRoleString === LecturerRole.HOD || pRoleString === LecturerRole.EXAMINER) {
            const existingSpecialRoleLecturer = await prisma.lecturer.findFirst({
                where: { departmentId: pDepartmentId, role: pRoleString, isActive: true }
            });
            if (existingSpecialRoleLecturer) {
                throw new AppError(`An active ${pRoleString} already exists for department ID ${pDepartmentId}.`, 409);
            }
        }

        // --- Password Handling ---
        let passwordToHash = providedPassword && String(providedPassword).trim() !== ''
            ? String(providedPassword).trim()
            : config.lecturerDefaultPassword; // Use LECTURER_DEFAULT_PASSWORD

        if (!passwordToHash) {
            throw new AppError('Password is required for Lecturer, and no default password (LECTURER_DEFAULT_PASSWORD) is configured in .env.', 400);
        }
        console.log(`[createLecturer DEBUG] Password to be hashed: "${passwordToHash}"`);
        const hashedPassword = await hashPassword(passwordToHash);

        console.log("[createLecturer DEBUG] Proceeding to transaction.");
        const newLecturerWithFinalStaffId = await prisma.$transaction(async (tx) => {
            console.log("[createLecturer DEBUG] Inside transaction - Step 1: Creating initial record.");
            const createdLecturer = await tx.lecturer.create({
                data: {
                    title: trimmedTitle,
                    name: trimmedName,
                    departmentId: pDepartmentId,
                    email: trimmedEmail,
                    phone: trimmedPhone,
                    role: pRoleString,
                    isActive: isActive === undefined ? true : Boolean(isActive),
                    password: hashedPassword,
                    profileImg: profileImg ? String(profileImg).trim() : null,
                    // staffId is NOT set here initially
                },
                select: { id: true, createdAt: true, departmentId: true } // Also select departmentId for staffId format
            });
            console.log("[createLecturer DEBUG] Step 1 complete. Created lecturer with temp ID:", createdLecturer.id);

            const yearOfCreation = new Date(createdLecturer.createdAt).getFullYear();
            // Using departmentId and the new record's ID for the sequence part
            const sequencePart = createdLecturer.id.toString().padStart(3, '0');
            const finalStaffId = `${yearOfCreation}/${createdLecturer.departmentId}/${sequencePart}`; // Format: YEAR/DEPT_ID/SEQUENCE
            console.log("[createLecturer DEBUG] Step 2: Generated finalStaffId:", finalStaffId);

            console.log("[createLecturer DEBUG] Step 3: Updating record with finalStaffId.");
            const finalUpdatedLecturer = await tx.lecturer.update({
                where: { id: createdLecturer.id },
                data: { staffId: finalStaffId },
                select: lecturerPublicSelection
            });
            console.log("[createLecturer DEBUG] Step 3 complete. Lecturer record updated.");
            return finalUpdatedLecturer;
        });

        console.log(`[LECTURER_CREATE] Lecturer '${newLecturerWithFinalStaffId.name}' (ID: ${newLecturerWithFinalStaffId.id}, StaffID: ${newLecturerWithFinalStaffId.staffId}) created successfully.`);
        return newLecturerWithFinalStaffId;

    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2002' && error.meta?.target) {
            const targetFields = error.meta.target;
            if (targetFields.includes('staffId')) {
                 console.error("[LECTURER_SERVICE_ERROR] Unique constraint on 'staffId'. This is unexpected with ID-based generation.", error);
                throw new AppError('Failed to assign a unique Staff ID due to a conflict.', 500);
            }
            if (targetFields.includes('email')) throw new AppError('Email conflict (P2002).', 409);
            if (targetFields.includes('phone')) throw new AppError('Phone conflict (P2002).', 409);
            throw new AppError(`A unique constraint failed: ${Array.isArray(targetFields) ? targetFields.join(', ') : targetFields}.`, 409);
        }
        console.error("[LECTURER_SERVICE_ERROR] Error in createLecturer:", error.message, error.stack);
        throw new AppError('Could not create lecturer due to an internal server error.', 500);
    }
};

export const getLecturerById = async (id) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const lecturerIdNum = parseInt(String(id), 10);
        if (isNaN(lecturerIdNum)) throw new AppError('Invalid Lecturer ID format.', 400);

        const lecturer = await prisma.lecturer.findUnique({
            where: { id: lecturerIdNum },
            select: lecturerPublicSelection
        });

        if (!lecturer) throw new AppError('Lecturer not found.', 404);
        return lecturer;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("[LECTURER_SERVICE_ERROR] GetLecturerById:", error.message, error.stack);
        throw new AppError('Could not retrieve lecturer.', 500);
    }
};

export const getAllLecturers = async (query, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const {
            departmentId: queryDeptId,
            role, isActive, name, staffId, title,
            page: queryPage = "1", limit: queryLimit = "10"
        } = query;
        const where = {};

        if (requestingUser.type === 'admin') {
            if (queryDeptId && String(queryDeptId).trim() !== "") {
                const pQueryDeptId = parseInt(String(queryDeptId), 10);
                if (!isNaN(pQueryDeptId)) where.departmentId = pQueryDeptId;
            }
        } else if (requestingUser.type === 'lecturer' && requestingUser.role === LecturerRole.HOD) {
            if (!requestingUser.departmentId) throw new AppError('HOD department info missing.', 500);
            where.departmentId = requestingUser.departmentId;
            // ... (optional warning if HOD tries to query other dept)
        } else {
            throw new AppError("You are not authorized to view this list of lecturers.", 403);
        }

        if (role && String(role).trim() !== "" && Object.values(LecturerRole).includes(String(role).trim())) {
            where.role = String(role).trim();
        }
        if (isActive !== undefined && isActive !== "") where.isActive = isActive === 'true';
        if (name && String(name).trim()) where.name = { contains: String(name).trim() };
        if (staffId && String(staffId).trim()) where.staffId = { contains: String(staffId).trim() };
        if (title && String(title).trim()) where.title = { contains: String(title).trim() };

        let pageNum = parseInt(queryPage, 10);
        let limitNum = parseInt(queryLimit, 10);
        if (isNaN(pageNum) || pageNum < 1) pageNum = 1;
        if (isNaN(limitNum) || limitNum < 1) limitNum = 10;
        const skip = (pageNum - 1) * limitNum;

        const lecturers = await prisma.lecturer.findMany({
            where, select: lecturerPublicSelection, orderBy: { name: 'asc' }, skip, take: limitNum,
        });
        const totalLecturers = await prisma.lecturer.count({ where });
        return { lecturers, totalPages: Math.ceil(totalLecturers / limitNum), currentPage: pageNum, totalLecturers };
    } catch (error) {
        console.error("[LECTURER_SERVICE_ERROR] GetAllLecturers:", error.message, error.stack, error.code ? `Prisma Code: ${error.code}`: '');
        if (error instanceof AppError) throw error;
        throw new AppError('Could not retrieve lecturer list.', 500);
    }
};

export const updateLecturer = async (id, updateDataFromController, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const lecturerIdToUpdate = parseInt(String(id), 10);
        if (isNaN(lecturerIdToUpdate)) throw new AppError('Invalid Lecturer ID format.', 400);

        const lecturerToUpdate = await prisma.lecturer.findUnique({ where: { id: lecturerIdToUpdate } });
        if (!lecturerToUpdate) throw new AppError('Lecturer not found for update.', 404);

        const dataForDb = {}; // This will hold only the fields that are actually being changed

        // --- Determine editable fields based on user type and action ---
        let editableFieldsForThisUser = [];
        if (requestingUser.type === 'admin') {
            editableFieldsForThisUser = adminEditableFields;
        } else if (requestingUser.type === 'lecturer' && requestingUser.id === lecturerIdToUpdate) {
            editableFieldsForThisUser = lecturerSelfEditableFields;
        } else {
            throw new AppError('You are not authorized to update this lecturer profile.', 403);
        }

        // --- HOD/EXAMINER role and department change uniqueness check (only if relevant fields are being updated by admin) ---
        if (requestingUser.type === 'admin' && (updateDataFromController.role || updateDataFromController.departmentId)) {
            const newRoleString = updateDataFromController.role !== undefined ? String(updateDataFromController.role).trim() : lecturerToUpdate.role;
            const newDepartmentIdString = updateDataFromController.departmentId !== undefined ? String(updateDataFromController.departmentId) : lecturerToUpdate.departmentId.toString();

            const finalRoleString = newRoleString; // Already trimmed or existing
            const finalDepartmentId = parseInt(newDepartmentIdString, 10); // Already int or existing

            if (updateDataFromController.departmentId !== undefined && isNaN(finalDepartmentId)) {
                throw new AppError('Invalid new department ID format for update.', 400);
            }
            if (updateDataFromController.role !== undefined && !Object.values(LecturerRole).includes(finalRoleString)) {
                throw new AppError(`Invalid new role: '${finalRoleString}'.`, 400);
            }

            const isRoleChanging = updateDataFromController.role !== undefined && finalRoleString !== lecturerToUpdate.role;
            const isDepartmentChanging = updateDataFromController.departmentId !== undefined && finalDepartmentId !== lecturerToUpdate.departmentId;

            if ((finalRoleString === LecturerRole.HOD || finalRoleString === LecturerRole.EXAMINER) &&
                (isRoleChanging || isDepartmentChanging) // Check only if role or department is actually changing
            ) {
                const existingSpecialRoleLecturer = await prisma.lecturer.findFirst({
                    where: {
                        departmentId: finalDepartmentId,
                        role: finalRoleString,
                        isActive: true,
                        id: { not: lecturerIdToUpdate }
                    }
                });
                if (existingSpecialRoleLecturer) {
                    throw new AppError(`An active ${finalRoleString} already exists for department ID ${finalDepartmentId}.`, 409);
                }
            }
        }
        // --- Process updateDataFromController against editable fields ---
        for (const key of editableFieldsForThisUser) {
            if (updateDataFromController.hasOwnProperty(key)) {
                const value = updateDataFromController[key];

                // Handle each field specifically
                if (key === 'profileImg') {
                    dataForDb.profileImg = (value === null || String(value).trim() === "") ? null : String(value).trim();
                } else if (key === 'email') {
                    const trimmedValue = String(value).trim();
                    if (trimmedValue && trimmedValue !== lecturerToUpdate.email) {
                        const existing = await prisma.lecturer.findFirst({ where: { email: trimmedValue, id: { not: lecturerIdToUpdate } } });
                        if (existing) throw new AppError('Email address already in use.', 409);
                        dataForDb.email = trimmedValue;
                    }
                } else if (key === 'phone') {
                    const phoneVal = value ? String(value).trim() : null;
                    if (phoneVal !== lecturerToUpdate.phone) {
                        if (phoneVal) {
                            const existing = await prisma.lecturer.findFirst({ where: { phone: phoneVal, id: { not: lecturerIdToUpdate } } });
                            if (existing) throw new AppError('Phone number already in use.', 409);
                        }
                        dataForDb.phone = phoneVal;
                    }
                } else if (key === 'password') {
                    if (value && String(value).trim() !== '') {
                        dataForDb.password = await hashPassword(String(value).trim());
                    }
                } else if (key === 'role' && requestingUser.type === 'admin') { // Restricted to admin
                    const roleValue = String(value).trim();
                    if (!Object.values(LecturerRole).includes(roleValue)) throw new AppError('Invalid role.', 400);
                    dataForDb.role = roleValue;
                } else if (key === 'departmentId' && requestingUser.type === 'admin') { // Restricted to admin
                    const pDeptId = parseInt(String(value), 10);
                    if (isNaN(pDeptId)) throw new AppError('Invalid department ID format.', 400);
                    const dept = await prisma.department.findUnique({ where: { id: pDeptId } });
                    if (!dept) throw new AppError(`Target department (ID: ${pDeptId}) not found.`, 404);
                    dataForDb.departmentId = pDeptId;
                } else if (key === 'isActive' && requestingUser.type === 'admin') { // Restricted to admin
                    dataForDb.isActive = typeof value === 'boolean' ? value : String(value).toLowerCase() === 'true';
                } else if (key === 'name' || key === 'title') {
                    dataForDb[key] = value === null ? null : String(value).trim();
                }
                // Note: If a field is in editableFieldsForThisUser but not handled by a specific 'if/else if' above,
                // it won't be added to dataForDb unless you add a general 'else { dataForDb[key] = value; }'.
                // This current structure is safer as it only processes explicitly handled fields.
            }
        }


        if (Object.keys(dataForDb).length === 0) {
            if (Object.keys(updateDataFromController).length === 0) {
                // Client sent an empty body and no file
                throw new AppError('No data provided for update.', 400);
            }
            // If updateDataFromController had keys but none resulted in a change in dataForDb
            console.warn(`[updateLecturer Service] No effective changes to apply to database for lecturer ${lecturerIdToUpdate}. Values might be same as current.`);
            // Return current data or throw a specific "no changes" error. For now, return current.
            const currentLecturerData = await prisma.lecturer.findUnique({
                where: { id: lecturerIdToUpdate },
                select: lecturerPublicSelection
            });
            if(!currentLecturerData) throw new AppError('Lecturer not found (should not happen here).', 404); // Should be caught earlier
            return currentLecturerData;
        }

        const updatedLecturer = await prisma.lecturer.update({
            where: { id: lecturerIdToUpdate },
            data: dataForDb,
            select: lecturerPublicSelection
        });
        return updatedLecturer;

    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2002' && error.meta?.target) {
            const targetFields = Array.isArray(error.meta.target) ? error.meta.target : [error.meta.target];
            if (targetFields.includes('email')) throw new AppError('Update failed: Email address already in use.', 409);
            if (targetFields.includes('phone')) throw new AppError('Update failed: Phone number already in use.', 409);
            throw new AppError(`Update failed: Unique constraint on ${targetFields.join(', ')}.`, 409);
        }
        console.error("[LECTURER_SERVICE_ERROR] UpdateLecturer:", error.message, error.stack);
        throw new AppError('Could not update lecturer profile due to an internal server error.', 500);
    }
};

export const deleteLecturer = async (id) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const lecturerIdNum = parseInt(String(id), 10);
        if (isNaN(lecturerIdNum)) throw new AppError('Invalid Lecturer ID format.', 400);

        const lecturer = await prisma.lecturer.findUnique({ where: { id: lecturerIdNum } });
        if (!lecturer) throw new AppError('Lecturer not found for deletion.', 404);

        const staffCourseCount = await prisma.staffCourse.count({ where: { lecturerId: lecturerIdNum } });
        if (staffCourseCount > 0) throw new AppError(`Cannot delete. Lecturer assigned to ${staffCourseCount} course(s).`, 400);
        // Add other dependency checks (e.g., createdExams, submittedScores) if relations are RESTRICT

        await prisma.lecturer.delete({ where: { id: lecturerIdNum } });
        return { message: `Lecturer '${lecturer.name}' deleted.` };
    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2003') throw new AppError('Cannot delete. Still referenced by other records.', 400);
        console.error("[LECTURER_SERVICE_ERROR] DeleteLecturer:", error.message, error.stack);
        throw new AppError('Could not delete lecturer.', 500);
    }
};

export const getDepartmentLecturers = async (requestingUser, query) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);

        // Authorization Check: Must be HOD or Admin
        if (requestingUser.type !== 'admin' && requestingUser.role !== LecturerRole.HOD) {
            throw new AppError("You are not authorized to view your department's lecturers.", 403);
        }
        if (!requestingUser.departmentId) {
            throw new AppError("Your user profile is missing department information.", 500);
        }

        const {
            role, isActive, name, staffId, title,
            page: queryPage = "1", limit: queryLimit = "10"
        } = query;

        // Core filter: Only get lecturers from the requesting user's department
        const where = {
            departmentId: requestingUser.departmentId
        };

        // --- Additional optional filters ---
        if (role && String(role).trim() !== "" && Object.values(LecturerRole).includes(String(role).trim())) {
            where.role = String(role).trim();
        }
        if (isActive !== undefined && isActive !== "") {
            where.isActive = isActive === 'true';
        }
        if (name && String(name).trim()) {
            where.name = { contains: String(name).trim(), mode: 'insensitive' };
        }
        if (staffId && String(staffId).trim()) {
            where.staffId = { contains: String(staffId).trim(), mode: 'insensitive' };
        }
        if (title && String(title).trim()) {
            where.title = { contains: String(title).trim(), mode: 'insensitive' };
        }

        // --- Pagination ---
        let pageNum = parseInt(queryPage, 10);
        let limitNum = parseInt(queryLimit, 10);
        if (isNaN(pageNum) || pageNum < 1) pageNum = 1;
        if (isNaN(limitNum) || limitNum < 1) limitNum = 10;
        const skip = (pageNum - 1) * limitNum;

        // --- Database Query ---
        const [lecturers, totalLecturers] = await prisma.$transaction([
            prisma.lecturer.findMany({
                where,
                select: lecturerPublicSelection,
                orderBy: { name: 'asc' },
                skip,
                take: limitNum,
            }),
            prisma.lecturer.count({ where })
        ]);

        return {
            lecturers,
            totalPages: Math.ceil(totalLecturers / limitNum),
            currentPage: pageNum,
            totalLecturers
        };

    } catch (error) {
        console.error("[LECTURER_SERVICE_ERROR] GetDepartmentLecturers:", error.message, error.stack);
        if (error instanceof AppError) throw error;
        throw new AppError('Could not retrieve departmental lecturer list.', 500);
    }
};

