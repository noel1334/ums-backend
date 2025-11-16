// src/services/schoolFeeList.service.js
import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import { LecturerRole, NationalityType } from '../generated/prisma/index.js'; // Ensure imports

const schoolFeeListPublicSelection = {
    id: true, amount: true, description: true,
    level: { select: { id: true, name: true } },
    department: { select: { id: true, name: true, faculty: { select: { id: true, name: true, facultyCode: true } } } }, // Added Faculty Code
    program: { select: { id: true, name: true } },
    faculty: { select: { id: true, name: true } },  // NEW: Select faculty
    season: { select: { id: true, name: true } },
    nationality: true, // Make sure we select the nationality
    createdAt: true,
    updatedAt: true,
};

export const createSchoolFeeItem = async (feeItemData) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const { levelId, departmentId, programId, facultyId, seasonId, amount, description, nationality } = feeItemData; // Include facultyId

        if (!levelId || !seasonId || amount === undefined || amount === null) {
            throw new AppError('Level ID, Season ID, and Amount are required.', 400);
        }
        // Validation for IDs and amount
        const pLevelId = parseInt(levelId, 10);
        const pSeasonId = parseInt(seasonId, 10);
        const fAmount = parseFloat(amount);

        if (isNaN(pLevelId) || isNaN(pSeasonId) || isNaN(fAmount)) throw new AppError('Invalid ID or amount format.', 400);
        if (fAmount <= 0) throw new AppError('Amount must be positive.', 400);

        // Look up the related entities
        const level = await prisma.level.findUnique({ where: { id: pLevelId } });
        if (!level) throw new AppError(`Level ID ${pLevelId} not found.`, 404);
        const season = await prisma.season.findUnique({ where: { id: pSeasonId } });
        if (!season) throw new AppError(`Season ID ${pSeasonId} not found.`, 404);

        let pDepartmentId = null;
        if (departmentId !== undefined && departmentId !== null && String(departmentId).trim() !== '') {
            pDepartmentId = parseInt(departmentId, 10);
            if (isNaN(pDepartmentId)) throw new AppError('Invalid Department ID.', 400);
            const dept = await prisma.department.findUnique({ where: { id: pDepartmentId } });
            if (!dept) throw new AppError(`Department ID ${pDepartmentId} not found.`, 404);
        }
        let pProgramId = null;
        if (programId !== undefined && programId !== null && String(programId).trim() !== '') {
            pProgramId = parseInt(programId, 10);
            if (isNaN(pProgramId)) throw new AppError('Invalid Program ID.', 400);
            const prog = await prisma.program.findUnique({ where: { id: pProgramId } });
            if (!prog) throw new AppError(`Program ID ${pProgramId} not found.`, 404);
        }

        let pFacultyId = null;  // NEW: Handle Faculty
        if (facultyId !== undefined && facultyId !== null && String(facultyId).trim() !== '') {
            pFacultyId = parseInt(facultyId, 10);
            if (isNaN(pFacultyId)) throw new AppError('Invalid Faculty ID.', 400);
            const faculty = await prisma.faculty.findUnique({ where: { id: pFacultyId } });
            if (!faculty) throw new AppError(`Faculty ID ${pFacultyId} not found.`, 404);
        }


        const newItem = await prisma.schoolFeeList.create({
            data: {
                levelId: pLevelId, departmentId: pDepartmentId, programId: pProgramId, facultyId: pFacultyId, // Add facultyId to data
                seasonId: pSeasonId, amount: fAmount, description: description || null,
                nationality: nationality,
            },
            select: { ...schoolFeeListPublicSelection, createdAt: true, updatedAt: true }
        });
        return newItem;
    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2002') throw new AppError('School fee item combination already exists.', 409);
        console.error("Error creating school fee item:", error.message, error.stack);
        throw new AppError('Could not create school fee item.', 500);
    }
};


export const getApplicableSchoolFeeList = async (query, requestingUser) => {
    try {
        if (!prisma) throw new AppError('Prisma client is not available', 500);
        const { page = 1, limit = 20, seasonId } = query;

        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
            // console.log(requestingUser, 'Requesting User' )
            // console.log("Nationality:", requestingUser.admissionOfferDetails?.applicationProfile?.bioData?.nationality);

        if (isNaN(pageNum) || pageNum < 1) throw new AppError('Invalid page number.', 400);
        if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) throw new AppError('Invalid limit value (1-100).', 400);
        const skip = (pageNum - 1) * limitNum;

        if (requestingUser.type === 'student') {
            if (!requestingUser.currentLevelId || !requestingUser.departmentId || !requestingUser.programId || !requestingUser.studentDetails) {
                throw new AppError('Student profile is incomplete (current level, department, program, or nationality missing).', 400);
            }
            if (!seasonId) {
                throw new AppError('Season ID is required for students to view applicable fees.', 400);
            }
            const parsedSeasonId = parseInt(seasonId, 10);
            if (isNaN(parsedSeasonId)) throw new AppError('Invalid Season ID provided.', 400);
            const studentNationality =  requestingUser.admissionOfferDetails?.applicationProfile?.bioData?.nationality;
            console.log(studentNationality, 'Student' )
        

            let where = {};
            let feeItem = null;

            // 1. Program, Level, Nationality, and Season
            where = {
                programId: requestingUser.programId,
                levelId: requestingUser.currentLevelId,
                seasonId: parsedSeasonId,
                nationality: studentNationality,
                departmentId: requestingUser.departmentId
            };

            feeItem = await prisma.schoolFeeList.findFirst({
                where,
                select: schoolFeeListPublicSelection,
                orderBy: [{ amount: 'asc' }],
            });

            if (feeItem) {
              return {
                  items: [feeItem], // Return as an array for consistency
                  totalPages: 1,
                  currentPage: 1,
                  limit: 1,
                  totalItems: 1,
              };
            }
             // 2. Department, Level, Nationality, and Season (Program Agnostic)
             where = {
              departmentId: requestingUser.departmentId,
              levelId: requestingUser.currentLevelId,
              seasonId: parsedSeasonId,
              nationality: studentNationality,
              programId: null,
          };
           feeItem = await prisma.schoolFeeList.findFirst({
              where: where,
              select: schoolFeeListPublicSelection,
              orderBy: [{ amount: 'asc' }],
          });
           if (feeItem) {
             return {
                 items: [feeItem], // Return as an array for consistency
                 totalPages: 1,
                 currentPage: 1,
                 limit: 1,
                 totalItems: 1,
             };
           }
            // 3. Faculty, Level, Nationality, and Season (Faculty-specific fee)
            if (requestingUser.department?.faculty?.id) { // Added this check
                where = {
                    facultyId: requestingUser.department.faculty.id,
                    levelId: requestingUser.currentLevelId,
                    seasonId: parsedSeasonId,
                    nationality: studentNationality,
                    programId: null,
                    departmentId: null,
                };
                feeItem = await prisma.schoolFeeList.findFirst({
                    where: where,
                    select: schoolFeeListPublicSelection,
                    orderBy: [{ amount: 'asc' }],
                });
                if (feeItem) {
                  return {
                      items: [feeItem], // Return as an array for consistency
                      totalPages: 1,
                      currentPage: 1,
                      limit: 1,
                      totalItems: 1,
                  };
                }
            }
            // 4. Level, Nationality, and Season (Department and Program Agnostic)
            where = {
                levelId: requestingUser.currentLevelId,
                seasonId: parsedSeasonId,
                nationality: studentNationality,
                departmentId: null,
                programId: null,
                facultyId: null //  departmentId set to null
            };
            feeItem = await prisma.schoolFeeList.findFirst({
                where: where,
                select: schoolFeeListPublicSelection,
                orderBy: [{ amount: 'asc' }],
            });
            if (feeItem) {
                return {
                    items: [feeItem],
                    totalPages: 1,
                    currentPage: 1,
                    limit: 1,
                    totalItems: 1,
                };
            }

            // 5. Program, Department, Level, and Season (No Nationality - general rule)
            where = {
                programId: requestingUser.programId,
                departmentId: requestingUser.departmentId,
                levelId: requestingUser.currentLevelId,
                seasonId: parsedSeasonId,
                nationality: null,
            };
            const feeItem5 = await prisma.schoolFeeList.findFirst({
                where: where,
                select: schoolFeeListPublicSelection,
                orderBy: [{ amount: 'asc' }],
            });
            if (feeItem5) {
                return {
                    items: [feeItem5], // Return as an array for consistency
                    totalPages: 1,
                    currentPage: 1,
                    limit: 1,
                    totalItems: 1,
                };
            }
              // 6. Program, Level, and Season (No Nationality - Department Agnostic)
              where = {
                programId: requestingUser.programId,
                departmentId: null,
                levelId: requestingUser.currentLevelId,
                seasonId: parsedSeasonId,
                nationality: null,
            };
            const feeItem6 = await prisma.schoolFeeList.findFirst({
                where: where,
                select: schoolFeeListPublicSelection,
                orderBy: [{ amount: 'asc' }],
            });
             if (feeItem6) {
                return {
                    items: [feeItem6], // Return as an array for consistency
                    totalPages: 1,
                    currentPage: 1,
                    limit: 1,
                    totalItems: 1,
                };
            }

            // 7. Department, Level, and Season, no nationality (program-agnostic for the department)
            where = {
                programId: null,
                departmentId: requestingUser.departmentId,
                levelId: requestingUser.currentLevelId,
                seasonId: parsedSeasonId,
                nationality: null,
            };
            const feeItem7 = await prisma.schoolFeeList.findFirst({
                where: where,
                select: schoolFeeListPublicSelection,
                orderBy: [{ amount: 'asc' }],
            });
             if (feeItem7) {
                return {
                    items: [feeItem7], // Return as an array for consistency
                    totalPages: 1,
                    currentPage: 1,
                    limit: 1,
                    totalItems: 1,
                };
            }
            // 8. Level, and Season, no nationality (general fee for the level)
            where = {
                programId: null,
                departmentId: null,
                levelId: requestingUser.currentLevelId,
                seasonId: parsedSeasonId,
                nationality: null,
                facultyId: null, // Added faculty to the null condition

            };
             const feeItem8 = await prisma.schoolFeeList.findFirst({
                where: where,
                select: schoolFeeListPublicSelection,
                orderBy: [{ amount: 'asc' }],
            });
            if (feeItem8) {
                return {
                    items: [feeItem8],
                    totalPages: 1,
                    currentPage: 1,
                    limit: 1,
                    totalItems: 1,
                };
            }

            return { items: [], totalPages: 0, currentPage: 1, limit: limitNum, totalItems: 0 }; // No fee found
        } else if (requestingUser.type === 'admin' || (requestingUser.type === 'lecturer' && requestingUser.role === LecturerRole.HOD)) {
            // Admin or HOD logic - simplified
            const whereClause = {};

            if (seasonId !== undefined && String(seasonId).trim() !== '') {
                const pSeasonId = parseInt(seasonId, 10);
                if (isNaN(pSeasonId)) throw new AppError('Invalid Season ID for query.', 400);
                whereClause.seasonId = pSeasonId;
            }

            const items = await prisma.schoolFeeList.findMany({
                where: whereClause,
                select: schoolFeeListPublicSelection,
                orderBy: [{ season: { name: 'desc' } }, { level: { name: 'asc' } }, { departmentId: 'asc' }, { programId: 'asc' }, { facultyId: 'asc' }, { amount: 'asc' }], // More deterministic sort
                skip,
                take: limitNum,
            });
            const totalItems = await prisma.schoolFeeList.count({ where: whereClause });

            return { items, totalPages: Math.ceil(totalItems / limitNum), currentPage: pageNum, limit: limitNum, totalItems };
        } else {
            throw new AppError('You are not authorized to view this school fee list.', 403);
        }
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error fetching school fee list:", error.message, error.stack);
        throw new AppError('Could not retrieve school fee list.', 500);
    }
};
export const updateSchoolFeeItem = async (id, updateData) => { // Admin only
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const itemId = parseInt(id, 10);
        if (isNaN(itemId)) throw new AppError('Invalid item ID.', 400);
        const existingItem = await prisma.schoolFeeList.findUnique({ where: { id: itemId } });
        if (!existingItem) throw new AppError('School fee item not found for update.', 404);

        const dataForDb = {};
        // Iterate over potential fields to update and validate them
        if (updateData.hasOwnProperty('levelId')) {
            const pLevelId = parseInt(updateData.levelId, 10);
            if (isNaN(pLevelId)) throw new AppError('Invalid Level ID for update.', 400);
            dataForDb.levelId = pLevelId;
        }
        if (updateData.hasOwnProperty('departmentId')) {
            dataForDb.departmentId = (updateData.departmentId === null || String(updateData.departmentId).trim() === '' || updateData.departmentId === 'null')
                ? null
                : parseInt(updateData.departmentId, 10);
            if (updateData.departmentId !== null && String(updateData.departmentId).trim() !== '' && updateData.departmentId !== 'null' && isNaN(dataForDb.departmentId)) {
                throw new AppError('Invalid Department ID for update.', 400);
            }
        }
        if (updateData.hasOwnProperty('programId')) {
            dataForDb.programId = (updateData.programId === null || String(updateData.programId).trim() === '' || updateData.programId === 'null')
                ? null
                : parseInt(updateData.programId, 10);
            if (updateData.programId !== null && String(updateData.programId).trim() !== '' && updateData.programId !== 'null' && isNaN(dataForDb.programId)) {
                throw new AppError('Invalid Program ID for update.', 400);
            }
        }

        if (updateData.hasOwnProperty('facultyId')) {  // <--- NEW
            dataForDb.facultyId = (updateData.facultyId === null || String(updateData.facultyId).trim() === '' || updateData.facultyId === 'null')
                ? null
                : parseInt(updateData.facultyId, 10);
            if (updateData.facultyId !== null && String(updateData.facultyId).trim() !== '' && updateData.facultyId !== 'null' && isNaN(dataForDb.facultyId)) {
                throw new AppError('Invalid Faculty ID for update.', 400);
            }
        }

        if (updateData.hasOwnProperty('seasonId')) {
            const pSeasonId = parseInt(updateData.seasonId, 10);
            if (isNaN(pSeasonId)) throw new AppError('Invalid Season ID for update.', 400);
            dataForDb.seasonId = pSeasonId;
        }
        if (updateData.hasOwnProperty('amount')) {
            const fAmount = parseFloat(updateData.amount);
            if (isNaN(fAmount) || fAmount <= 0) throw new AppError('Amount must be a positive number.', 400);
            dataForDb.amount = fAmount;
        }
        if (updateData.hasOwnProperty('description')) {
            dataForDb.description = (updateData.description === "" || updateData.description === null) ? null : String(updateData.description);
        }

        if (updateData.hasOwnProperty('nationality')) {  // <--- NEW
            dataForDb.nationality = updateData.nationality;
        }

        if (Object.keys(dataForDb).length === 0) {
            throw new AppError('No valid fields provided for update.', 400);
        }
        // TODO: Add existence checks for foreign key IDs if they are being changed (levelId, seasonId, departmentId, programId)

        const updatedItem = await prisma.schoolFeeList.update({
            where: { id: itemId }, data: dataForDb,
            select: { ...schoolFeeListPublicSelection, createdAt: true, updatedAt: true }
        });
        return updatedItem;
    } catch (error) {
        if (error instanceof AppError) throw error;
        if (error.code === 'P2002') throw new AppError('Update failed: This school fee item combination (level, department, program, season, description) already exists.', 409);
        console.error("Error updating school fee item:", error.message, error.stack);
        throw new AppError('Could not update school fee item.', 500);
    }
};

export const deleteSchoolFeeItem = async (id) => { // Admin only
    try {
        if (!prisma) throw new AppError('Prisma client is not available.', 500);
        const itemId = parseInt(id, 10);
        if (isNaN(itemId)) throw new AppError('Invalid item ID.', 400);
        const existingItem = await prisma.schoolFeeList.findUnique({ where: { id: itemId } });
        if (!existingItem) throw new AppError('School fee item not found for deletion.', 404);
        await prisma.schoolFeeList.delete({ where: { id: itemId } });
        return { message: 'School fee list item deleted successfully' };
    } catch (error) {
        if (error instanceof AppError) throw error;
        console.error("Error deleting school fee item:", error.message, error.stack);
        throw new AppError('Could not delete school fee item.', 500);
    }
};