import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import * as GoogleController from '../controllers/google.controller.js';

const router = Router();

router.get('/spreadsheets', authMiddleware, GoogleController.listSpreadsheets);
router.get('/spreadsheets/:id', authMiddleware, GoogleController.getSpreadsheetDetails);

export default router;
