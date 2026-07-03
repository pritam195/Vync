import { Router } from 'express';
import { getMe, login, logout, register, forgotPassword, verifyOTP, resetPassword } from '../controllers/authController.js';
import { optionalAuth } from '../middleware/authMiddleware.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.get('/me', optionalAuth, getMe);
router.post('/forgot-password', forgotPassword);
router.post('/verify-otp', verifyOTP);
router.post('/reset-password', resetPassword);

export default router;
