import { jest } from '@jest/globals';
import { SHARED_FILE_SIZE_LIMIT } from '../src/utils/uploadValidation.js';

const mockUploadSharedFileToS3 = jest.fn(async ({ file, meetingId }) => ({
  bucket: 'vync-test-uploads',
  fileUrl: `https://cdn.example.test/vync/meetings/${meetingId}/files/mock-${file.originalname}`,
  publicUrl: `https://cdn.example.test/vync/meetings/${meetingId}/files/mock-${file.originalname}`,
  s3Key: `vync/meetings/${meetingId}/files/mock-${file.originalname}`,
  storageProvider: 's3',
}));

const mockUploadRecordingToS3 = jest.fn(async ({ file, meetingId }) => ({
  bucket: 'vync-test-uploads',
  fileUrl: `https://cdn.example.test/vync/meetings/${meetingId}/recordings/mock-${file.originalname}`,
  publicUrl: `https://cdn.example.test/vync/meetings/${meetingId}/recordings/mock-${file.originalname}`,
  s3Key: `vync/meetings/${meetingId}/recordings/mock-${file.originalname}`,
  storageProvider: 's3',
}));

jest.unstable_mockModule('../src/services/s3Service.js', () => ({
  buildS3PublicUrl: jest.fn(),
  createS3ObjectKey: jest.fn(),
  createS3Uploader: jest.fn(),
  createSignedDownloadUrl: jest.fn(),
  uploadRecordingToS3: mockUploadRecordingToS3,
  uploadSharedFileToS3: mockUploadSharedFileToS3,
}));

const [{ default: request }, { default: app }, { default: ChatMessage }, { default: File }, { default: Recording }] =
  await Promise.all([
    import('supertest'),
    import('../src/app.js'),
    import('../src/models/ChatMessage.js'),
    import('../src/models/File.js'),
    import('../src/models/Recording.js'),
  ]);

async function registerUser(overrides = {}) {
  const payload = {
    name: overrides.name || 'Ada Lovelace',
    email: overrides.email || `ada-${Date.now()}-${Math.random()}@example.test`,
    password: overrides.password || 'secret123',
  };
  const response = await request(app).post('/api/auth/register').send(payload).expect(201);
  return {
    ...payload,
    cookie: response.headers['set-cookie'],
    response,
    token: response.body.token,
    user: response.body.user,
  };
}

async function createAuthenticatedMeeting(options = {}) {
  const account = await registerUser(options.user);
  const meetingResponse = await request(app)
    .post('/api/meetings/create')
    .set('Authorization', `Bearer ${account.token}`)
    .send({
      meetingId: options.meetingId || 'API-123-TST',
      title: options.title || 'API test meeting',
    })
    .expect(201);

  return {
    account,
    meeting: meetingResponse.body.meeting,
  };
}

describe('auth API', () => {
  it('registers a user and sets an HTTP-only JWT cookie', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Ada Lovelace', email: 'ada@example.test', password: 'secret123' })
      .expect(201);

    expect(response.body.user).toMatchObject({ email: 'ada@example.test', name: 'Ada Lovelace' });
    expect(response.body.token).toEqual(expect.any(String));
    expect(response.headers['set-cookie'].join(';')).toContain('HttpOnly');
  });

  it('rejects duplicate emails', async () => {
    await registerUser({ email: 'duplicate@example.test' });

    const response = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Ada Lovelace', email: 'duplicate@example.test', password: 'secret123' })
      .expect(409);

    expect(response.body.message).toBe('Email is already registered');
  });

  it('logs in a registered user', async () => {
    await registerUser({ email: 'login@example.test', password: 'secret123' });

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.test', password: 'secret123' })
      .expect(200);

    expect(response.body.user.email).toBe('login@example.test');
    expect(response.body.token).toEqual(expect.any(String));
  });

  it('rejects a wrong password', async () => {
    await registerUser({ email: 'wrong-password@example.test', password: 'secret123' });

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'wrong-password@example.test', password: 'not-secret' })
      .expect(401);

    expect(response.body.message).toBe('Invalid email or password');
  });

  it('gets the current user with a valid token', async () => {
    const account = await registerUser({ email: 'current-user@example.test' });

    const response = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${account.token}`)
      .expect(200);

    expect(response.body.user.email).toBe('current-user@example.test');
  });

  it('rejects a protected route without a token', async () => {
    const response = await request(app).get('/api/users/me').expect(401);

    expect(response.body.message).toBe('Not authorized');
  });

  it('validates input for forgot-password, verify-otp, and reset-password', async () => {
    const res1 = await request(app)
      .post('/api/auth/forgot-password')
      .send({})
      .expect(400);
    expect(res1.body.message).toBe('Email is required');

    const res2 = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email: 'test@example.com' })
      .expect(400);
    expect(res2.body.message).toBe('Email and OTP are required');

    const res3 = await request(app)
      .post('/api/auth/reset-password')
      .send({ email: 'test@example.com', otp: '123456', password: '123' })
      .expect(400);
    expect(res3.body.message).toBe('Password must be at least 6 characters');
  });
});

describe('meetings API', () => {
  it('creates a meeting as an authenticated user', async () => {
    const { account, meeting } = await createAuthenticatedMeeting({ meetingId: 'AUT-123-MTG' });

    expect(meeting.meetingId).toBe('AUT-123-MTG');
    expect(meeting.host.userId).toBe(account.user.id);
    expect(meeting.participants).toHaveLength(1);
  });

  it('joins a meeting as an authenticated user', async () => {
    const { meeting } = await createAuthenticatedMeeting({ meetingId: 'JON-123-MTG' });
    const participant = await registerUser({ email: 'participant@example.test', name: 'Grace Hopper' });

    const response = await request(app)
      .post('/api/meetings/join')
      .set('Authorization', `Bearer ${participant.token}`)
      .send({ meetingId: meeting.meetingId })
      .expect(200);

    expect(response.body.meeting.participants.map((person) => person.name)).toContain('Grace Hopper');
  });

  it('joins a meeting as a guest', async () => {
    const { meeting } = await createAuthenticatedMeeting({ meetingId: 'GST-123-MTG' });

    const response = await request(app)
      .post('/api/meetings/join')
      .send({ guestId: 'guest-1', meetingId: meeting.meetingId, name: 'Guest User' })
      .expect(200);

    expect(response.body.meeting.participants.map((person) => person.name)).toContain('Guest User');
  });

  it('gets public meeting details', async () => {
    const { meeting } = await createAuthenticatedMeeting({ meetingId: 'PUB-123-MTG' });

    const response = await request(app).get(`/api/meetings/${meeting.meetingId}`).expect(200);

    expect(response.body.meeting.title).toBe('API test meeting');
  });

  it('gets meeting history for an authenticated user', async () => {
    const { account, meeting } = await createAuthenticatedMeeting({ meetingId: 'HST-123-MTG' });

    const response = await request(app)
      .get('/api/meetings/history')
      .set('Authorization', `Bearer ${account.token}`)
      .expect(200);

    expect(response.body.meetings.map((historyMeeting) => historyMeeting.meetingId)).toContain(meeting.meetingId);
  });

  it('prevents unauthorized access to meeting history details', async () => {
    const { meeting } = await createAuthenticatedMeeting({ meetingId: 'SEC-123-MTG' });
    const outsider = await registerUser({ email: 'outsider@example.test' });

    const response = await request(app)
      .get(`/api/meetings/history/${meeting.meetingId}`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .expect(403);

    expect(response.body.message).toBe('You do not have access to this meeting history');
  });
});

describe('chat API', () => {
  it('gets empty chat history', async () => {
    const response = await request(app).get('/api/chat/EMPTY-CHAT-1').expect(200);

    expect(response.body.messages).toEqual([]);
  });

  it('returns persisted chat messages', async () => {
    await ChatMessage.create({
      meetingId: 'MSG-123-API',
      sender: { name: 'Ada Lovelace', userId: 'user-1' },
      message: 'Hello from REST history',
    });

    const response = await request(app).get('/api/chat/MSG-123-API').expect(200);

    expect(response.body.messages).toHaveLength(1);
    expect(response.body.messages[0].message).toBe('Hello from REST history');
  });

  it('validates meetingId behavior', async () => {
    const response = await request(app).get('/api/chat/***').expect(400);

    expect(response.body.message).toBe('Meeting ID is required');
  });
});

describe('file upload API', () => {
  beforeEach(() => {
    mockUploadSharedFileToS3.mockClear();
  });

  it('allows unauthenticated upload because guest file sharing is supported', async () => {
    const response = await request(app)
      .post('/api/files/upload/FILE-123-API')
      .field('name', 'Guest User')
      .attach('file', Buffer.from('%PDF-1.4 test'), {
        contentType: 'application/pdf',
        filename: 'guest.pdf',
      })
      .expect(201);

    expect(response.body.file.uploadedBy.name).toBe('Guest User');
    expect(response.body.file.storageProvider).toBe('s3');
    expect(mockUploadSharedFileToS3).toHaveBeenCalledTimes(1);
  });

  it('rejects unsupported file types', async () => {
    const response = await request(app)
      .post('/api/files/upload/FILE-123-API')
      .attach('file', Buffer.from('nope'), {
        contentType: 'application/octet-stream',
        filename: 'malware.exe',
      })
      .expect(400);

    expect(response.body.message).toBe('Unsupported file type. Upload a PDF, PPT, DOC, or image file.');
    expect(mockUploadSharedFileToS3).not.toHaveBeenCalled();
  });

  it('rejects oversized files', async () => {
    const response = await request(app)
      .post('/api/files/upload/FILE-123-API')
      .attach('file', Buffer.alloc(SHARED_FILE_SIZE_LIMIT + 1), {
        contentType: 'application/pdf',
        filename: 'too-large.pdf',
      })
      .expect(413);

    expect(response.body.message).toBe('File is too large. Maximum upload size is 25 MB.');
    expect(mockUploadSharedFileToS3).not.toHaveBeenCalled();
  });

  it('accepts valid files, stores metadata, and uses mocked S3 upload response', async () => {
    const response = await request(app)
      .post('/api/files/upload/FILE-123-API')
      .field('name', 'Ada Lovelace')
      .field('userId', 'user-1')
      .attach('file', Buffer.from('%PDF-1.4 test'), {
        contentType: 'application/pdf',
        filename: 'deck.pdf',
      })
      .expect(201);

    const storedFile = await File.findById(response.body.file._id);

    expect(storedFile.fileName).toBe('deck.pdf');
    expect(storedFile.fileUrl).toBe('https://cdn.example.test/vync/meetings/FILE-123-API/files/mock-deck.pdf');
    expect(storedFile.s3Key).toBe('vync/meetings/FILE-123-API/files/mock-deck.pdf');
    expect(mockUploadSharedFileToS3).toHaveBeenCalledWith(
      expect.objectContaining({ meetingId: 'FILE-123-API' }),
    );
  });
});

describe('recording upload API', () => {
  beforeEach(() => {
    mockUploadRecordingToS3.mockClear();
  });

  it('rejects unsupported recording types', async () => {
    const response = await request(app)
      .post('/api/recordings/upload/REC-123-API')
      .attach('recording', Buffer.from('bad recording'), {
        contentType: 'application/pdf',
        filename: 'meeting.pdf',
      })
      .expect(400);

    expect(response.body.message).toBe('Unsupported recording type. Upload a WEBM, MP4, M4A, or MP3 file.');
    expect(mockUploadRecordingToS3).not.toHaveBeenCalled();
  });

  it('accepts valid recording metadata with mocked S3 upload', async () => {
    const response = await request(app)
      .post('/api/recordings/upload/REC-123-API')
      .field('durationSeconds', '42')
      .field('name', 'Ada Lovelace')
      .attach('recording', Buffer.from('webm recording'), {
        contentType: 'video/webm',
        filename: 'meeting.webm',
      })
      .expect(201);

    const storedRecording = await Recording.findById(response.body.recording._id);

    expect(storedRecording.durationSeconds).toBe(42);
    expect(storedRecording.fileUrl).toBe(
      'https://cdn.example.test/vync/meetings/REC-123-API/recordings/mock-meeting.webm',
    );
    expect(storedRecording.storageProvider).toBe('s3');
    expect(mockUploadRecordingToS3).toHaveBeenCalledWith(
      expect.objectContaining({ meetingId: 'REC-123-API' }),
    );
  });
});
