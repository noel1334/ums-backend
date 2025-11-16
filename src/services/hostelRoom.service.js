
import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';

const roomPublicSelection = {
    id: true, roomNumber: true, capacity: true, isAvailable: true, createdAt: true, updatedAt: true,
    hostel: { select: { id: true, name: true } },
    _count: { select: { bookings: { where: { isActive: true } } } } // Count of active bookings for this room
};

export const createHostelRoom = async (hostelIdParam, roomData) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const hostelId = parseInt(hostelIdParam, 10);
        if (isNaN(hostelId)) throw new AppError('Invalid Hostel ID in path.', 400);

        const { roomNumber, capacity, isAvailable } = roomData;
        if (!roomNumber || capacity === undefined) throw new AppError('Room number and capacity are required.', 400);
        const pCapacity = parseInt(capacity, 10);
        if (isNaN(pCapacity) || pCapacity <= 0) throw new AppError('Capacity must be a positive integer.', 400);

        const hostelExists = await prisma.hostel.findUnique({ where: { id: hostelId } });
        if (!hostelExists) throw new AppError(`Hostel with ID ${hostelId} not found.`, 404);

        const newRoom = await prisma.hostelRoom.create({
            data: {
                hostelId: hostelId,
                roomNumber,
                capacity: pCapacity,
                isAvailable: isAvailable === undefined ? true : Boolean(isAvailable),
            },
            select: roomPublicSelection
        });
        return newRoom;
    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2002') throw new AppError('A room with this number already exists in this hostel.', 409);
        console.error("Error creating hostel room:", error.message, error.stack);
        throw new AppError('Could not create hostel room.', 500);
    }
};

export const getHostelRoomById = async (hostelIdParam, roomIdParam) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const hostelId = parseInt(hostelIdParam, 10);
        const roomId = parseInt(roomIdParam, 10);
        if (isNaN(hostelId) || isNaN(roomId)) throw new AppError('Invalid Hostel or Room ID format.', 400);

        const room = await prisma.hostelRoom.findUnique({
            where: { id: roomId, hostelId: hostelId }, // Ensure room belongs to hostel
            select: roomPublicSelection
        });
        if (!room) throw new AppError('Hostel room not found or does not belong to specified hostel.', 404);
        return room;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching room by ID:", error.message, error.stack);
        throw new AppError('Could not retrieve room.', 500);
    }
};

export const getAllHostelRooms = async (hostelIdParam, query) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const hostelId = parseInt(hostelIdParam, 10);
        if (isNaN(hostelId)) throw new AppError('Invalid Hostel ID in path.', 400);

        const { isAvailable, roomNumber, page = 1, limit = 10 } = query;
        const where = { hostelId: hostelId };
        if (isAvailable !== undefined) where.isAvailable = isAvailable === 'true';
        if (roomNumber) where.roomNumber = { contains: roomNumber };

        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;

        const rooms = await prisma.hostelRoom.findMany({
            where, select: roomPublicSelection, orderBy: { roomNumber: 'asc' }, skip, take: limitNum
        });
        const totalRooms = await prisma.hostelRoom.count({ where });
        return { rooms, totalPages: Math.ceil(totalRooms / limitNum), currentPage: pageNum, totalRooms };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching rooms:", error.message, error.stack);
        throw new AppError('Could not retrieve room list.', 500);
    }
};

export const updateHostelRoom = async (hostelIdParam, roomIdParam, updateData) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const hostelId = parseInt(hostelIdParam, 10);
        const roomId = parseInt(roomIdParam, 10);
        if (isNaN(hostelId) || isNaN(roomId)) throw new AppError('Invalid Hostel or Room ID format.', 400);

        const existingRoom = await prisma.hostelRoom.findUnique({ where: { id: roomId, hostelId: hostelId } });
        if (!existingRoom) throw new AppError('Room not found in this hostel for update.', 404);

        const dataForDb = {};
        const { roomNumber, capacity, isAvailable } = updateData;
        if (roomNumber !== undefined) {
            if (roomNumber !== existingRoom.roomNumber) {
                const roomConflict = await prisma.hostelRoom.findFirst({ where: { hostelId, roomNumber, id: { not: roomId } } });
                if (roomConflict) throw new AppError('Another room with this number already exists in this hostel.', 409);
            }
            dataForDb.roomNumber = roomNumber;
        }
        if (capacity !== undefined) {
            const pCapacity = parseInt(capacity, 10);
            if (isNaN(pCapacity) || pCapacity <= 0) throw new AppError('Invalid capacity.', 400);
            dataForDb.capacity = pCapacity;
        }
        if (isAvailable !== undefined) dataForDb.isAvailable = Boolean(isAvailable);

        if (Object.keys(dataForDb).length === 0) throw new AppError('No valid fields for update.', 400);

        const updatedRoom = await prisma.hostelRoom.update({
            where: { id: roomId }, data: dataForDb, select: roomPublicSelection
        });
        return updatedRoom;
    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2002') throw new AppError('Update failed: Room number conflict.', 409);
        console.error("Error updating room:", error.message, error.stack);
        throw new AppError('Could not update room.', 500);
    }
};

export const deleteHostelRoom = async (hostelIdParam, roomIdParam) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const hostelId = parseInt(hostelIdParam, 10);
        const roomId = parseInt(roomIdParam, 10);
        if (isNaN(hostelId) || isNaN(roomId)) throw new AppError('Invalid Hostel or Room ID format.', 400);

        const room = await prisma.hostelRoom.findUnique({ where: { id: roomId, hostelId: hostelId }, include: { _count: { select: { bookings: true } } } });
        if (!room) throw new AppError('Room not found in this hostel.', 404);

        // HostelBooking.roomId onDelete: Restrict will prevent this if bookings exist.
        if (room._count.bookings > 0) {
            throw new AppError(`Cannot delete room. It has ${room._count.bookings} bookings. Resolve bookings first.`, 400);
        }

        await prisma.hostelRoom.delete({ where: { id: roomId } });
        return { message: 'Hostel room deleted successfully.' };
    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2003') throw new AppError('Cannot delete room due to existing bookings.', 400);
        console.error("Error deleting room:", error.message, error.stack);
        throw new AppError('Could not delete room.', 500);
    }
};