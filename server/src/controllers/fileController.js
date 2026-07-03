import { isS3StorageEnabled } from '../config/storage.js';
import File from '../models/File.js';
import { uploadSharedFileToS3 } from '../services/s3Service.js';
import { buildSharedFileDocument } from '../services/uploadMetadata.js';
import { logActivity } from '../utils/activityLog.js';
import { normalizeMeetingId } from '../utils/normalizeMeetingId.js';

function uploadedByFromBody(body = {}) {
  return {
    userId: String(body.userId || ''),
    name: String(body.name || body.uploadedByName || 'Guest').trim() || 'Guest',
    socketId: String(body.socketId || ''),
  };
}

export async function uploadFile(req, res, next) {
  try {
    const meetingId = normalizeMeetingId(req.params.meetingId);

    if (!meetingId) {
      res.status(400);
      throw new Error('Meeting ID is required');
    }

    if (!req.file) {
      res.status(400);
      throw new Error('A file is required');
    }

    const storageResult = isS3StorageEnabled()
      ? await uploadSharedFileToS3({ file: req.file, meetingId })
      : {
          fileUrl: `/uploads/${meetingId}/${req.file.filename}`,
          storageProvider: 'local',
        };

    const file = await File.create(buildSharedFileDocument({
      file: req.file,
      meetingId,
      storageResult,
      uploadedBy: uploadedByFromBody(req.body),
    }));
    await logActivity(meetingId, file.uploadedBy, `Shared file ${file.fileName}`);

    res.status(201).json({ file });
  } catch (error) {
    next(error);
  }
}

export async function getMeetingFiles(req, res, next) {
  try {
    const meetingId = normalizeMeetingId(req.params.meetingId);

    if (!meetingId) {
      res.status(400);
      throw new Error('Meeting ID is required');
    }

    const files = await File.find({ meetingId }).sort({ createdAt: -1 });

    res.json({ files });
  } catch (error) {
    next(error);
  }
}
