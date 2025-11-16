// src/services/hostel.service.js
import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import { Gender , BookingPaymentStatus} from '../generated/prisma/index.js'; // ADJUST PATH IF NEEDED


const hostelPublicSelection = {
    id: true, name: true, capacity: true, gender: true, createdAt: true, updatedAt: true,
    _count: { select: { rooms: true, bookings: true } } // Include counts
};

export const createHostel = async (hostelData) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const { name, capacity, gender } = hostelData;
        if (!name || capacity === undefined) throw new AppError('Name and capacity are required.', 400);
        const pCapacity = parseInt(capacity, 10);
        if (isNaN(pCapacity) || pCapacity < 0) throw new AppError('Capacity must be a non-negative integer.', 400);
        if (gender && !Object.values(Gender).includes(gender)) throw new AppError('Invalid gender.', 400);

        const newHostel = await prisma.hostel.create({
            data: { name, capacity: pCapacity, gender: gender || null },
            select: hostelPublicSelection
        });
        return newHostel;
    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2002') throw new AppError('A hostel with this name already exists.', 409);
        console.error("Error creating hostel:", error.message, error.stack);
        throw new AppError('Could not create hostel.', 500);
    }
};

export const getHostelById = async (id) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const hostelId = parseInt(id, 10);
        if (isNaN(hostelId)) throw new AppError('Invalid hostel ID.', 400);
        const hostel = await prisma.hostel.findUnique({
            where: { id: hostelId },
            select: {
                ...hostelPublicSelection,
                rooms: { // Include rooms for this hostel
                    select: { id: true, roomNumber: true, capacity: true, isAvailable: true, _count: { select: { bookings: true } } }
                }
            }
        });
        if (!hostel) throw new AppError('Hostel not found.', 404);
        return hostel;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching hostel by ID:", error.message, error.stack);
        throw new AppError('Could not retrieve hostel.', 500);
    }
};

export const getAllHostels = async (query) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const { name, gender, page = 1, limit = 10 } = query;
        const where = {};
        if (name) where.name = { contains: name };
        if (gender && Object.values(Gender).includes(gender)) where.gender = gender;

        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;

        const hostels = await prisma.hostel.findMany({
            where, select: hostelPublicSelection, orderBy: { name: 'asc' }, skip, take: limitNum
        });
        const totalHostels = await prisma.hostel.count({ where });
        return { hostels, totalPages: Math.ceil(totalHostels / limitNum), currentPage: pageNum, totalHostels };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching hostels:", error.message, error.stack);
        throw new AppError('Could not retrieve hostel list.', 500);
    }
};

export const updateHostel = async (id, updateData) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const hostelId = parseInt(id, 10);
        if (isNaN(hostelId)) throw new AppError('Invalid hostel ID.', 400);
        const existingHostel = await prisma.hostel.findUnique({ where: { id: hostelId } });
        if (!existingHostel) throw new AppError('Hostel not found for update.', 404);

        const dataForDb = {};
        const { name, capacity, gender } = updateData;
        if (name !== undefined) {
            if (name !== existingHostel.name) {
                const nameConflict = await prisma.hostel.findFirst({ where: { name, id: { not: hostelId } } });
                if (nameConflict) throw new AppError('Another hostel with this name already exists.', 409);
            }
            dataForDb.name = name;
        }
        if (capacity !== undefined) {
            const pCapacity = parseInt(capacity, 10);
            if (isNaN(pCapacity) || pCapacity < 0) throw new AppError('Invalid capacity.', 400);
            dataForDb.capacity = pCapacity;
        }
        if (updateData.hasOwnProperty('gender')) { // Allows setting gender to null
            dataForDb.gender = (gender === null || gender === '') ? null : gender;
            if (dataForDb.gender && !Object.values(Gender).includes(dataForDb.gender)) throw new AppError('Invalid gender.', 400);
        }

        if (Object.keys(dataForDb).length === 0) throw new AppError('No valid fields for update.', 400);

        const updatedHostel = await prisma.hostel.update({
            where: { id: hostelId }, data: dataForDb, select: hostelPublicSelection
        });
        return updatedHostel;
    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2002') throw new AppError('Update failed: Hostel name conflict.', 409);
        console.error("Error updating hostel:", error.message, error.stack);
        throw new AppError('Could not update hostel.', 500);
    }
};

export const deleteHostel = async (id) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const hostelId = parseInt(id, 10);
        if (isNaN(hostelId)) throw new AppError('Invalid hostel ID.', 400);
        const hostel = await prisma.hostel.findUnique({ where: { id: hostelId }, include: { _count: { select: { rooms: true, bookings: true } } } });
        if (!hostel) throw new AppError('Hostel not found for deletion.', 404);

        // With HostelRoom.hostelId onDelete:Cascade, rooms will be deleted.
        // With HostelBooking.hostelId onDelete:Restrict, this will fail if bookings exist.
        if (hostel._count.bookings > 0) {
            throw new AppError(`Cannot delete hostel. It has ${hostel._count.bookings} bookings. Please resolve bookings first.`, 400);
        }
        // Rooms will cascade delete. If rooms had Restrict relations from bookings, that would also block.

        await prisma.hostel.delete({ where: { id: hostelId } });
        return { message: 'Hostel and its rooms deleted successfully.' };
    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2003') throw new AppError('Cannot delete hostel due to existing related records (e.g., bookings).', 400);
        console.error("Error deleting hostel:", error.message, error.stack);
        throw new AppError('Could not delete hostel.', 500);
    }
};

export const getHostelRoomsWithOccupancy = async (hostelId, seasonId) => {
    const pHostelId = parseInt(hostelId, 10);
    const pSeasonId = parseInt(seasonId, 10);

    if (isNaN(pHostelId) || isNaN(pSeasonId)) {
        throw new AppError('Invalid Hostel ID or Season ID.', 400);
    }

    // Fetch all rooms for the given hostel
    const rooms = await prisma.hostelRoom.findMany({
        where: { hostelId: pHostelId },
        select: {
            id: true,
            roomNumber: true,
            capacity: true,
            isAvailable: true, // Physical availability
            hostelId: true,
        },
        orderBy: { roomNumber: 'asc' }
    });

    // For each room, dynamically calculate its current occupancy for the specified season
    const roomsWithOccupancy = await Promise.all(rooms.map(async (room) => {
        const currentOccupancy = await prisma.hostelBooking.count({
            where: {
                roomId: room.id,
                seasonId: pSeasonId,
                paymentStatus: BookingPaymentStatus.PAID, // Only count PAID bookings
                isActive: true, // Only count active bookings
            },
        });
        return {
            ...room,
            currentOccupancy: currentOccupancy,
        };
    }));

    return roomsWithOccupancy;
};