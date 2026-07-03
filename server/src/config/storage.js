import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const uploadRoot = path.resolve(__dirname, '../../uploads');
export const recordingUploadRoot = path.join(uploadRoot, 'recordings');

export function getStorageProvider() {
  const configuredProvider = String(process.env.STORAGE_PROVIDER || '').toLowerCase().trim();

  if (configuredProvider) {
    return configuredProvider;
  }

  return process.env.NODE_ENV === 'production' ? 's3' : 'local';
}

export function isS3StorageEnabled() {
  return getStorageProvider() === 's3';
}

export function isLocalUploadsEnabled() {
  const configuredValue = process.env.LOCAL_UPLOADS_ENABLED;

  if (typeof configuredValue === 'string') {
    return configuredValue.toLowerCase() === 'true';
  }

  return getStorageProvider() === 'local' && process.env.NODE_ENV !== 'production';
}
