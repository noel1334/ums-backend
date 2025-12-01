import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import { SemesterType } from '../generated/prisma/index.js'; // Or your actual path

// Helper to map SemesterType to semesterNumber
const semesterTypeToNumber = (type) => {
    switch (type) {
        case SemesterType.FIRST: return 1;
        case SemesterType.SECOND: return 2;
        case SemesterType.SUMMER: return 3;
        default: throw new AppError('Invalid semester type for number mapping.', 400);
    }
};

export const createSemester = async (semesterData) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const {
            name,
            seasonId,
            type,
            startDate,
            endDate,
            isActive,
            areStudentEditsLocked,      // New field
            areLecturerScoreEditsLocked // New field
        } = semesterData;

        if (!name || !seasonId || !type) {
            throw new AppError('Semester name, season ID, and type are required.', 400);
        }
        if (!Object.values(SemesterType).includes(type)) {
            throw new AppError(`Invalid semester type: ${type}. Must be one of ${Object.values(SemesterType).join(', ')}.`, 400);
        }

        const parsedSeasonId = parseInt(seasonId, 10);
        if (isNaN(parsedSeasonId)) throw new AppError('Invalid season ID format.', 400);

        const season = await prisma.season.findUnique({ where: { id: parsedSeasonId } });
        if (!season) throw new AppError(`Season with ID ${parsedSeasonId} not found.`, 404);

        const semesterNumber = semesterTypeToNumber(type);

        const data = {
            name,
            seasonId: parsedSeasonId,
            type,
            semesterNumber,
        };
        if (startDate) data.startDate = new Date(startDate);
        if (endDate) data.endDate = new Date(endDate);
        if (typeof isActive === 'boolean') data.isActive = isActive;
        // Add new fields, respecting their boolean nature and defaults (handled by Prisma if not provided)
        if (typeof areStudentEditsLocked === 'boolean') data.areStudentEditsLocked = areStudentEditsLocked;
        if (typeof areLecturerScoreEditsLocked === 'boolean') data.areLecturerScoreEditsLocked = areLecturerScoreEditsLocked;


        if (data.isActive) {
            await prisma.semester.updateMany({
                where: { seasonId: parsedSeasonId, isActive: true },
                data: { isActive: false },
            });
        }

        const semester = await prisma.semester.create({
            data,
            include: { season: true }
        });
        return semester;
    } catch (error) {
        if (error.code === 'P2002') {
            const target = error.meta?.target;
            if (target && target.includes('name') && target.includes('seasonId')) {
                throw new AppError('A semester with this name already exists for this season.', 409);
            }
            if (target && target.includes('type') && target.includes('seasonId')) {
                throw new AppError('This semester type already exists for this season.', 409);
            }
            if (target && target.includes('semesterNumber') && target.includes('seasonId')) {
                throw new AppError('This semester number already exists for this season.', 409);
            }
            throw new AppError('A unique constraint was violated.', 409); // Generic fallback
        }
        if (error instanceof AppError) throw error;
        console.error("Error creating semester:", error);
        throw new AppError('Could not create semester.', 500);
    }
};

export const getAllSemesters = async (query) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const {
            seasonId,
            isActive,
            type,
            name,   // <--- Add this
            search, // <--- Add this (just in case frontend sends 'search')
            page = 1,
            limit = 10
        } = query;

        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;

        const where = {};
        
        // 1. Handle Filters
        if (seasonId) {
            const parsedSeasonId = parseInt(seasonId, 10);
            if (isNaN(parsedSeasonId)) throw new AppError('Invalid seasonId format in query.', 400);
            where.seasonId = parsedSeasonId;
        }
        if (isActive !== undefined) where.isActive = isActive === 'true' || isActive === true;
        if (type) {
            if (!Object.values(SemesterType).includes(type)) {
                throw new AppError(`Invalid semester type for filtering: ${type}.`, 400);
            }
            where.type = type;
        }

        // 2. Handle Search (The missing part)
        const searchTerm = name || search;
        if (searchTerm) {
            // This allows searching by Semester Name (e.g., "First") 
            // OR Season Name (e.g., "2024")
            where.OR = [
                { 
                    name: { 
                        contains: searchTerm, 
                        mode: 'insensitive' 
                    } 
                },
                { 
                    season: { 
                        name: { 
                            contains: searchTerm, 
                            mode: 'insensitive' 
                        } 
                    } 
                }
            ];
        }

        const [semesters, totalSemesters] = await prisma.$transaction([
            prisma.semester.findMany({
                where,
                include: { season: true },
                orderBy: [
                    { season: { name: 'desc' } },
                    { semesterNumber: 'asc' }
                ],
                skip: skip,
                take: limitNum,
            }),
            prisma.semester.count({ where }),
        ]);

        return {
            semesters,
            totalPages: Math.ceil(totalSemesters / limitNum),
            currentPage: pageNum,
            totalSemesters,
        };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching semesters:", error);
        throw new AppError('Could not retrieve semesters.', 500);
    }
};

export const getSemesterById = async (id) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const semesterId = parseInt(id, 10);
        if (isNaN(semesterId)) throw new AppError('Invalid semester ID format.', 400);

        const semester = await prisma.semester.findUnique({
            where: { id: semesterId },
            include: {
                season: true,
                // Optionally include counts or brief summaries of related data if needed for a detail view
                // _count: { select: { registrations: true, results: true } }
            }
        });
        if (!semester) throw new AppError('Semester not found.', 404);
        return semester;
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching semester by ID:", error);
        throw new AppError('Could not retrieve semester.', 500);
    }
};

export const updateSemester = async (id, updateData) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const semesterId = parseInt(id, 10);
        if (isNaN(semesterId)) throw new AppError('Invalid semester ID format.', 400);

        const {
            name,
            seasonId, // Keep validation for this
            type,
            startDate,
            endDate,
            isActive,
            areStudentEditsLocked,      // New field
            areLecturerScoreEditsLocked // New field
        } = updateData;
        const dataToUpdate = {};

        const existingSemester = await prisma.semester.findUnique({ where: { id: semesterId } });
        if (!existingSemester) throw new AppError('Semester not found for update.', 404);

        if (name) dataToUpdate.name = name;
        if (startDate) dataToUpdate.startDate = new Date(startDate);
        if (endDate) dataToUpdate.endDate = new Date(endDate);
        if (typeof isActive === 'boolean') dataToUpdate.isActive = isActive;
        // Add new fields
        if (typeof areStudentEditsLocked === 'boolean') dataToUpdate.areStudentEditsLocked = areStudentEditsLocked;
        if (typeof areLecturerScoreEditsLocked === 'boolean') dataToUpdate.areLecturerScoreEditsLocked = areLecturerScoreEditsLocked;

        if (type) {
            if (!Object.values(SemesterType).includes(type)) {
                throw new AppError(`Invalid semester type: ${type}.`, 400);
            }
            dataToUpdate.type = type;
            dataToUpdate.semesterNumber = semesterTypeToNumber(type);
        }

        if (seasonId && parseInt(seasonId, 10) !== existingSemester.seasonId) {
            throw new AppError('Changing the season of an existing semester is not supported. Create a new semester instead.', 400);
        }

        if (dataToUpdate.isActive === true && existingSemester.isActive === false) {
            await prisma.semester.updateMany({
                where: { seasonId: existingSemester.seasonId, id: { not: semesterId }, isActive: true },
                data: { isActive: false },
            });
        }

        const semester = await prisma.semester.update({
            where: { id: semesterId },
            data: dataToUpdate,
            include: { season: true }
        });
        return semester;
    } catch (error) {
        if (error.code === 'P2002') {
            const target = error.meta?.target;
            if (target && target.includes('name') && target.includes('seasonId')) {
                throw new AppError('A semester with this name already exists for this season.', 409);
            }
            if (target && target.includes('type') && target.includes('seasonId')) {
                throw new AppError('This semester type already exists for this season.', 409);
            }
            if (target && target.includes('semesterNumber') && target.includes('seasonId')) {
                throw new AppError('This semester number already exists for this season.', 409);
            }
            throw new AppError('A unique constraint was violated during update.', 409);
        }
        if (error instanceof AppError) throw error;
        console.error("Error updating semester:", error);
        throw new AppError('Could not update semester.', 500);
    }
};

export const deleteSemester = async (id) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const semesterId = parseInt(id, 10);
        if (isNaN(semesterId)) throw new AppError('Invalid semester ID format.', 400);

        const existingSemester = await prisma.semester.findUnique({ where: { id: semesterId } });
        if (!existingSemester) throw new AppError('Semester not found for deletion.', 404);

        // Enhanced checks for related entities
        const relatedChecks = [
            { model: prisma.studentCourseRegistration, countField: 'registrations', message: 'associated course registrations' },
            { model: prisma.result, countField: 'results', message: 'associated results' },
            { model: prisma.staffCourse, countField: 'staffCourses', message: 'associated staff course assignments' },
            { model: prisma.schoolFee, countField: 'schoolFees', message: 'associated school fees' },
            // Scores are linked via StudentCourseRegistration, so the first check covers them indirectly.
        ];

        for (const check of relatedChecks) {
            const count = await check.model.count({ where: { semesterId } });
            if (count > 0) {
                throw new AppError(`Cannot delete semester. It has ${check.message}.`, 400);
            }
        }
        // Also check courses that directly link to this semester (if semesterId on Course is not nullable and used this way)
        const courseCount = await prisma.course.count({ where: { semesterId } });
        if (courseCount > 0) {
            throw new AppError('Cannot delete semester. It is directly linked to courses.', 400)
        }


        await prisma.semester.delete({ where: { id: semesterId } });
        return { message: 'Semester deleted successfully' };
    } catch (error) {
        if (error.code === 'P2003') { // Foreign key constraint failed
            throw new AppError('Cannot delete semester. It is referenced by other essential records.', 400);
        }
        if (error instanceof AppError) throw error;
        console.error("Error deleting semester:", error);
        throw new AppError('Could not delete semester.', 500);
    }
};