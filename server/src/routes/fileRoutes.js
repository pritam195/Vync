import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import multer from 'multer';
import { isS3StorageEnabled, uploadRoot } from '../config/storage.js';
import { getMeetingFiles, uploadFile } from '../controllers/fileController.js';
import { normalizeMeetingId } from '../utils/normalizeMeetingId.js';
import {
  createFileFilter,
  isAllowedSharedFile,
  safeFileName,
  SHARED_FILE_SIZE_LIMIT,
} from '../utils/uploadValidation.js';

const router = Router();

const localStorage = multer.diskStorage({
  destination(req, file, callback) {
    const meetingId = normalizeMeetingId(req.params.meetingId);
    const destination = path.join(uploadRoot, meetingId || 'unknown');

    fs.mkdirSync(destination, { recursive: true });
    callback(null, destination);
  },
  filename(req, file, callback) {
    callback(null, `${Date.now()}-${safeFileName(file.originalname)}`);
  },
});

const upload = multer({
  fileFilter: createFileFilter({
    isAllowed: isAllowedSharedFile,
    message: 'Unsupported file type. Upload a PDF, PPT, DOC, or image file.',
  }),
  storage: isS3StorageEnabled() ? multer.memoryStorage() : localStorage,
  limits: {
    fileSize: SHARED_FILE_SIZE_LIMIT,
  },
});

router.post('/upload/:meetingId', upload.single('file'), uploadFile);
router.get('/:meetingId', getMeetingFiles);

export default router;
