import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';

export const createSeason = async (seasonData) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const { name, startDate, endDate, isActive, isComplete } = seasonData;
        if (!name) throw new AppError('Season name is required.', 400);

        const data = { name };
        if (startDate) data.startDate = new Date(startDate);
        if (endDate) data.endDate = new Date(endDate);
        if (typeof isActive === 'boolean') data.isActive = isActive;
        if (typeof isComplete === 'boolean') data.isComplete = isComplete;

        if (data.isActive) {
            await prisma.season.updateMany({
                where: { isActive: true },
                data: { isActive: false },
            });
        }

        const season = await prisma.season.create({ data });
        return season;
    } catch (error) {
        if (error.code === 'P2002' && error.meta?.target?.includes('name')) {
            throw new AppError('A season with this name already exists.', 409);
        }
        if (error instanceof AppError) throw error;
        console.error("Error creating season:", error);
        throw new AppError('Could not create season.', 500);
    }
};

export const getAllSeasons = async (query) => {
    const { isActive, isComplete, name, page = 1, limit = 10 } = query;
    const where = {};
    if (isActive !== undefined) where.isActive = isActive === 'true';
    if (isComplete !== undefined) where.isComplete = isComplete === 'true';
    if (name) where.name = { contains: name, mode: 'insensitive' };

    const seasons = await prisma.season.findMany({
        where,
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
        orderBy: { startDate: 'desc' } // Or by name
    });
    const totalSeasons = await prisma.season.count({ where });
    return { seasons, totalPages: Math.ceil(totalSeasons / parseInt(limit)), currentPage: parseInt(page), totalSeasons };
};

export const getSeasonById = async (id) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const seasonId = parseInt(id, 10);
        if (isNaN(seasonId)) throw new AppError('Invalid season ID format.', 400);

        const season = await prisma.season.findUnique({
            where: { id: seasonId },
            include: {
                semesters: { orderBy: { semesterNumber: 'asc' } },
                // Optionally include counts for a detail view
                // _count: {
                //   select: {
                //     studentsAdmitted: true,
                //     registrations: true,
                //     results: true
                //   }
                // }
            }
        });
        if (!season) throw new AppError('Season not found.', 404);
        return season;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching season by ID:", error);
        throw new AppError('Could not retrieve season.', 500);
    }
};

export const updateSeason = async (id, updateData) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const seasonId = parseInt(id, 10);
        if (isNaN(seasonId)) throw new AppError('Invalid season ID format.', 400);

        const { name, startDate, endDate, isActive, isComplete } = updateData;
        const dataToUpdate = {};
        if (name) dataToUpdate.name = name;
        if (startDate) dataToUpdate.startDate = new Date(startDate);
        if (endDate) dataToUpdate.endDate = new Date(endDate);
        if (typeof isActive === 'boolean') dataToUpdate.isActive = isActive;
        if (typeof isComplete === 'boolean') dataToUpdate.isComplete = isComplete;

        const existingSeason = await prisma.season.findUnique({ where: { id: seasonId } });
        if (!existingSeason) throw new AppError('Season not found for update.', 404);

        if (dataToUpdate.isActive === true && existingSeason.isActive === false) {
            await prisma.season.updateMany({
                where: { id: { not: seasonId }, isActive: true },
                data: { isActive: false },
            });
        }

        const season = await prisma.season.update({
            where: { id: seasonId },
            data: dataToUpdate,
        });
        return season;
    } catch (error) {
        if (error.code === 'P2002' && error.meta?.target?.includes('name')) {
            throw new AppError('A season with this name already exists.', 409);
        }
        if (error instanceof AppError) throw error;
        console.error("Error updating season:", error);
        throw new AppError('Could not update season.', 500);
    }
};

export const updateSeasonStatusOnly = async (id, statusData) => {
    if (!prisma) throw new AppError('Prisma client is not available.', 500);
    const seasonId = parseInt(id, 10);
    if (isNaN(seasonId)) throw new AppError('Invalid season ID format.', 400);

    const { isActive, isComplete } = statusData; // This is the NEW desired state from client

    // Validate that at least one status field is provided and is a boolean
    if ( (isActive === undefined && isComplete === undefined) ||
         (isActive !== undefined && typeof isActive !== 'boolean') ||
         (isComplete !== undefined && typeof isComplete !== 'boolean') ) {
        throw new AppError('At least one status (isActive or isComplete) must be provided as a boolean.', 400);
    }

    const dataToUpdate = {};
    if (typeof isActive === 'boolean') dataToUpdate.isActive = isActive;
    if (typeof isComplete === 'boolean') dataToUpdate.isComplete = isComplete;

    try {
        const existingSeason = await prisma.season.findUnique({ where: { id: seasonId } });
        if (!existingSeason) throw new AppError('Season not found for status update.', 404);

        // --- Business Logic for Toggling Status ---

        // 1. If setting isActive to true:
        if (dataToUpdate.isActive === true) {
            // a. Ensure it's not already completed
            if (existingSeason.isComplete === true) {
                throw new AppError("Cannot activate a season that is already marked as complete. Please unmark completion first.", 400);
            }
            // b. Deactivate any other currently active season
            if (existingSeason.isActive === false || existingSeason.isActive === null) { // Only run if changing to active
                await prisma.season.updateMany({
                    where: { id: { not: seasonId }, isActive: true },
                    data: { isActive: false },
                });
            }
            // c. If this action also intends to mark it as NOT complete (e.g., reactivating a previously completed one)
            //    this would need to be explicit in the payload or a separate action.
            //    For now, activating does not automatically un-complete.
            if (dataToUpdate.isComplete === undefined && existingSeason.isComplete === true) {
                // This case should be prevented by the check above, but as a safeguard:
                // If we are activating and isComplete is not in the payload but was true,
                // it means we are trying to activate a completed season without explicitly un-completing it.
                // The check `if (existingSeason.isComplete === true)` handles this.
            }
        }

        // 2. If setting isComplete to true:
        if (dataToUpdate.isComplete === true) {
            // a. A completed season cannot be active.
            // If isActive is also in dataToUpdate and is true, it's a conflict.
            if (dataToUpdate.isActive === true) {
                 throw new AppError("A season cannot be marked as complete and active simultaneously.", 400);
            }
            // If isActive is not in dataToUpdate, but the season was previously active, deactivate it.
            if (dataToUpdate.isActive === undefined && existingSeason.isActive === true) {
                dataToUpdate.isActive = false;
            }
        }

        // 3. If setting isActive to false (deactivating):
        // No special conflicting logic with isComplete here, beyond what's handled above.
        // A season can be inactive and complete, or inactive and not complete.

        // 4. If setting isComplete to false (un-completing):
        // No special conflicting logic with isActive.
        // An un-completed season can be active or inactive.


        // If, after all logic, dataToUpdate is empty (e.g., toggling to the same state),
        // we can choose to return the existing season or proceed with an update that changes nothing.
        // Prisma update with same data is usually a no-op but might hit the DB.
        if (Object.keys(dataToUpdate).length === 0) {
            return existingSeason; // No actual changes to make
        }

        const updatedSeason = await prisma.season.update({
            where: { id: seasonId },
            data: dataToUpdate,
        });
        return updatedSeason;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error updating season status:", error.message, error.stack);
        throw new AppError('Could not update season status.', 500);
    }
};


export const deleteSeason = async (id) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const seasonId = parseInt(id, 10);
        if (isNaN(seasonId)) throw new AppError('Invalid season ID format.', 400);

        const existingSeason = await prisma.season.findUnique({ where: { id: seasonId } });
        if (!existingSeason) throw new AppError('Season not found for deletion.', 404);

        // Enhanced checks for related entities
        const relatedChecks = [
            { model: prisma.semester, countField: 'semesters', message: 'associated semesters' }, // Already checked
            { model: prisma.studentCourseRegistration, countField: 'registrations', message: 'associated course registrations' },
            { model: prisma.result, countField: 'results', message: 'associated results' },
            { model: prisma.schoolFee, countField: 'schoolFees', message: 'associated school fees' },
            { model: prisma.schoolFeeList, countField: 'schoolFeeLists', message: 'associated school fee lists' },
            { model: prisma.paymentReceipt, countField: 'paymentReceipts', message: 'associated payment receipts' },
            { model: prisma.staffCourse, countField: 'staffCourses', message: 'associated staff course assignments' },
            { model: prisma.hostelBooking, countField: 'hostelBookings', message: 'associated hostel bookings' },
            // Check students admitted or current in this season
            { model: prisma.student, relation: 'admissionSeason', message: 'students admitted in this season' },
            { model: prisma.student, relation: 'currentSeason', message: 'students currently in this season' },

        ];

        for (const check of relatedChecks) {
            let count;
            if (check.relation === 'admissionSeason') {
                count = await check.model.count({ where: { admissionSeasonId: seasonId } });
            } else if (check.relation === 'currentSeason') {
                count = await check.model.count({ where: { currentSeasonId: seasonId } });
            }
            else {
                count = await check.model.count({ where: { seasonId } });
            }

            if (count > 0) {
                throw new AppError(`Cannot delete season. It has ${check.message}.`, 400);
            }
        }

        await prisma.season.delete({ where: { id: seasonId } });
        return { message: 'Season deleted successfully' };
    } catch (error) {
        if (error.code === 'P2003') { // Foreign key constraint failed
            throw new AppError('Cannot delete season. It is referenced by other essential records.', 400);
        }
        if (error instanceof AppError) throw error;
        console.error("Error deleting season:", error);
        throw new AppError('Could not delete season.', 500);
    }
};

