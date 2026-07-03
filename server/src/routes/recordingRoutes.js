import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import multer from 'multer';
import { isS3StorageEnabled, recordingUploadRoot } from '../config/storage.js';
import {
  getMeetingRecordings,
  uploadRecording,
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

router.post('/upload/:meetingId', upload.single('recording'), uploadRecording);
router.get('/:meetingId', getMeetingRecordings);

export default router;
