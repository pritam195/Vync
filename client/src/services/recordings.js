import api from './api.js';
import { normalizeMeetingId } from './meetings.js';
import { absoluteFileUrl } from './files.js';

function normalizeRecording(recording) {
  return {
    ...recording,
    absoluteUrl: absoluteFileUrl(recording.fileUrl),
  };
}

export async function uploadMeetingRecording(
  meetingId,
  blob,
  { durationSeconds = 0, fileName = 'meeting-recording.webm', recordedBy = {} } = {},
) {
  const formData = new FormData();
  formData.append('recording', blob, fileName);
  formData.append('durationSeconds', String(durationSeconds));
  formData.append('userId', recordedBy.userId || '');
  formData.append('name', recordedBy.name || 'Guest');
  formData.append('socketId', recordedBy.socketId || '');

  const { data } = await api.post(
    `/recordings/upload/${normalizeMeetingId(meetingId)}`,
    formData,
  );

  return normalizeRecording(data.recording);
}

export async function getMeetingRecordings(meetingId) {
  const { data } = await api.get(`/recordings/${normalizeMeetingId(meetingId)}`);
  return Array.isArray(data.recordings) ? data.recordings.map(normalizeRecording) : [];
}
