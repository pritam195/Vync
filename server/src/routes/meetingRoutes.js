import { Router } from 'express';
import {
  createMeeting,
  getMeeting,
  getMeetingHistory,
  getMeetingHistoryDetail,
  joinMeeting,
} from '../controllers/meetingController.js';
import { optionalAuth, protect } from '../middleware/authMiddleware.js';

const router = Router();

router.post('/create', optionalAuth, createMeeting);
router.post('/join', optionalAuth, joinMeeting);
router.get('/history', protect, getMeetingHistory);
router.get('/history/:meetingId', protect, getMeetingHistoryDetail);
router.get('/:meetingId', getMeeting);

export default router;
