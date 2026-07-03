import ActivityLog from '../models/ActivityLog.js';
import ChatMessage from '../models/ChatMessage.js';
import File from '../models/File.js';
import Meeting from '../models/Meeting.js';
import Recording from '../models/Recording.js';
import { logActivity } from '../utils/activityLog.js';
import { normalizeMeetingId } from '../utils/normalizeMeetingId.js';

const defaultSettings = {
  waitingRoom: false,
  allowChat: true,
  allowScreenShare: true,
  allowWhiteboard: true,
  allowFileShare: true,
  allowRecording: false,
};

function generateMeetingId() {
  const first = Math.random().toString(36).slice(2, 5);
  const second = Math.random().toString(36).slice(2, 5);
  const third = Math.random().toString(36).slice(2, 5);
  return `${first}-${second}-${third}`.toUpperCase();
}

function sanitizeSettings(settings = {}) {
  return Object.keys(defaultSettings).reduce(
    (nextSettings, key) => ({
      ...nextSettings,
      [key]: typeof settings[key] === 'boolean' ? settings[key] : defaultSettings[key],
    }),
    {},
  );
}

function attendeeFromRequest(req, fallbackName = 'Guest') {
  const requestedName = req.body.name || req.body.hostName || fallbackName;

  return {
    userId: req.user?._id || null,
    guestId: req.body.guestId || '',
    name: req.user?.name || String(requestedName).trim() || fallbackName,
  };
}

function calculateDurationSeconds(meeting) {
  const startTime = meeting.startedAt || meeting.createdAt;
  const endTime = meeting.endedAt || new Date();

  if (!startTime || !endTime) {
    return 0;
  }

  return Math.max(Math.round((new Date(endTime) - new Date(startTime)) / 1000), 0);
}

function canViewMeetingHistory(meeting, user) {
  if (!user) {
    return false;
  }

  const userId = String(user._id);
  return (
    String(meeting.host?.userId || '') === userId ||
    meeting.participants.some((participant) => String(participant.userId || '') === userId)
  );
}

async function getAvailableMeetingId(requestedMeetingId) {
  const normalizedRequestedId = normalizeMeetingId(requestedMeetingId);

  if (normalizedRequestedId) {
    const existingMeeting = await Meeting.findOne({ meetingId: normalizedRequestedId });
    if (!existingMeeting) {
      return normalizedRequestedId;
    }
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const meetingId = generateMeetingId();
    const existingMeeting = await Meeting.findOne({ meetingId });
    if (!existingMeeting) {
      return meetingId;
    }
  }

  throw new Error('Could not generate a unique meeting ID');
}

function isDuplicateMeetingIdError(error) {
  return error?.code === 11000 && Object.prototype.hasOwnProperty.call(error.keyPattern || {}, 'meetingId');
}

async function createMeetingDocument(meetingInput) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await Meeting.create({
        ...meetingInput,
        meetingId: attempt === 0 ? meetingInput.meetingId : await getAvailableMeetingId(),
      });
    } catch (error) {
      if (!isDuplicateMeetingIdError(error) || attempt === 4) {
        throw error;
      }
    }
  }

  throw new Error('Could not create a unique meeting');
}

export async function createMeeting(req, res, next) {
  try {
    const meetingId = await getAvailableMeetingId(req.body.meetingId);
    const isScheduled = Boolean(req.body.isScheduled);
    const scheduledAt = req.body.scheduledAt ? new Date(req.body.scheduledAt) : null;
    const host = attendeeFromRequest(req, 'Host');

    if (isScheduled && (!scheduledAt || Number.isNaN(scheduledAt.getTime()))) {
      res.status(400);
      throw new Error('A valid scheduledAt date is required for scheduled meetings');
    }

    const title = String(req.body.title || '').trim() || 'Untitled meeting';
    const meeting = await createMeetingDocument({
      meetingId,
      title,
      host,
      participants: [host],
      status: isScheduled ? 'waiting' : 'live',
      isScheduled,
      scheduledAt: isScheduled ? scheduledAt : null,
      startedAt: isScheduled ? null : new Date(),
      settings: sanitizeSettings(req.body.settings),
    });
    await logActivity(meetingId, host, 'Created meeting');

    res.status(201).json({ meeting });
  } catch (error) {
    next(error);
  }
}

export async function joinMeeting(req, res, next) {
  try {
    const meetingId = normalizeMeetingId(req.body.meetingId);
    if (!meetingId) {
      res.status(400);
      throw new Error('Meeting ID is required');
    }

    const meeting = await Meeting.findOne({ meetingId });
    if (!meeting) {
      res.status(404);
      throw new Error('Meeting not found');
    }

    if (meeting.status === 'ended') {
      res.status(410);
      throw new Error('This meeting has ended');
    }

    const attendee = attendeeFromRequest(req);
    const alreadyJoined = meeting.participants.some((participant) => {
      if (attendee.userId) {
        return String(participant.userId) === String(attendee.userId);
      }

      if (attendee.guestId && participant.guestId) {
        return participant.guestId === attendee.guestId;
      }

      return participant.name.toLowerCase() === attendee.name.toLowerCase();
    });

    if (!alreadyJoined) {
      meeting.participants.push(attendee);
    }

    if (!meeting.startedAt && !meeting.isScheduled) {
      meeting.startedAt = new Date();
    }

    if (meeting.status === 'waiting' && !meeting.settings.waitingRoom) {
      meeting.status = 'live';
      meeting.startedAt = meeting.startedAt || new Date();
    }

    await meeting.save();
    await logActivity(meetingId, attendee, alreadyJoined ? 'Rejoined meeting' : 'Joined meeting');

    res.json({ meeting });
  } catch (error) {
    next(error);
  }
}

export async function getMeeting(req, res, next) {
  try {
    const meeting = await Meeting.findOne({ meetingId: normalizeMeetingId(req.params.meetingId) });

    if (!meeting) {
      res.status(404);
      throw new Error('Meeting not found');
    }

    res.json({ meeting });
  } catch (error) {
    next(error);
  }
}

export async function getMeetingHistory(req, res, next) {
  try {
    const meetings = await Meeting.find({
      $or: [{ 'host.userId': req.user._id }, { 'participants.userId': req.user._id }],
    })
      .sort({ createdAt: -1 })
      .limit(20);

    const enrichedMeetings = meetings.map((meeting) => {
      const meetingObject = meeting.toObject();
      return {
        ...meetingObject,
        durationSeconds: meetingObject.durationSeconds || calculateDurationSeconds(meetingObject),
      };
    });

    res.json({ meetings: enrichedMeetings });
  } catch (error) {
    next(error);
  }
}

export async function getMeetingHistoryDetail(req, res, next) {
  try {
    const meetingId = normalizeMeetingId(req.params.meetingId);
    const meeting = await Meeting.findOne({ meetingId });

    if (!meeting) {
      res.status(404);
      throw new Error('Meeting not found');
    }

    if (!canViewMeetingHistory(meeting, req.user)) {
      res.status(403);
      throw new Error('You do not have access to this meeting history');
    }

    const [chatHistory, sharedFiles, recordings, activityLogs] = await Promise.all([
      ChatMessage.find({ meetingId, receiver: null }).sort({ createdAt: 1 }).limit(500),
      File.find({ meetingId }).sort({ createdAt: -1 }),
      Recording.find({ meetingId }).sort({ createdAt: -1 }),
      ActivityLog.find({ meetingId }).sort({ timestamp: 1 }).limit(500),
    ]);

    const meetingObject = meeting.toObject();

    res.json({
      meeting: {
        ...meetingObject,
        startTime: meetingObject.startedAt,
        endTime: meetingObject.endedAt,
        durationSeconds: meetingObject.durationSeconds || calculateDurationSeconds(meetingObject),
        chatHistory,
        sharedFiles,
        recordings,
        activityLogs,
      },
    });
  } catch (error) {
    next(error);
  }
}
