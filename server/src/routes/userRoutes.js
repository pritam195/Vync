import { Router } from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { getMe } from '../controllers/userController.js';

const router = Router();

router.get('/me', protect, getMe);

export default router;
