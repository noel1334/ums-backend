import { Router } from 'express';
import * as StudentController from '../controllers/student.controller.js';
import {
    authenticateToken,
    authorizeAdmin, // Already defined as authorize(['admin'])
    authorize,
} from '../middlewares/auth.middleware.js';
import uploadImageMiddleware from '../middlewares/uploadImage.middleware.js'; // Imported
import AppError from '../utils/AppError.js';
import { LecturerRole } from '../generated/prisma/index.js'; // To correctly use HOD enum

const router = Router();

// --- Reusable Authorization Constants ---

// For student to view/update their own profile
const canAccessOwnStudentProfile = authorize(['student']);

// For admins and ICT staff who can create new student records
const canCreateStudent = authorize(['admin', 'ictstaff']);

// For admins and HODs who can view all students or departmental students
const canViewAllOrDepartmentalStudents = authorize(['admin', 'ictstaff', 'HOD']); 

// For lecturers (including HOD/Examiner) to view students in their assigned courses
const canViewStudentsInAssignedCourses = authorize(['lecturer', 'HOD', 'ictstaff', 'EXAMINER']);


// --- Custom Authorization Middlewares ---

// Allows student to view their own profile, or admin/HOD to view any student record
const authorizeSelfOrAdminOrHODForStudentView = async (req, res, next) => {
    try {
        const studentIdParam = parseInt(req.params.id, 10);
        if (isNaN(studentIdParam)) {
            return next(new AppError('Invalid student ID parameter.', 400));
        }

        const { user } = req;
        // Check 1: Admin can view any student
        if (user.type === 'admin') {
            return next();
        }
        if (user.type === 'ictstaff') {
            return next();
        }
        // Check 2: Student can view their own profile
        if (user.type === 'student' && studentIdParam === user.id) {
            return next();
        }
        // Check 3: HOD can view any student (can be refined to departmental later)
        if (user.type === 'lecturer' && user.role === LecturerRole.HOD) {
            return next();
        }

        // If none of the above, deny access.
        return next(new AppError('You are not authorized to view this student record.', 403));
    } catch (error) {
        next(error);
    }
};

// Allows student to update their own profile, or admin to update any student record
const authorizeSelfOrAdminForStudentUpdate = (req, res, next) => {
    try {
        const studentIdParam = parseInt(req.params.id, 10);
        if (isNaN(studentIdParam)) {
            return next(new AppError('Invalid student ID parameter.', 400));
        }
        // Check 1: Admin can update any
        if (req.user.type === 'admin') {
            return next();
        }
        if (req.user.type === 'ictstaff') {
            return next();
        }
        // Check 2: Student can update their own
        if (req.user.type === 'student' && studentIdParam === req.user.id) {
            return next();
        }

        return next(new AppError('You are not authorized to update this student record.', 403));
    } catch (error) {
        next(error);
    }
};


// --- Routes ---

// Routes for the logged-in user's own profile and data
router.route('/me')
    .get(authenticateToken, canAccessOwnStudentProfile, StudentController.getMyProfile)
    // INJECTED: uploadImageMiddleware for student profile photo updates
    .put(authenticateToken, canAccessOwnStudentProfile, uploadImageMiddleware('profileImg', 'single'), StudentController.updateMyProfile);

router.get(
    '/me/registrable-courses',
    authenticateToken,
    canAccessOwnStudentProfile,
    StudentController.getMyRegistrableCourses
);

router.get(
    '/me/program-curriculum-courses',
    authenticateToken,
    canAccessOwnStudentProfile,
    StudentController.getMyProgramCurriculumCourses
);

// Route for a lecturer to see students in their courses
router.route('/lecturer/my-courses/students')
    .get(authenticateToken, canViewStudentsInAssignedCourses, StudentController.getMyCourseStudents);

// Routes for general student list and creation (Admin/HOD access)
router.route('/')
    .post(authenticateToken, canCreateStudent, uploadImageMiddleware('profileImg', 'single'), StudentController.createStudent)
    .get(authenticateToken, canViewAllOrDepartmentalStudents, StudentController.getAllStudents);

router.post('/batch-create',
    authenticateToken,
    canCreateStudent,
    StudentController.batchCreateStudents
);

router.get(
    '/departmental',
    authenticateToken,
    canViewAllOrDepartmentalStudents,
    StudentController.getDepartmentStudents
);

// Routes for a specific student by ID
router.route('/:id')
    .get(
        authenticateToken,
        authorizeSelfOrAdminOrHODForStudentView, 
        StudentController.getStudentById
    )
    .put(
        authenticateToken,
        // INJECTED: uploadImageMiddleware for admin updates on specific student photos
        uploadImageMiddleware('profileImg', 'single'), 
        authorizeSelfOrAdminForStudentUpdate, 
        StudentController.updateStudent
    )
    .delete(
        authenticateToken,
        authorizeAdmin, 
        StudentController.deleteStudent
    );

export default router;