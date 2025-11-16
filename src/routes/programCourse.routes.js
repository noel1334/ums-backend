// src/routes/programCourse.routes.js
import { Router } from 'express';
import * as ProgramCourseController from '../controllers/programCourse.controller.js';
import { authenticateToken, authorizeCourseManager, authorize, authorizeAdmin } from '../middlewares/auth.middleware.js'; // Assuming authorizeAdmin exists

const router = Router();

router.post('/', authenticateToken, authorizeCourseManager, ProgramCourseController.addCourseToProgram);
router.get('/', authenticateToken, authorize(['admin', 'ictstaff', 'lecturer', 'student', 'HOD', 'DEAN']), ProgramCourseController.getAllProgramCourses);
router.get('/:id', authenticateToken, authorize(['admin', 'ictstaff', 'lecturer', 'student', 'HOD', 'DEAN']), ProgramCourseController.getProgramCourseById);

// Update a specific program-course mapping (e.g., change isElective)
router.put('/:id', authenticateToken, authorizeCourseManager, ProgramCourseController.updateProgramCourse);

// Set the active status of a specific program-course mapping
router.patch('/:id/status', authenticateToken, authorizeCourseManager, ProgramCourseController.setProgramCourseActiveStatus);
router.delete('/:id', authenticateToken, authorizeAdmin, ProgramCourseController.deleteProgramCourseMappingPermanently);

export default router;