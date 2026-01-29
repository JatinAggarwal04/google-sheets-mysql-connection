import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import * as MySQLController from '../controllers/mysql.controller.js';

const router = Router();

// These endpoints essentially accept credentials in the body to test/introspect.
// We still require authMiddleware to ensure only logged-in users can use this proxy.
router.post('/validate', authMiddleware, MySQLController.validateConnection);
router.post('/tables', authMiddleware, MySQLController.listTables);
router.post('/columns', authMiddleware, MySQLController.getTableColumns);

export default router;
