import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import * as IntegrationController from '../controllers/integration.controller.js';

const router = Router();

router.post('/', authMiddleware, IntegrationController.createIntegration);
router.get('/', authMiddleware, IntegrationController.listIntegrations);

export default router;
