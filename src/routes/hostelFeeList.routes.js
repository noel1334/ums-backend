// src/routes/hostelFeeList.routes.js

import { Router } from 'express';
import * as HostelFeeListController from '../controllers/hostelFeeList.controller.js';
import { authenticateToken, authorize } from '../middlewares/auth.middleware.js';

const router = Router();

// Authorization roles for managing hostel fee lists (Admin/ICT Staff for creation/modification)
const canManageHostelFees = authorize(['admin', 'ictstaff']);
// Authorization for viewing general hostel fee lists (e.g., in an admin panel)
const canViewAllHostelFees = authorize(['admin', 'ictstaff', 'lecturer', 'student']);


// --- NEW ROUTE (Most Specific - place first to ensure it's matched) ---
// This route is specifically designed for students to see only relevant fees
router.get('/my-fees', authenticateToken, authorize(['student']), HostelFeeListController.getStudentHostelFees);

// --- General Hostel Fee List Management (CRUD for Admin/ICT Staff) ---
router.post('/', authenticateToken, canManageHostelFees, HostelFeeListController.createHostelFeeList);
router.put('/:id', authenticateToken, canManageHostelFees, HostelFeeListController.updateHostelFeeList);
router.delete('/:id', authenticateToken, canManageHostelFees, HostelFeeListController.deleteHostelFeeList);

// --- Public / General Viewing (less specific than /my-fees) ---
// Note: Students are allowed here, but 'getStudentHostelFees' is more tailored.
router.get('/', authenticateToken, canViewAllHostelFees, HostelFeeListController.getAllHostelFeeLists);
router.get('/:id', authenticateToken, canViewAllHostelFees, HostelFeeListController.getHostelFeeListById);


export default router;