import { Router } from 'express';
import authRoutes from './auth.routes.js';
import googleRoutes from './google.routes.js';
import mysqlRoutes from './mysql.routes.js';
import integrationRoutes from './integration.routes.js';
import healthRoutes from './health.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/google', googleRoutes);
router.use('/mysql', mysqlRoutes);
router.use('/integrations', integrationRoutes);
router.use('/health', healthRoutes);

export default router;
