import api from './api.js';

export async function getChatHistory(meetingId, userId = '') {
  const { data } = await api.get(`/chat/${meetingId}`, {
    params: userId ? { userId } : undefined,
  });

  return data.messages;
}
