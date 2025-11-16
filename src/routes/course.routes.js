import { Router } from 'express';
import * as CourseController from '../controllers/course.controller.js';
import coursePrerequisiteRoutes from './coursePrerequisite.routes.js';
import { authenticateToken, authorizeCourseManager, authorize, authorizeAdmin } from '../middlewares/auth.middleware.js';

const router = Router();

// Nested routes for prerequisites of a specific course
router.use('/:courseId/prerequisites', coursePrerequisiteRoutes);

router.post('/', 
    authenticateToken, 
    authorizeCourseManager, // Use the correct middleware
    CourseController.createCourse
);

router.patch('/:id/status', 
    authenticateToken, 
    authorizeCourseManager, 
    CourseController.setCourseActiveStatus
);

router.get('/', 
    authenticateToken, 
    authorize(['admin', 'ictstaff', 'lecturer', 'student', 'HOD', 'DEAN', 'EXAMINER']), 
    CourseController.getAllCourses
);

router.route('/:id')
    .get(authenticateToken, authorize(['admin', 'ictstaff', 'lecturer', 'student', 'HOD', 'DEAN', 'EXAMINER']), CourseController.getCourseById)
    .put(authenticateToken, authorizeCourseManager, CourseController.updateCourse)
    .delete(authenticateToken, authorizeAdmin, CourseController.deleteCourse); // Permanent delete is correctly admin-only

export default router;