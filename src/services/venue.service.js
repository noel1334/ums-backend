// src/services/venue.service.js
import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';

const venueSelection = {
    id: true, name: true, location: true, capacity: true, isCBT: true, isActive: true, createdAt: true, updatedAt: true
};

export const createVenue = async (venueData) => {
    try {
        if (!prisma) throw new AppError('Prisma client not available.', 500);
        const { name, location, capacity, isCBT, isActive } = venueData;

        if (!name) throw new AppError('Venue name is required.', 400);

        const newVenue = await prisma.venue.create({
            data: {
                name,
                location: location || null,
                capacity: capacity ? parseInt(capacity, 10) : null,
                isCBT: isCBT === undefined ? false : Boolean(isCBT),
                isActive: isActive === undefined ? true : Boolean(isActive),
            },
            select: venueSelection
        });
        return newVenue;
    } catch (error) {
        if (error.code === 'P2002' && error.meta?.target?.includes('name')) {
            throw new AppError(`A venue with the name '${venueData.name}' already exists.`, 409);
        }
        if (error instanceof AppError) throw error;
        console.error("Error creating venue:", error.message, error.stack);
        throw new AppError('Could not create venue.', 500);
    }
};

export const getAllVenues = async (query) => {
    try {
        if (!prisma) throw new AppError('Prisma client not available.', 500);
        const { isActive, isCBT, page = 1, limit = 20, name } = query;
        const where = {};

        if (isActive !== undefined) where.isActive = isActive === 'true';
        if (isCBT !== undefined) where.isCBT = isCBT === 'true';
        if (name) where.name = { contains: name, mode: 'insensitive' };

        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;

        const venues = await prisma.venue.findMany({
            where,
            select: venueSelection,
            orderBy: { name: 'asc' },
            skip,
            take: limitNum
        });
        const totalVenues = await prisma.venue.count({ where });
        return { venues, totalPages: Math.ceil(totalVenues / limitNum), currentPage: pageNum, totalVenues };
    } catch (error) {
        console.error("Error fetching venues:", error.message, error.stack);
        throw new AppError('Could not retrieve venues.', 500);
    }
};

export const getVenueById = async (id) => {
    try {
        if (!prisma) throw new AppError('Prisma client not available.', 500);
        const venueId = parseInt(id, 10);
        if (isNaN(venueId)) throw new AppError('Invalid venue ID.', 400);
        const venue = await prisma.venue.findUnique({
            where: { id: venueId },
            select: venueSelection
        });
        if (!venue) throw new AppError('Venue not found.', 404);
        return venue;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching venue by ID:", error.message, error.stack);
        throw new AppError('Could not retrieve venue.', 500);
    }
};

export const updateVenue = async (id, updateData) => {
    try {
        if (!prisma) throw new AppError('Prisma client not available.', 500);
        const venueId = parseInt(id, 10);
        if (isNaN(venueId)) throw new AppError('Invalid venue ID.', 400);

        const existingVenue = await prisma.venue.findUnique({ where: { id: venueId } });
        if (!existingVenue) throw new AppError('Venue not found for update.', 404);

        const dataToUpdate = {};
        if (updateData.name !== undefined) dataToUpdate.name = updateData.name;
        if (updateData.location !== undefined) dataToUpdate.location = updateData.location === '' ? null : updateData.location;
        if (updateData.capacity !== undefined) dataToUpdate.capacity = updateData.capacity === null ? null : parseInt(updateData.capacity, 10);
        if (updateData.isCBT !== undefined) dataToUpdate.isCBT = Boolean(updateData.isCBT);
        if (updateData.isActive !== undefined) dataToUpdate.isActive = Boolean(updateData.isActive);

        if (Object.keys(dataToUpdate).length === 0) throw new AppError('No valid fields provided for update.', 400);
        if (dataToUpdate.capacity !== undefined && isNaN(dataToUpdate.capacity) && dataToUpdate.capacity !== null) throw new AppError('Invalid capacity format.', 400);


        const updatedVenue = await prisma.venue.update({
            where: { id: venueId },
            data: dataToUpdate,
            select: venueSelection
        });
        return updatedVenue;
    } catch (error) {
        if (error.code === 'P2002' && error.meta?.target?.includes('name')) {
            throw new AppError(`A venue with the name '${updateData.name}' already exists.`, 409);
        }
        if (error instanceof AppError) throw error;
        console.error("Error updating venue:", error.message, error.stack);
        throw new AppError('Could not update venue.', 500);
    }
};

export const deleteVenue = async (id) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const venueId = parseInt(id, 10);
        if (isNaN(venueId)) throw new AppError('Invalid venue ID.', 400);

        const venue = await prisma.venue.findUnique({
            where: { id: venueId },
            include: { _count: { select: { examSessions: true } } }
        });
        if (!venue) throw new AppError('Venue not found for deletion.', 404);
        if (venue._count.examSessions > 0) {
            throw new AppError(`Cannot delete venue. It is associated with ${venue._count.examSessions} exam session(s).`, 400);
        }

        await prisma.venue.delete({ where: { id: venueId } });
        return { message: 'Venue deleted successfully.' };
    } catch (error) {
        if (error instanceof AppError) throw error;
        // P2003 can occur if relations are Restrict and not checked above
        if (error.code === 'P2003') throw new AppError('Cannot delete venue, it is still in use.', 400);
        console.error("Error deleting venue:", error.message, error.stack);
        throw new AppError('Could not delete venue.', 500);
    }
};