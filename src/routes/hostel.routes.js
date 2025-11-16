/**
 * Hostel routes for CRUD operations and retrieval.
 * Only admins can create, update, or delete hostels.
 * All authenticated users can view hostels.
 */
import { Router } from 'express';
import * as HostelController from '../controllers/hostel.controller.js';
import { authenticateToken, authorizeAdmin, authorize } from '../middlewares/auth.middleware.js';
import hostelRoomRoutes from './hostelRoom.routes.js';

const router = Router();

router.use('/:hostelId/rooms', hostelRoomRoutes)

// Admin manages Hostels CUD
router.post('/', authenticateToken, authorize(['admin', 'ictstaff']),  HostelController.createHostel);
router.put('/:id', authenticateToken, authorize(['admin', 'ictstaff']),  HostelController.updateHostel);
router.delete('/:id', authenticateToken, authorize(['admin', 'ictstaff']),  HostelController.deleteHostel);
router.get(
    '/:id/rooms-with-occupancy', // e.g., /api/v1/hostels/1/rooms-with-occupancy?seasonId=1
    authenticateToken,
    authorize(['student', 'admin', 'ictstaff']), // Or whatever roles are appropriate
    HostelController.getHostelRoomsWithOccupancyController
);



// All authenticated users (e.g., students looking for hostels) can view
router.get('/', authenticateToken, authorize(['admin', 'student', 'lecturer', 'ictstaff']), HostelController.getAllHostels);
router.get('/:id', authenticateToken, authorize(['admin', 'student', 'lecturer', 'ictstaff']), HostelController.getHostelById);

export default router;