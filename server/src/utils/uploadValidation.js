import path from 'path';

export const SHARED_FILE_SIZE_LIMIT = 25 * 1024 * 1024;
export const RECORDING_SIZE_LIMIT = 500 * 1024 * 1024;

const sharedFileTypes = new Map([
  ['.pdf', new Set(['application/pdf'])],
  ['.doc', new Set(['application/msword'])],
  ['.docx', new Set(['application/vnd.openxmlformats-officedocument.wordprocessingml.document'])],
  ['.ppt', new Set(['application/vnd.ms-powerpoint'])],
  ['.pptx', new Set(['application/vnd.openxmlformats-officedocument.presentationml.presentation'])],
  ['.gif', new Set(['image/gif'])],
  ['.jpg', new Set(['image/jpeg'])],
  ['.jpeg', new Set(['image/jpeg'])],
  ['.png', new Set(['image/png'])],
  ['.webp', new Set(['image/webp'])],
]);

const recordingTypes = new Map([
  ['.webm', new Set(['video/webm', 'audio/webm'])],
  ['.mp4', new Set(['video/mp4'])],
  ['.m4a', new Set(['audio/mp4', 'audio/x-m4a'])],
  ['.mp3', new Set(['audio/mpeg', 'audio/mp3'])],
]);

export function safeFileName(originalName = 'file') {
  const baseName = path.basename(originalName);
  const extension = path.extname(baseName).toLowerCase();
  const safeBaseName = path
    .basename(baseName, path.extname(baseName))
    .replace(/[^a-z0-9-]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

  return `${safeBaseName || 'file'}${extension}`;
}

function normalizedMimeType(mimeType = '') {
  return String(mimeType).toLowerCase().split(';')[0].trim();
}

function isAllowedUpload(file, allowedTypes) {
  const extension = path.extname(file?.originalname || '').toLowerCase();
  const mimeType = normalizedMimeType(file?.mimetype);
  const allowedMimeTypes = allowedTypes.get(extension);

  return Boolean(allowedMimeTypes?.has(mimeType));
}

export function isAllowedSharedFile(file) {
  return isAllowedUpload(file, sharedFileTypes);
}

export function isAllowedRecordingFile(file) {
  const extension = path.extname(file?.originalname || '').toLowerCase();
  const mimeType = normalizedMimeType(file?.mimetype);

  if (!recordingTypes.has(extension)) {
    return false;
  }

  return (
    recordingTypes.get(extension)?.has(mimeType) ||
    mimeType === '' ||
    mimeType === 'application/octet-stream' ||
    mimeType.startsWith('video/') ||
    mimeType.startsWith('audio/')
  );
}

export function createFileFilter({ isAllowed, message }) {
  return (req, file, callback) => {
    if (isAllowed(file)) {
      callback(null, true);
      return;
    }

    const error = new Error(message);
    error.statusCode = 400;
    callback(error);
  };
}
