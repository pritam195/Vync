import api from './api.js';
import { normalizeMeetingId } from './meetings.js';
import { absoluteFileUrl } from './files.js';

function normalizeRecording(recording) {
  if (!recording) return null;
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

export async function uploadRecordingChunk(
  meetingId,
  recordingId,
  chunkBlob,
  { chunkIndex = 0, isLastChunk = false, fileName = '', durationSeconds = 0, recordedBy = {} } = {},
) {
  const formData = new FormData();
  formData.append('chunk', chunkBlob, `chunk-${String(chunkIndex).padStart(5, '0')}.webm`);
  formData.append('chunkIndex', String(chunkIndex));
  formData.append('isLastChunk', String(isLastChunk));
  formData.append('fileName', fileName);
  formData.append('durationSeconds', String(durationSeconds));
  formData.append('userId', recordedBy.userId || '');
  formData.append('name', recordedBy.name || 'Guest');
  formData.append('socketId', recordedBy.socketId || '');

  const { data } = await api.post(
    `/recordings/chunk/${normalizeMeetingId(meetingId)}/${recordingId}`,
    formData,
  );

  return {
    ...data,
    recording: data.recording ? normalizeRecording(data.recording) : null,
  };
}

export async function assembleRecordingSession(meetingId, recordingId) {
  const { data } = await api.post(
    `/recordings/assemble/${normalizeMeetingId(meetingId)}/${recordingId}`,
  );
  return {
    ...data,
    recording: data.recording ? normalizeRecording(data.recording) : null,
  };
}

export async function recoverRecordingSession(meetingId, recordingId) {
  const { data } = await api.post(
    `/recordings/recover/${normalizeMeetingId(meetingId)}/${recordingId}`,
  );
  return {
    ...data,
    recording: data.recording ? normalizeRecording(data.recording) : null,
  };
}

export async function getRecordingManifest(meetingId, recordingId) {
  const { data } = await api.get(
    `/recordings/manifest/${normalizeMeetingId(meetingId)}/${recordingId}`,
  );
  return data.manifest;
}

export async function getMeetingRecordings(meetingId) {
  const { data } = await api.get(`/recordings/${normalizeMeetingId(meetingId)}`);
  return Array.isArray(data.recordings) ? data.recordings.map(normalizeRecording) : [];
}
