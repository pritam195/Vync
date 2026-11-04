import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import multer from 'multer';
import { isS3StorageEnabled, recordingUploadRoot } from '../config/storage.js';
import {
  assembleRecordingSession,
  getActiveRecordingSessions,
  getMeetingRecordings,
  getRecordingManifest,
  recoverRecordingSession,
  uploadRecording,
  uploadRecordingChunk,
} from '../controllers/recordingController.js';
import { normalizeMeetingId } from '../utils/normalizeMeetingId.js';
import {
  createFileFilter,
  isAllowedRecordingFile,
  RECORDING_SIZE_LIMIT,
  safeFileName,
} from '../utils/uploadValidation.js';

const router = Router();

const localStorage = multer.diskStorage({
  destination(req, file, callback) {
    const meetingId = normalizeMeetingId(req.params.meetingId);
    const destination = path.join(recordingUploadRoot, meetingId || 'unknown');

    fs.mkdirSync(destination, { recursive: true });
    callback(null, destination);
  },
  filename(req, file, callback) {
    callback(null, `${Date.now()}-${safeFileName(file.originalname || 'recording.webm')}`);
  },
});

const upload = multer({
  fileFilter: createFileFilter({
    isAllowed: isAllowedRecordingFile,
    message: 'Unsupported recording type. Upload a WEBM, MP4, M4A, or MP3 file.',
  }),
  storage: isS3StorageEnabled() ? multer.memoryStorage() : localStorage,
  limits: {
    fileSize: RECORDING_SIZE_LIMIT,
  },
});

const chunkUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB per chunk max
  },
});

// Original full-file upload endpoint (preserved for backward compatibility)
router.post('/upload/:meetingId', upload.single('recording'), uploadRecording);

// Incremental chunk upload endpoints
router.post('/chunk/:meetingId/:recordingId', chunkUpload.single('chunk'), uploadRecordingChunk);
router.post('/chunk/:meetingId', chunkUpload.single('chunk'), uploadRecordingChunk);

// Finalization and assembly
router.post('/assemble/:meetingId/:recordingId', assembleRecordingSession);
router.post('/assemble/:meetingId', assembleRecordingSession);

// Recovery for midway crashes
router.post('/recover/:meetingId/:recordingId', recoverRecordingSession);
router.post('/recover/:meetingId', recoverRecordingSession);

// Manifest and active sessions
router.get('/manifest/:meetingId/:recordingId', getRecordingManifest);
router.get('/active/:meetingId', getActiveRecordingSessions);

// List meeting recordings
router.get('/:meetingId', getMeetingRecordings);

export default router;
