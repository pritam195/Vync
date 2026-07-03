import ActivityLog from '../models/ActivityLog.js';

export function userFromActor(actor = {}) {
  return {
    userId: String(actor.userId || actor._id || ''),
    name: String(actor.name || 'Guest').trim() || 'Guest',
    socketId: String(actor.socketId || ''),
    role: String(actor.role || ''),
  };
}

export async function logActivity(meetingId, user, action) {
  const normalizedMeetingId = String(meetingId || '').trim().toUpperCase();

  if (!normalizedMeetingId || !action) {
    return null;
  }

  return ActivityLog.create({
    meetingId: normalizedMeetingId,
    user: userFromActor(user),
    action,
  });
}
