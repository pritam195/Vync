import api from './api.js';
import { normalizeMeetingId } from './meetings.js';

export function absoluteFileUrl(fileUrl) {
  if (!fileUrl) {
    return '';
  }

  if (/^https?:\/\//i.test(fileUrl)) {
    return fileUrl;
  }

  const apiOrigin = new URL(api.defaults.baseURL).origin;
  return `${apiOrigin}${fileUrl}`;
}

function normalizeFile(file) {
  return {
    ...file,
    absoluteUrl: absoluteFileUrl(file.fileUrl),
  };
}

export async function uploadMeetingFile(meetingId, file, uploadedBy = {}) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('userId', uploadedBy.userId || '');
  formData.append('name', uploadedBy.name || 'Guest');
  formData.append('socketId', uploadedBy.socketId || '');

  const { data } = await api.post(`/files/upload/${normalizeMeetingId(meetingId)}`, formData);

  return normalizeFile(data.file);
}

export async function getMeetingFiles(meetingId) {
  const { data } = await api.get(`/files/${normalizeMeetingId(meetingId)}`);
  return Array.isArray(data.files) ? data.files.map(normalizeFile) : [];
}
