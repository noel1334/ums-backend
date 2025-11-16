
import { Router } from 'express';
import * as HostelRoomController from '../controllers/hostelRoom.controller.js';
import { authenticateToken, authorizeAdmin, authorize } from '../middlewares/auth.middleware.js';

// This router will be mounted under /api/v1/hostels/:hostelId/rooms
const router = Router({ mergeParams: true }); // mergeParams is crucial

// Admin manages HostelRooms
router.post('/', authenticateToken,  authorize(['admin',  'ictstaff']), HostelRoomController.createHostelRoom);
router.put('/:roomId', authenticateToken, authorize(['admin',  'ictstaff']), HostelRoomController.updateHostelRoom);
router.delete('/:roomId', authenticateToken, authorize(['admin',  'ictstaff']), HostelRoomController.deleteHostelRoom);

// All authenticated users can view rooms of a hostel
router.get('/', authenticateToken, authorize(['admin', 'student', 'lecturer', 'ictstaff']), HostelRoomController.getAllHostelRooms);
router.get('/:roomId', authenticateToken, authorize(['admin', 'student', 'lecturer', 'ictstaff']), HostelRoomController.getHostelRoomById);

export default router;