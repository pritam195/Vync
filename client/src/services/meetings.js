import api from './api.js';

const idPartCharacters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomIdPart(length = 3) {
  return Array.from({ length }, () =>
    idPartCharacters.charAt(Math.floor(Math.random() * idPartCharacters.length)),
  ).join('');
}

export function generateMeetingId() {
  return `${randomIdPart()}-${randomIdPart()}-${randomIdPart()}`;
}

export function normalizeMeetingId(value) {
  return String(value || '')
    .trim()
    .replace(/^.*\/meeting\//i, '')
    .replace(/[^a-z0-9-]/gi, '')
    .toUpperCase();
}

export async function createMeeting(payload) {
  const { data } = await api.post('/meetings/create', {
    ...payload,
    meetingId: payload.meetingId || generateMeetingId(),
  });
  return data.meeting;
}

export async function joinMeeting(payload) {
  const { data } = await api.post('/meetings/join', {
    ...payload,
    meetingId: normalizeMeetingId(payload.meetingId),
  });
  return data.meeting;
}

export async function getMeeting(meetingId) {
  const { data } = await api.get(`/meetings/${normalizeMeetingId(meetingId)}`);
  return data.meeting;
}

export async function getMeetingHistory() {
  const { data } = await api.get('/meetings/history');
  return data.meetings;
}

export async function getMeetingHistoryDetail(meetingId) {
  const { data } = await api.get(`/meetings/history/${normalizeMeetingId(meetingId)}`);
  return data.meeting;
}
