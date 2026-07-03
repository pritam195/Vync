import { isS3StorageEnabled } from '../config/storage.js';
import Meeting from '../models/Meeting.js';
import Recording from '../models/Recording.js';
import { uploadRecordingToS3 } from '../services/s3Service.js';
import { buildRecordingDocument } from '../services/uploadMetadata.js';
import { logActivity } from '../utils/activityLog.js';
import { normalizeMeetingId } from '../utils/normalizeMeetingId.js';

function recordedByFromBody(body = {}) {
  return {
    userId: String(body.userId || ''),
    name: String(body.name || body.recordedByName || 'Guest').trim() || 'Guest',
    socketId: String(body.socketId || ''),
  };
}

export async function uploadRecording(req, res, next) {
  try {
    const meetingId = normalizeMeetingId(req.params.meetingId);

    if (!meetingId) {
      res.status(400);
      throw new Error('Meeting ID is required');
    }

    if (!req.file) {
      res.status(400);
      throw new Error('A recording file is required');
    }

    const recordedBy = recordedByFromBody(req.body);
    const storageResult = isS3StorageEnabled()
      ? await uploadRecordingToS3({ file: req.file, meetingId })
      : {
          fileUrl: `/uploads/recordings/${meetingId}/${req.file.filename}`,
          storageProvider: 'local',
        };
    const recording = await Recording.create(
      buildRecordingDocument({
        durationSeconds: req.body.durationSeconds,
        file: req.file,
        meetingId,
        recordedBy,
        storageResult,
      }),
    );

    await Meeting.updateOne(
      { meetingId },
      {
        $set: {
          recordingUrl: recording.fileUrl,
        },
      },
    );
    await logActivity(meetingId, recordedBy, `Uploaded recording ${recording.fileName}`);

    res.status(201).json({ recording });
  } catch (error) {
    next(error);
  }
}

export async function getMeetingRecordings(req, res, next) {
  try {
    const meetingId = normalizeMeetingId(req.params.meetingId);

    if (!meetingId) {
      res.status(400);
      throw new Error('Meeting ID is required');
    }

    const recordings = await Recording.find({ meetingId }).sort({ createdAt: -1 });

    res.json({ recordings });
  } catch (error) {
    next(error);
  }
}
