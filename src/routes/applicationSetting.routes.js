
import { Router } from 'express';
import * as ApplicationSettingController from '../controllers/applicationSetting.controller.js';
import { authenticateToken, authorizeAdmin } from '../middlewares/auth.middleware.js';

const router = Router();

// All application setting routes are Admin only
router.use(authenticateToken, authorizeAdmin);

router.route('/')
    .post(ApplicationSettingController.createApplicationSetting)
    .get(ApplicationSettingController.getAllApplicationSettings);

router.route('/:key') // Use 'key' as the identifier in the path
    .get(ApplicationSettingController.getApplicationSettingByKey)
    .put(ApplicationSettingController.updateApplicationSetting)
    .delete(ApplicationSettingController.deleteApplicationSetting);

export default router;