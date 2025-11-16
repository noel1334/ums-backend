
import { Router } from 'express';
import * as VenueController from '../controllers/venue.controller.js';
import { authenticateToken, authorizeICTStaff } from '../middlewares/auth.middleware.js'; // Assuming Admin only

const router = Router();

// Venues are typically managed by Admins
router.route('/')
    .post(authenticateToken, authorizeICTStaff, VenueController.createVenue)
    .get(authenticateToken, authorizeICTStaff, VenueController.getAllVenues); // Or broader access if needed

router.route('/:id')
    .get(authenticateToken, authorizeICTStaff, VenueController.getVenueById)
    .put(authenticateToken, authorizeICTStaff, VenueController.updateVenue)
    .delete(authenticateToken, authorizeICTStaff, VenueController.deleteVenue);

export default router;