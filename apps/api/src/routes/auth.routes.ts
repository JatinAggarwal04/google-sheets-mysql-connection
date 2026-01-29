import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import * as AuthController from '../controllers/auth.controller.js';

const router = Router();

// Retrieve Google Auth URL (Protected, though strictly not needed if URL is generic, but state might need user)
router.get('/google/url', authMiddleware, AuthController.getGoogleAuthUrl);

// Exchange Authorization Code (Protected - User must be logged in to frontend)
router.post('/google/callback', authMiddleware, AuthController.handleGoogleCallback);

export default router;
