// src/routes/coursePrerequisite.routes.js
import { Router } from 'express';
import * as CoursePrerequisiteController from '../controllers/coursePrerequisite.controller.js';
import { authenticateToken, authorizeCourseManager, authorize } from '../middlewares/auth.middleware.js';

const router = Router({ mergeParams: true }); // mergeParams allows access to :courseId when nested

// This single GET '/' route handles both nested and top-level GET requests
router.get('/',
    authenticateToken,
    authorize(['admin', 'ictstaff', 'lecturer', 'student', 'HOD', 'DEAN']), // General access
    (req, res, next) => {
        console.log('[COURSE_PREREQ_ROUTE] GET / triggered. req.params.courseId =', req.params.courseId); // Debug log
        if (req.params.courseId) {
            // This means the route was matched via /courses/:courseId/prerequisites/
            console.log('[COURSE_PREREQ_ROUTE] Detected nested route, calling getPrerequisitesForCourse.');
            return CoursePrerequisiteController.getPrerequisitesForCourse(req, res, next);
        } else {
            // This means the route was matched via /api/v1/course-prerequisites/
            console.log('[COURSE_PREREQ_ROUTE] Detected top-level route, calling getAllCoursePrerequisites.');
            return CoursePrerequisiteController.getAllCoursePrerequisites(req, res, next);
        }
    }
);

// POST to create a prerequisite link.
// Handles: POST /courses/:courseId/prerequisites/ (controller combines params and body)
// Handles: POST /api/v1/course-prerequisites/ (controller expects courseId & prerequisiteId in body)
router.post('/',
    authenticateToken,
    authorizeCourseManager, // Only managers can define prerequisites
    CoursePrerequisiteController.addCoursePrerequisite
);

// DELETE a specific prerequisite link for a course.
// This route is specific to the NESTED context: DELETE /courses/:courseId/prerequisites/:prerequisiteId
// The :prerequisiteId in this path refers to the ID of the prerequisite course to be unlinked from :courseId.
router.delete('/:prerequisiteId', // This :prerequisiteId is the ID of the *prerequisite course* to remove for :courseId
    authenticateToken,
    authorizeCourseManager,
    CoursePrerequisiteController.removeCoursePrerequisite
);


// Endpoint to find all courses that require a specific course AS a prerequisite
// This is a distinct top-level query.
// GET /api/v1/course-prerequisites/courses-requiring/:prerequisiteId (where :prerequisiteId is a course ID)
router.get('/courses-requiring/:prerequisiteId', // :prerequisiteId refers to a courseId here
    authenticateToken,
    authorize(['admin', 'ictstaff', 'lecturer', 'student', 'HOD', 'DEAN']),
    CoursePrerequisiteController.getCoursesRequiringPrerequisite
);

export default router;