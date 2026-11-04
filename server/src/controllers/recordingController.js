import fs from 'fs';
import { isS3StorageEnabled } from '../config/storage.js';
import Meeting from '../models/Meeting.js';
import Recording from '../models/Recording.js';
import { uploadRecordingToS3 } from '../services/s3Service.js';
import { buildRecordingDocument } from '../services/uploadMetadata.js';
import {
  assembleRecording,
  listActiveRecordings,
  readManifest,
  saveChunk,
} from '../services/recordingChunkService.js';
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

export async function uploadRecordingChunk(req, res, next) {
  try {
    const meetingId = normalizeMeetingId(req.params.meetingId);
    const recordingId = req.params.recordingId || req.body.recordingId;

    if (!meetingId) {
      res.status(400);
      throw new Error('Meeting ID is required');
    }
    if (!recordingId) {
      res.status(400);
      throw new Error('Recording ID is required');
    }
    if (!req.file) {
      res.status(400);
      throw new Error('A chunk file is required');
    }

    const chunkIndex = parseInt(req.body.chunkIndex, 10);
    if (isNaN(chunkIndex) || chunkIndex < 0) {
      res.status(400);
      throw new Error('Valid non-negative chunkIndex is required');
    }

    const recordedBy = recordedByFromBody(req.body);
    const chunkBuffer = req.file.buffer || (req.file.path ? fs.readFileSync(req.file.path) : null);

    if (!chunkBuffer || !chunkBuffer.length) {
      res.status(400);
      throw new Error('Chunk buffer is empty');
    }

    const result = await saveChunk({
      meetingId,
      recordingId,
      chunkIndex,
      chunkBuffer,
      fileName: req.body.fileName,
      mimeType: req.file.mimetype || req.body.mimeType || 'video/webm',
      durationSeconds: req.body.durationSeconds,
      recordedBy,
    });

    const isLastChunk = String(req.body.isLastChunk).toLowerCase() === 'true';
    if (isLastChunk) {
      const assembleResult = await assembleRecording({
        meetingId,
        recordingId,
        isRecovery: false,
      });
      return res.status(201).json({
        ok: true,
        finalized: true,
        ...result,
        recording: assembleResult.recording,
        manifest: assembleResult.manifest,
      });
    }

    res.status(200).json({ ok: true, finalized: false, ...result });
  } catch (error) {
    next(error);
  }
}

export async function assembleRecordingSession(req, res, next) {
  try {
    const meetingId = normalizeMeetingId(req.params.meetingId);
    const recordingId = req.params.recordingId || req.body.recordingId;

    if (!meetingId) {
      res.status(400);
      throw new Error('Meeting ID is required');
    }
    if (!recordingId) {
      res.status(400);
      throw new Error('Recording ID is required');
    }

    const result = await assembleRecording({
      meetingId,
      recordingId,
      isRecovery: false,
    });

    res.status(201).json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function recoverRecordingSession(req, res, next) {
  try {
    const meetingId = normalizeMeetingId(req.params.meetingId);
    const recordingId = req.params.recordingId || req.body.recordingId;

    if (!meetingId) {
      res.status(400);
      throw new Error('Meeting ID is required');
    }
    if (!recordingId) {
      res.status(400);
      throw new Error('Recording ID is required');
    }

    const result = await assembleRecording({
      meetingId,
      recordingId,
      isRecovery: true,
    });

    res.status(200).json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function getRecordingManifest(req, res, next) {
  try {
    const meetingId = normalizeMeetingId(req.params.meetingId);
    const recordingId = req.params.recordingId;

    if (!meetingId || !recordingId) {
      res.status(400);
      throw new Error('Meeting ID and Recording ID are required');
    }

    const manifest = readManifest(meetingId, recordingId);
    if (!manifest) {
      res.status(404);
      throw new Error(`Manifest not found for recording ${recordingId}`);
    }

    res.json({ ok: true, manifest });
  } catch (error) {
    next(error);
  }
}

export async function getActiveRecordingSessions(req, res, next) {
  try {
    const meetingId = normalizeMeetingId(req.params.meetingId);
    if (!meetingId) {
      res.status(400);
      throw new Error('Meeting ID is required');
    }

    const activeRecordings = listActiveRecordings(meetingId);
    res.json({ ok: true, activeRecordings });
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
