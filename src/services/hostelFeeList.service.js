// src/services/hostelFeeList.service.js

import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';

const hostelFeeListSelection = {
    id: true,
    hostelId: true,
    roomId: true,
    seasonId: true,
    amount: true,
    description: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
    hostel: {
        select: { id: true, name: true, gender: true } // Include gender of the hostel
    },
    room: {
        select: { id: true, roomNumber: true, capacity: true } // Include room capacity
    },
    season: {
        select: { id: true, name: true }
    }
};

/**
 * Creates a new hostel fee list entry.
 * @param {object} feeData - The data for the new hostel fee list entry.
 * @returns {Promise<object>} The created hostel fee list entry.
 */
export const createHostelFeeList = async (feeData) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);

        const { hostelId, roomId, seasonId, amount, description, isActive } = feeData;

        // --- Basic Validation ---
        if (!hostelId || !seasonId || amount === undefined) {
            throw new new AppError('Hostel ID, Season ID, and Amount are required.', 400)
        }

        const pHostelId = parseInt(hostelId, 10);
        const pSeasonId = parseInt(seasonId, 10);
        const pAmount = parseFloat(amount);
        const pRoomId = roomId ? parseInt(roomId, 10) : null;

        if (isNaN(pHostelId) || isNaN(pSeasonId) || isNaN(pAmount) || pAmount <= 0) {
            throw new AppError('Invalid numeric format for IDs or Amount must be positive.', 400);
        }
        if (pRoomId && isNaN(pRoomId)) {
            throw new AppError('Invalid Room ID format.', 400);
        }

        // --- Check for existence of related records ---
        const [hostel, season, room] = await Promise.all([
            prisma.hostel.findUnique({ where: { id: pHostelId } }),
            prisma.season.findUnique({ where: { id: pSeasonId } }),
            pRoomId ? prisma.hostelRoom.findUnique({ where: { id: pRoomId } }) : null
        ]);

        if (!hostel) throw new AppError(`Hostel with ID ${pHostelId} not found.`, 404);
        if (!season) throw new AppError(`Season with ID ${pSeasonId} not found.`, 404);
        if (pRoomId && (!room || room.hostelId !== pHostelId)) { // If roomId is provided, it must exist and belong to the specified hostel
            throw new AppError(`Room with ID ${pRoomId} not found or does not belong to Hostel ID ${pHostelId}.`, 404);
        }

        // --- Check for uniqueness ---
        const existingFee = await prisma.hostelFeeList.findFirst({
            where: {
                hostelId: pHostelId,
                roomId: pRoomId, // null or specific ID
                seasonId: pSeasonId
            }
        });
        if (existingFee) {
            throw new AppError(`A hostel fee already exists for this combination of hostel, room (if specified), and season.`, 409);
        }

        const newHostelFeeList = await prisma.hostelFeeList.create({
            data: {
                hostelId: pHostelId,
                roomId: pRoomId,
                seasonId: pSeasonId,
                amount: pAmount,
                description: description || null,
                isActive: isActive !== undefined ? Boolean(isActive) : true,
            },
            select: hostelFeeListSelection
        });

        return newHostelFeeList;

    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code) {
             console.error("Prisma Error Code in createHostelFeeList:", error.code);
        }
        console.error("Error creating hostel fee list:", error.message, error.stack);
        throw new AppError('Could not create hostel fee list.', 500);
    }
};

/**
 * Retrieves a hostel fee list entry by its ID.
 * @param {string} id - The ID of the hostel fee list entry.
 * @returns {Promise<object>} The hostel fee list entry.
 */
export const getHostelFeeListById = async (id) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const feeId = parseInt(id, 10);
        if (isNaN(feeId)) throw new AppError('Invalid Hostel Fee List ID format.', 400);

        const hostelFee = await prisma.hostelFeeList.findUnique({
            where: { id: feeId },
            select: hostelFeeListSelection
        });

        if (!hostelFee) throw new AppError('Hostel Fee List entry not found.', 404);
        return hostelFee;

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching hostel fee list by ID:", error.message, error.stack);
        throw new AppError('Could not retrieve hostel fee list entry.', 500);
    }
};

/**
 * Retrieves all hostel fee list entries with optional filters and pagination.
 * @param {object} query - Query parameters for filtering and pagination.
 * @returns {Promise<object>} An object containing the list of hostel fee list entries and pagination info.
 */
export const getAllHostelFeeLists = async (query) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);

        const { hostelId, roomId, seasonId, isActive, page = 1, limit = 10 } = query;

        const where = {};
        if (hostelId) where.hostelId = parseInt(hostelId, 10);
        if (roomId) where.roomId = parseInt(roomId, 10);
        if (seasonId) where.seasonId = parseInt(seasonId, 10);
        if (isActive !== undefined) where.isActive = Boolean(isActive === 'true'); // Convert string 'true'/'false' to boolean

        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;

        const hostelFees = await prisma.hostelFeeList.findMany({
            where,
            select: hostelFeeListSelection,
            orderBy: { createdAt: 'desc' }, // Or any other relevant order
            skip,
            take: limitNum
        });

        const totalHostelFees = await prisma.hostelFeeList.count({ where });

        return {
            hostelFees,
            totalPages: Math.ceil(totalHostelFees / limitNum),
            currentPage: pageNum,
            totalHostelFees
        };

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching all hostel fee lists:", error.message, error.stack);
        throw new AppError('Could not retrieve hostel fee list.', 500);
    }
};

/**
 * Updates a hostel fee list entry.
 * @param {string} id - The ID of the hostel fee list entry to update.
 * @param {object} updateData - The data to update.
 * @returns {Promise<object>} The updated hostel fee list entry.
 */
export const updateHostelFeeList = async (id, updateData) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const feeId = parseInt(id, 10);
        if (isNaN(feeId)) throw new AppError('Invalid Hostel Fee List ID format.', 400);

        const existingFee = await prisma.hostelFeeList.findUnique({ where: { id: feeId } });
        if (!existingFee) throw new AppError('Hostel Fee List entry not found for update.', 404);

        const dataForDb = {};
        const { hostelId, roomId, seasonId, amount, description, isActive } = updateData;

        // Process fields for update
        if (hostelId !== undefined) {
            const pHostelId = parseInt(hostelId, 10);
            if (isNaN(pHostelId)) throw new AppError('Invalid Hostel ID format.', 400);
            if (!await prisma.hostel.findUnique({ where: { id: pHostelId } })) {
                throw new AppError(`Hostel with ID ${pHostelId} not found.`, 404);
            }
            dataForDb.hostelId = pHostelId;
        }

        if (seasonId !== undefined) {
            const pSeasonId = parseInt(seasonId, 10);
            if (isNaN(pSeasonId)) throw new AppError('Invalid Season ID format.', 400);
            if (!await prisma.season.findUnique({ where: { id: pSeasonId } })) {
                throw new AppError(`Season with ID ${pSeasonId} not found.`, 404);
            }
            dataForDb.seasonId = pSeasonId;
        }
        
        // Handle roomId, allowing it to be explicitly set to null
        if (updateData.hasOwnProperty('roomId')) {
            const pRoomId = roomId === null || roomId === '' ? null : parseInt(roomId, 10);
            if (pRoomId && isNaN(pRoomId)) throw new AppError('Invalid Room ID format.', 400);
            if (pRoomId) { // If a room ID is provided and not null, validate its existence and relation
                 const targetHostelId = dataForDb.hostelId || existingFee.hostelId; // Use new hostelId if present, else old one
                 const room = await prisma.hostelRoom.findUnique({ where: { id: pRoomId } });
                 if (!room || room.hostelId !== targetHostelId) {
                     throw new AppError(`Room with ID ${pRoomId} not found or does not belong to Hostel ID ${targetHostelId}.`, 404);
                 }
            }
            dataForDb.roomId = pRoomId;
        }

        if (amount !== undefined) {
            const pAmount = parseFloat(amount);
            if (isNaN(pAmount) || pAmount <= 0) throw new AppError('Invalid Amount. Must be a positive number.', 400);
            dataForDb.amount = pAmount;
        }

        if (description !== undefined) dataForDb.description = description || null;
        if (isActive !== undefined) dataForDb.isActive = Boolean(isActive);

        if (Object.keys(dataForDb).length === 0) {
            throw new AppError('No valid fields provided for update.', 400);
        }

        // Re-check for uniqueness only if relevant fields changed
        // Use updated values for check if available, otherwise existing values
        const newHostelId = dataForDb.hostelId !== undefined ? dataForDb.hostelId : existingFee.hostelId;
        const newRoomId = dataForDb.roomId !== undefined ? dataForDb.roomId : existingFee.roomId;
        const newSeasonId = dataForDb.seasonId !== undefined ? dataForDb.seasonId : existingFee.seasonId;

        // If any of the unique combo fields change, check for conflict
        if (newHostelId !== existingFee.hostelId || newRoomId !== existingFee.roomId || newSeasonId !== existingFee.seasonId) {
            const conflict = await prisma.hostelFeeList.findFirst({
                where: {
                    hostelId: newHostelId,
                    roomId: newRoomId,
                    seasonId: newSeasonId,
                    id: { not: feeId } // Exclude the current record being updated
                }
            });
            if (conflict) {
                throw new AppError('An existing fee list entry already matches this new combination of hostel, room, and season.', 409);
            }
        }
        

        const updatedHostelFeeList = await prisma.hostelFeeList.update({
            where: { id: feeId },
            data: dataForDb,
            select: hostelFeeListSelection
        });
        return updatedHostelFeeList;

    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code) {
             console.error("Prisma Error Code in updateHostelFeeList:", error.code);
        }
        console.error("Error updating hostel fee list:", error.message, error.stack);
        throw new AppError('Could not update hostel fee list entry.', 500);
    }
};

/**
 * Deletes a hostel fee list entry.
 * @param {string} id - The ID of the hostel fee list entry to delete.
 * @returns {Promise<object>} A success message.
 */
export const deleteHostelFeeList = async (id) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const feeId = parseInt(id, 10);
        if (isNaN(feeId)) throw new AppError('Invalid Hostel Fee List ID format.', 400);

        const feeToDelete = await prisma.hostelFeeList.findUnique({ where: { id: feeId } });
        if (!feeToDelete) throw new AppError('Hostel Fee List entry not found for deletion.', 404);

        // Check for associated bookings with this feeListId if your onDelete action was 'Restrict'
        // Since you set `onDelete: SetNull` for `hostelFeeListId` in `HostelBooking`,
        // deleting a HostelFeeList will set `hostelFeeListId` to null in any dependent bookings,
        // so direct deletion is allowed without a blocking check here.

        await prisma.hostelFeeList.delete({ where: { id: feeId } });
        return { message: 'Hostel Fee List entry deleted successfully.' };

    } catch (error) {
        if (error instanceof AppError) throw error;
        // P2003 for foreign key constraint if onDelete:Restrict was set and there were bookings
        if (error.code === 'P2003') throw new AppError('Cannot delete hostel fee list entry due to existing dependent records.', 400);
        console.error("Error deleting hostel fee list:", error.message, error.stack);
        throw new AppError('Could not delete hostel fee list entry.', 500);
    }
};

/**
 * Retrieves hostel fee list entries relevant to a specific student,
 * based on their current academic season and gender.
 * @param {number} studentId - The ID of the requesting student.
 * @param {object} query - Query parameters for pagination.
 * @returns {Promise<object>} An object containing student's relevant hostel fee list entries and pagination info.
 */
export const getStudentHostelFees = async (studentId, query) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);

        // --- Fetch Student's Essential Details ---
        const student = await prisma.student.findUnique({
            where: { id: studentId },
            select: {
                id: true,
                currentSeasonId: true,
                currentLevelId: true, // Could be useful if fees differ by level (extend HostelFeeList for this)
                studentDetails: { // Need to include to get gender
                    select: { gender: true }
                }
            }
        });

        if (!student) {
            throw new AppError('Student profile not found.', 404);
        }
        if (!student.currentSeasonId) {
            throw new AppError('Student is not assigned to a current academic season.', 400);
        }
        if (!student.studentDetails?.gender) {
            // Depending on your rules, this might be an error or simply mean gender-specific hostels won't apply
            throw new AppError('Student gender details are missing.', 400);
        }

        const { page = 1, limit = 10 } = query;
        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;

        // --- Build the Dynamic WHERE clause for students ---
        const where = {
            isActive: true,
            seasonId: student.currentSeasonId, // Only show fees for the student's current season
            hostel: {
                // If a hostel has a gender specified, it must match the student's gender.
                // If hostel.gender is null, it means it's a gender-neutral hostel (open to all).
                // Student can book if:
                // 1. The hostel is gender-neutral (hostel.gender is null).
                // 2. The hostel's gender explicitly matches the student's gender.
                OR: [
                    { gender: null },
                    { gender: student.studentDetails.gender }
                ]
            }
            // Add other student-specific filters if your HostelFeeList schema expands, e.g.:
            // AND: [
            //     {
            //         OR: [
            //             { levelId: null }, // Fee applies to all levels
            //             { levelId: student.currentLevelId } // Fee applies to this specific level
            //         ]
            //     }
            // ]
        };

        const hostelFees = await prisma.hostelFeeList.findMany({
            where,
            select: hostelFeeListSelection,
            orderBy: [ // Order for a sensible display to the student
                { hostel: { name: 'asc' } }, // Group by hostel
                { amount: 'asc' } // Then by amount (cheaper first)
            ],
            skip,
            take: limitNum
        });

        const totalHostelFees = await prisma.hostelFeeList.count({ where });

        return {
            hostelFees,
            totalPages: Math.ceil(totalHostelFees / limitNum),
            currentPage: pageNum,
            totalHostelFees
        };

    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching student's hostel fees:", error.message, error.stack);
        throw new AppError('Could not retrieve student hostel fee list.', 500);
    }
};