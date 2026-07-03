import assert from 'node:assert/strict';
import {
  createRoomStateService,
  defaultPermissions,
  defaultSharedFileState,
} from '../src/services/roomStateService.js';

function createTestService() {
  return createRoomStateService({
    redisClientProvider: async () => null,
    logger: {
      error() {},
      log() {},
    },
  });
}

describe('roomStateService memory fallback', () => {
  it('creates room state with default realtime fields', async () => {
    const service = createTestService();

    const state = await service.createRoomState('abc-123-xyz');

    assert.equal(state.roomId, 'ABC-123-XYZ');
    assert.deepEqual(state.permissions, defaultPermissions);
    assert.deepEqual(state.sharedFile, defaultSharedFileState);
    assert.equal(state.recording.isRecording, false);
  });

  it('adds, updates, and removes participants', async () => {
    const service = createTestService();
    const participant = {
      userId: 'user-1',
      name: 'Host',
      socketId: 'socket-1',
      role: 'host',
      micOn: true,
      cameraOn: true,
      handRaised: false,
      isScreenSharing: false,
      permissions: defaultPermissions,
    };

    await service.addParticipant('abc-123-xyz', participant);
    await service.updateParticipantMediaState('abc-123-xyz', 'socket-1', {
      micOn: false,
      isScreenSharing: true,
    });
    await service.updateHandRaiseState('abc-123-xyz', 'socket-1', true);

    const [updatedParticipant] = await service.getParticipants('abc-123-xyz');
    assert.equal(updatedParticipant.micOn, false);
    assert.equal(updatedParticipant.isScreenSharing, true);
    assert.equal(updatedParticipant.handRaised, true);

    const removedParticipant = await service.removeParticipant('abc-123-xyz', 'socket-1');
    assert.equal(removedParticipant.socketId, 'socket-1');
    assert.deepEqual(await service.getParticipants('abc-123-xyz'), []);
  });

  it('tracks waiting room participants separately from admitted participants', async () => {
    const service = createTestService();
    const guest = {
      userId: 'guest-1',
      name: 'Guest',
      socketId: 'socket-guest',
      role: 'guest',
    };

    await service.addWaitingParticipant('abc-123-xyz', guest);

    assert.deepEqual(await service.getParticipants('abc-123-xyz'), []);
    assert.equal((await service.getWaitingParticipants('abc-123-xyz')).length, 1);

    const approvedGuest = await service.removeWaitingParticipant('abc-123-xyz', 'socket-guest');
    await service.addParticipant('abc-123-xyz', approvedGuest);

    assert.deepEqual(await service.getWaitingParticipants('abc-123-xyz'), []);
    assert.equal((await service.getParticipants('abc-123-xyz')).length, 1);
  });

  it('updates shared file, recording, code, and whiteboard state', async () => {
    const service = createTestService();

    const sharedFile = await service.updateSharedFileState('abc-123-xyz', {
      activeFile: { _id: 'file-1', fileName: 'deck.pdf' },
      currentPage: 3,
    });
    const recording = await service.updateRecordingState('abc-123-xyz', {
      isRecording: true,
      startedAt: '2026-06-30T00:00:00.000Z',
      startedBy: { socketId: 'socket-1', name: 'Host' },
    });
    const code = await service.updateCodeEditorState('abc-123-xyz', {
      code: 'console.log("hello");',
      language: 'javascript',
      activeUser: { socketId: 'socket-1', name: 'Host' },
      cursors: {},
      version: 123,
    });
    await service.addWhiteboardStroke('abc-123-xyz', {
      id: 'stroke-1',
      authorSocketId: 'socket-1',
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.2, y: 0.2 },
      ],
    });

    assert.equal(sharedFile.currentPage, 3);
    assert.equal(recording.isRecording, true);
    assert.equal(code.code, 'console.log("hello");');
    assert.equal((await service.getWhiteboardState('abc-123-xyz')).length, 1);
  });

  it('expires inactive rooms back to empty state', async () => {
    const service = createTestService();

    await service.addParticipant('abc-123-xyz', {
      userId: 'user-1',
      name: 'Host',
      socketId: 'socket-1',
      role: 'host',
    });
    await service.expireRoomState('abc-123-xyz', 0.001);
    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });

    assert.deepEqual(await service.getParticipants('abc-123-xyz'), []);
  });
});
