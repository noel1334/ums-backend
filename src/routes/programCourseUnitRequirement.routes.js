// src/routes/programCourseUnitRequirement.routes.js

import { Router } from 'express';
import * as ProgramCourseUnitRequirementController from '../controllers/programCourseUnitRequirement.controller.js';
import { authenticateToken, authorize } from '../middlewares/auth.middleware.js';

const router = Router();
// Define roles that can manage these requirements (e.g., only admins or specific ICT staff)
const authorizeAdminOrICT = authorize(['admin', 'ictstaff']);

router.route('/')
    .post(
        authenticateToken,
        authorizeAdminOrICT,
        ProgramCourseUnitRequirementController.createProgramCourseUnitRequirement
    )
    .get(
        authenticateToken,
        authorizeAdminOrICT, // Or authorize for lecturers/HODs if they should view
        ProgramCourseUnitRequirementController.getAllProgramCourseUnitRequirements
    );

router.route('/:id')
    .get(
        authenticateToken,
        authorizeAdminOrICT, // Or authorize for lecturers/HODs if they should view
        ProgramCourseUnitRequirementController.getProgramCourseUnitRequirementById
    )
    .put(
        authenticateToken,
        authorizeAdminOrICT,
        ProgramCourseUnitRequirementController.updateProgramCourseUnitRequirement
    )
    .delete(
        authenticateToken,
        authorizeAdminOrICT,
        ProgramCourseUnitRequirementController.deleteProgramCourseUnitRequirement
    );

export default router;