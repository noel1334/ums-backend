import { Router } from 'express';
import * as FacultyController from '../controllers/faculty.controller.js';
import { authenticateToken, authorizeAdmin } from '../middlewares/auth.middleware.js';
// Optional: import { validateCreateFaculty, validateUpdateFaculty } from '../validators/faculty.validator.js';

const router = Router();

router.route('/')
    .post(authenticateToken, authorizeAdmin, /*validateCreateFaculty,*/ FacultyController.createFaculty)
    .get(authenticateToken, FacultyController.getAllFaculties); // Any authenticated user can view

router.route('/:id')
    .get(authenticateToken, FacultyController.getFacultyById) // Any authenticated user can view
    .put(authenticateToken, authorizeAdmin, /*validateUpdateFaculty,*/ FacultyController.updateFaculty)
    .delete(authenticateToken, authorizeAdmin, FacultyController.deleteFaculty);

export default router;