// src/routes/exam.routes.js
import { Router } from 'express';
import * as ExamController from '../controllers/exam.controller.js';
import {
    authenticateToken,
    authorizeExamManager,
    authorizeDepartmentalExamPersonnel,
    authorize // General
} from '../middlewares/auth.middleware.js';
import questionRoutes from './question.routes.js';
import examSessionRoutes from './examSession.routes.js';


const router = Router();

// Who can create exams? Admin, Permitted ICT, HOD, DEAN, EXAMINER, Lecturers for their courses
// The service layer `canUserManageExamForCourse` will do the fine-grained check.
// The route middleware provides a broader first pass.
router.post('/',
    authenticateToken,
    authorize(['admin', 'ictstaff', 'HOD', 'DEAN', 'EXAMINER', 'LECTURER']), // Broad access, service validates
    ExamController.createExam
);

// Who can view all exams? Depends on filters and roles.
// Admin, ICT Staff (all), HOD/DEAN/EXAMINER (department/faculty specific), Lecturer (theirs or assigned)
router.get('/',
    authenticateToken,
    authorize(['admin', 'ictstaff', 'HOD', 'DEAN', 'EXAMINER', 'LECTURER', 'student']), // Broad, service filters
    ExamController.getAllExams
);

router.route('/:id')
    .get(
        authenticateToken,
        authorize(['admin', 'ictstaff', 'HOD', 'DEAN', 'EXAMINER', 'LECTURER', 'student']), // Students might view active exam details
        ExamController.getExamById
    )
    .put(
        authenticateToken,
        authorize(['admin', 'ictstaff', 'HOD', 'DEAN', 'EXAMINER', 'LECTURER']), // Broad, service validates ownership/privilege
        ExamController.updateExam
    )
    .delete(
        authenticateToken,
        authorize(['admin', 'ictstaff', 'HOD', 'DEAN', 'EXAMINER', 'LECTURER']), // Broad, service validates
        ExamController.deleteExam
    );

// NEW ROUTE: Verify Exam Access Password
// Any user who might need to view an exam (lecturer, student) can try to verify.
router.post('/:id/verify-password',
    authenticateToken,
    authorize(['admin', 'ictstaff', 'HOD', 'DEAN', 'EXAMINER', 'LECTURER', 'student']),
    ExamController.verifyExamAccessPassword
);

// NEW ROUTE: Update Exam Status
// Only users authorized to manage exams should be able to change status.
router.patch('/:id/status', // Using PATCH for partial update (only status field)
    authenticateToken,
    authorize(['admin', 'ictstaff', 'HOD', 'DEAN', 'EXAMINER', 'LECTURER']), // Roles that can manage exam status
    ExamController.updateExamStatus
);


router.use('/:examId/questions', questionRoutes);
router.use('/:examId/sessions', examSessionRoutes);

export default router;