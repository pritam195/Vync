import http from 'http';
import { jest } from '@jest/globals';
import { Server } from 'socket.io';

jest.unstable_mockModule('../src/config/redis.js', () => ({
  closeRedisClient: jest.fn(async () => {}),
  getRedisClient: jest.fn(async () => null),
}));

const [{ io: createClient }, { default: registerSocketHandlers }, { default: roomStateService }] =
  await Promise.all([
    import('socket.io-client'),
    import('../src/socket/index.js'),
    import('../src/services/roomStateService.js'),
  ]);

const TEST_ROOM_ID = 'SIO-123-TST';

let httpServer;
let ioServer;
let serverUrl;
let sockets;
let roomIds;

function waitForServerListen(server) {
  return new Promise((resolve) => {
    server.listen(0, () => {
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function closeHttpServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        if (error.code === 'ERR_SERVER_NOT_RUNNING') {
          resolve();
          return;
        }

        reject(error);
        return;
      }

      resolve();
    });
  });
}

function waitForEvent(socket, eventName, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, handler);
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, timeoutMs);

    function handler(payload) {
      clearTimeout(timer);
      resolve(payload);
    }

    socket.once(eventName, handler);
  });
}

function expectNoEvent(socket, eventName, timeoutMs = 150) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, handler);
      resolve();
    }, timeoutMs);

    function handler(payload) {
      clearTimeout(timer);
      reject(new Error(`Unexpected ${eventName} event: ${JSON.stringify(payload)}`));
    }

    socket.once(eventName, handler);
  });
}

function emitWithAck(socket, eventName, payload = {}, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    socket.timeout(timeoutMs).emit(eventName, payload, (error, response) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(response);
    });
  });
}

async function connectClient(name) {
  const socket = createClient(serverUrl, {
    forceNew: true,
    reconnection: false,
    transports: ['websocket'],
  });

  sockets.push(socket);
  await waitForEvent(socket, 'connect');
  socket.testName = name;
  return socket;
}

async function joinRoom(socket, payload = {}) {
  const roomId = payload.roomId || TEST_ROOM_ID;
  roomIds.add(roomId);

  return emitWithAck(socket, 'join-room', {
    roomId,
    name: socket.testName || 'Test User',
    userId: `${socket.testName || 'user'}-id`,
    ...payload,
  });
}

function findParticipant(participants, socket) {
  return participants.find((participant) => participant.socketId === socket.id);
}

async function waitForParticipantMatch(socket, targetSocket, expectedState) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const participants = await waitForEvent(socket, 'update-participants');
    const participant = findParticipant(participants, targetSocket);
    const matches = Object.entries(expectedState).every(([key, value]) => participant?.[key] === value);

    if (matches) {
      return participants;
    }
  }

  throw new Error(`Timed out waiting for participant ${targetSocket.id} state ${JSON.stringify(expectedState)}`);
}

async function joinTwoClients(roomId = TEST_ROOM_ID) {
  const host = await connectClient('Host');
  const guest = await connectClient('Guest');

  await joinRoom(host, { roomId, role: 'host' });
  await joinRoom(guest, { roomId, role: 'participant' });

  return { guest, host, roomId };
}

beforeEach(async () => {
  sockets = [];
  roomIds = new Set();
  httpServer = http.createServer();
  ioServer = new Server(httpServer, {
    cors: {
      origin: '*',
    },
  });
  registerSocketHandlers(ioServer);
  serverUrl = await waitForServerListen(httpServer);
});

afterEach(async () => {
  sockets.forEach((socket) => {
    if (socket.connected) {
      socket.disconnect();
    }
  });

  await Promise.all([...roomIds].map((roomId) => roomStateService.deleteRoomState(roomId)));

  await new Promise((resolve) => ioServer.close(resolve));
  await closeHttpServer(httpServer);
});

describe('Socket.IO realtime meeting behavior', () => {
  it('allows a user to join a room', async () => {
    const host = await connectClient('Host');

    const acknowledgement = await joinRoom(host);

    expect(acknowledgement.ok).toBe(true);
    expect(acknowledgement.participant).toMatchObject({
      name: 'Host',
      role: 'host',
      socketId: host.id,
    });
    expect(acknowledgement.participants).toHaveLength(1);
  });

  it('sends updated participant lists to two users in the same room', async () => {
    const host = await connectClient('Host');
    const guest = await connectClient('Guest');

    await joinRoom(host);
    const hostUpdate = waitForEvent(host, 'update-participants');
    const guestUpdate = waitForEvent(guest, 'update-participants');
    await joinRoom(guest);

    const [hostParticipants, guestParticipants] = await Promise.all([hostUpdate, guestUpdate]);

    expect(hostParticipants).toHaveLength(2);
    expect(guestParticipants).toHaveLength(2);
    expect(hostParticipants.map((participant) => participant.name)).toEqual(
      expect.arrayContaining(['Host', 'Guest']),
    );
  });

  it('broadcasts public chat messages to the room', async () => {
    const { guest, host, roomId } = await joinTwoClients();
    const receivedByHost = waitForEvent(host, 'receive-message');
    const receivedByGuest = waitForEvent(guest, 'receive-message');

    const acknowledgement = await emitWithAck(host, 'send-message', {
      roomId,
      message: 'Hello everyone',
    });

    const [hostMessage, guestMessage] = await Promise.all([receivedByHost, receivedByGuest]);

    expect(acknowledgement.ok).toBe(true);
    expect(hostMessage.message).toBe('Hello everyone');
    expect(guestMessage.message).toBe('Hello everyone');
    expect(guestMessage.receiver).toBeNull();
  });

  it('sends private messages only to the intended receiver and sender', async () => {
    const { guest, host, roomId } = await joinTwoClients();
    const observer = await connectClient('Observer');
    await joinRoom(observer, { roomId });

    const hostPrivateMessage = waitForEvent(host, 'private-message');
    const guestPrivateMessage = waitForEvent(guest, 'private-message');
    const observerNoPrivateMessage = expectNoEvent(observer, 'private-message');

    const acknowledgement = await emitWithAck(host, 'private-message', {
      roomId,
      message: 'For your eyes only',
      receiverSocketId: guest.id,
    });

    const [senderMessage, receiverMessage] = await Promise.all([
      hostPrivateMessage,
      guestPrivateMessage,
      observerNoPrivateMessage.then(() => null),
    ]);

    expect(acknowledgement.ok).toBe(true);
    expect(senderMessage.receiver.socketId).toBe(guest.id);
    expect(receiverMessage.message).toBe('For your eyes only');
  });

  it('updates participant state when mic and camera are toggled', async () => {
    const { guest, host, roomId } = await joinTwoClients();

    const micUpdate = waitForParticipantMatch(host, guest, { micOn: false });
    guest.emit('toggle-mic', { roomId, micOn: false });
    await micUpdate;

    const cameraUpdate = waitForParticipantMatch(host, guest, { cameraOn: false, micOn: false });
    guest.emit('toggle-camera', { roomId, cameraOn: false });

    const participants = await cameraUpdate;

    expect(findParticipant(participants, guest)).toMatchObject({
      cameraOn: false,
      micOn: false,
    });
  });

  it('updates participant state when a hand is raised', async () => {
    const { guest, host, roomId } = await joinTwoClients();
    const participantUpdate = waitForEvent(host, 'update-participants');

    guest.emit('raise-hand', { roomId });

    const participants = await participantUpdate;

    expect(findParticipant(participants, guest)).toMatchObject({ handRaised: true });
  });

  it('allows the host to remove a participant', async () => {
    const { guest, host, roomId } = await joinTwoClients();
    const removed = waitForEvent(guest, 'remove-user');
    const hostParticipantUpdate = waitForEvent(host, 'update-participants');

    host.emit('remove-user', { roomId, targetSocketId: guest.id });

    const [removePayload, participants] = await Promise.all([removed, hostParticipantUpdate]);

    expect(removePayload.roomId).toBe(roomId);
    expect(participants.map((participant) => participant.socketId)).not.toContain(guest.id);
  });

  it('allows the host to make another participant a co-host', async () => {
    const { guest, host, roomId } = await joinTwoClients();
    const promoted = waitForEvent(guest, 'make-cohost');
    const participantUpdate = waitForEvent(host, 'update-participants');

    host.emit('make-cohost', { roomId, targetSocketId: guest.id });

    const [cohostPayload, participants] = await Promise.all([promoted, participantUpdate]);

    expect(cohostPayload).toMatchObject({ role: 'cohost', socketId: guest.id });
    expect(findParticipant(participants, guest).role).toBe('cohost');
  });

  it('supports waiting room approval and rejection', async () => {
    const host = await connectClient('Host');
    const approvedGuest = await connectClient('Approved Guest');
    const rejectedGuest = await connectClient('Rejected Guest');

    await joinRoom(host, { roomId: TEST_ROOM_ID, role: 'host' });

    const firstRequest = waitForEvent(host, 'waiting-room-request');
    const waitingAck = await joinRoom(approvedGuest, {
      roomId: TEST_ROOM_ID,
      waitingRoomEnabled: true,
    });
    const waitingParticipant = await firstRequest;

    expect(waitingAck).toMatchObject({ ok: false, waiting: true });
    expect(waitingParticipant.socketId).toBe(approvedGuest.id);

    const approved = waitForEvent(approvedGuest, 'approve-user');
    host.emit('approve-user', { roomId: TEST_ROOM_ID, targetSocketId: approvedGuest.id });
    const approvedPayload = await approved;

    expect(approvedPayload.participant.socketId).toBe(approvedGuest.id);
    expect(approvedPayload.participants.map((participant) => participant.socketId)).toContain(
      approvedGuest.id,
    );

    const secondRequest = waitForEvent(host, 'waiting-room-request');
    await joinRoom(rejectedGuest, {
      roomId: TEST_ROOM_ID,
      waitingRoomEnabled: true,
    });
    await secondRequest;

    const rejected = waitForEvent(rejectedGuest, 'reject-user');
    host.emit('reject-user', { roomId: TEST_ROOM_ID, targetSocketId: rejectedGuest.id });
    const rejectedPayload = await rejected;

    expect(rejectedPayload.roomId).toBe(TEST_ROOM_ID);
  });

  it('broadcasts whiteboard draw events', async () => {
    const { guest, host, roomId } = await joinTwoClients();
    const drawReceived = waitForEvent(guest, 'whiteboard-draw');

    const acknowledgement = await emitWithAck(host, 'whiteboard-draw', {
      roomId,
      stroke: {
        color: '#123abc',
        id: 'stroke-1',
        points: [
          { x: 0.1, y: 0.1 },
          { x: 0.5, y: 0.5 },
        ],
        size: 4,
        tool: 'pen',
      },
    });

    const drawPayload = await drawReceived;

    expect(acknowledgement.ok).toBe(true);
    expect(drawPayload.stroke).toMatchObject({ color: '#123abc', id: 'stroke-1' });
  });

  it('broadcasts code changes to other participants', async () => {
    const { guest, host, roomId } = await joinTwoClients();
    const codeChanged = waitForEvent(guest, 'code-change');

    const acknowledgement = await emitWithAck(host, 'code-change', {
      code: 'console.log("sync");',
      language: 'javascript',
      roomId,
    });

    const codePayload = await codeChanged;

    expect(acknowledgement.ok).toBe(true);
    expect(codePayload).toMatchObject({
      code: 'console.log("sync");',
      language: 'javascript',
    });
    expect(codePayload.activeUser.socketId).toBe(host.id);
  });

  it('synchronizes open shared file events', async () => {
    const { guest, host, roomId } = await joinTwoClients();
    const opened = waitForEvent(guest, 'open-shared-file');
    const file = { _id: 'file-1', fileName: 'deck.pdf', fileUrl: 'https://cdn.example.test/deck.pdf' };

    host.emit('open-shared-file', { currentPage: 3, file, roomId });

    const openPayload = await opened;

    expect(openPayload).toMatchObject({
      activeFile: file,
      currentPage: 3,
    });
    expect(openPayload.openedBy.socketId).toBe(host.id);
  });

  it('broadcasts recording started and stopped state', async () => {
    const { guest, host, roomId } = await joinTwoClients();
    const started = waitForEvent(guest, 'recording-started');

    const startAck = await emitWithAck(host, 'recording-started', { roomId });
    const startedPayload = await started;

    expect(startAck.ok).toBe(true);
    expect(startedPayload).toMatchObject({
      isRecording: true,
      startedBy: expect.objectContaining({ socketId: host.id }),
    });

    const stopped = waitForEvent(guest, 'recording-stopped');
    const stopAck = await emitWithAck(host, 'recording-stopped', { roomId });
    const stoppedPayload = await stopped;

    expect(stopAck.ok).toBe(true);
    expect(stoppedPayload).toMatchObject({
      isRecording: false,
      stoppedBy: expect.objectContaining({ socketId: host.id }),
    });
  });

  it('forwards WebRTC offer, answer, and ICE candidate events to the correct peer', async () => {
    const { guest, host } = await joinTwoClients();
    const offerReceived = waitForEvent(guest, 'offer');

    host.emit('offer', {
      description: { sdp: 'offer-sdp', type: 'offer' },
      targetSocketId: guest.id,
    });

    await expect(offerReceived).resolves.toMatchObject({
      description: { sdp: 'offer-sdp', type: 'offer' },
      fromSocketId: host.id,
    });

    const answerReceived = waitForEvent(host, 'answer');
    guest.emit('answer', {
      description: { sdp: 'answer-sdp', type: 'answer' },
      targetSocketId: host.id,
    });

    await expect(answerReceived).resolves.toMatchObject({
      description: { sdp: 'answer-sdp', type: 'answer' },
      fromSocketId: guest.id,
    });

    const candidateReceived = waitForEvent(guest, 'ice-candidate');
    host.emit('ice-candidate', {
      candidate: { candidate: 'candidate:1 1 udp 1 127.0.0.1 9 typ host' },
      targetSocketId: guest.id,
    });

    await expect(candidateReceived).resolves.toMatchObject({
      candidate: { candidate: 'candidate:1 1 udp 1 127.0.0.1 9 typ host' },
      fromSocketId: host.id,
    });
  });
});
