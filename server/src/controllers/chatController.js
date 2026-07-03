import ChatMessage from '../models/ChatMessage.js';
import { normalizeMeetingId } from '../utils/normalizeMeetingId.js';

export async function getChatMessages(req, res, next) {
  try {
    const meetingId = normalizeMeetingId(req.params.meetingId);
    const userId = String(req.query.userId || '').trim();

    if (!meetingId) {
      res.status(400);
      throw new Error('Meeting ID is required');
    }

    const privateFilter = userId
      ? {
          $or: [
            { receiver: null },
            { 'sender.userId': userId },
            { 'receiver.userId': userId },
          ],
        }
      : { receiver: null };

    const messages = await ChatMessage.find({
      meetingId,
      ...privateFilter,
    })
      .sort({ createdAt: 1 })
      .limit(200);

    res.json({ messages });
  } catch (error) {
    next(error);
  }
}
