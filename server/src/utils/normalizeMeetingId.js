export function normalizeMeetingId(meetingId) {
  return String(meetingId || '')
    .trim()
    .replace(/^.*\/meeting\//i, '')
    .replace(/[^a-z0-9-]/gi, '')
    .toUpperCase();
}
