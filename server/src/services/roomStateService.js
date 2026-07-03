import { getRedisClient } from '../config/redis.js';
import { normalizeMeetingId } from '../utils/normalizeMeetingId.js';

export const ACTIVE_ROOM_TTL_SECONDS = 6 * 60 * 60;
export const ENDED_ROOM_TTL_SECONDS = 30 * 60;

export const defaultPermissions = {
  allowChat: true,
  allowScreenShare: true,
  allowWhiteboard: true,
  allowFileShare: true,
};

export const defaultSharedFileState = {
  activeFile: null,
  currentPage: 1,
};

export const defaultRecordingState = {
  isRecording: false,
  startedAt: null,
  startedBy: null,
};

export const defaultCodeState = {
  code: '// Start coding together\n',
  language: 'javascript',
  activeUser: null,
  cursors: {},
  version: 0,
};

function roomKeys(roomId) {
  return {
    state: `room:${roomId}:state`,
    participants: `room:${roomId}:participants`,
    waiting: `room:${roomId}:waiting`,
    whiteboard: `room:${roomId}:whiteboard`,
    code: `room:${roomId}:code`,
  };
}

function safeJsonParse(value, fallback) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function serialize(value) {
  return JSON.stringify(value);
}

function normalizeRoomId(roomId) {
  return normalizeMeetingId(roomId);
}

function defaultRoomState(roomId) {
  return {
    roomId,
    permissions: { ...defaultPermissions },
    sharedFile: { ...defaultSharedFileState },
    recording: { ...defaultRecordingState },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function participantsObjectToArray(participants = {}) {
  return Object.values(participants)
    .map((participant) => safeJsonParse(participant, null))
    .filter(Boolean);
}

function makeMemoryRoom(roomId) {
  return {
    state: defaultRoomState(roomId),
    participants: new Map(),
    waiting: new Map(),
    whiteboard: [],
    code: null,
    expiresAt: Date.now() + ACTIVE_ROOM_TTL_SECONDS * 1000,
  };
}

export function createRoomStateService({
  redisClientProvider = getRedisClient,
  logger = console,
} = {}) {
  const memoryRooms = new Map();

  function pruneExpiredRoom(roomId) {
    const room = memoryRooms.get(roomId);

    if (room?.expiresAt && room.expiresAt <= Date.now()) {
      memoryRooms.delete(roomId);
      return true;
    }

    return false;
  }

  function getMemoryRoom(roomId) {
    pruneExpiredRoom(roomId);

    if (!memoryRooms.has(roomId)) {
      memoryRooms.set(roomId, makeMemoryRoom(roomId));
    }

    return memoryRooms.get(roomId);
  }

  function touchMemoryRoom(roomId, ttlSeconds = ACTIVE_ROOM_TTL_SECONDS) {
    const room = getMemoryRoom(roomId);
    room.expiresAt = Date.now() + ttlSeconds * 1000;
    room.state.updatedAt = new Date().toISOString();
    return room;
  }

  async function getClient() {
    try {
      return await redisClientProvider();
    } catch (error) {
      logger.error(`Redis room state unavailable. Using in-memory fallback: ${error.message}`);
      return null;
    }
  }

  async function withRedisFallback(operationName, redisOperation, fallbackOperation) {
    const client = await getClient();

    if (!client?.isReady) {
      return fallbackOperation();
    }

    try {
      return await redisOperation(client);
    } catch (error) {
      logger.error(`Redis ${operationName} failed. Using in-memory fallback: ${error.message}`);
      return fallbackOperation();
    }
  }

  async function expireRoomKeys(client, roomId, ttlSeconds = ACTIVE_ROOM_TTL_SECONDS) {
    const keys = roomKeys(roomId);
    await Promise.all(Object.values(keys).map((key) => client.expire(key, ttlSeconds)));
  }

  async function createRoomState(roomId, updates = {}) {
    const normalizedRoomId = normalizeRoomId(roomId);
    if (!normalizedRoomId) {
      return null;
    }

    const nextState = {
      ...defaultRoomState(normalizedRoomId),
      ...updates,
      permissions: {
        ...defaultPermissions,
        ...(updates.permissions || {}),
      },
      sharedFile: {
        ...defaultSharedFileState,
        ...(updates.sharedFile || {}),
      },
      recording: {
        ...defaultRecordingState,
        ...(updates.recording || {}),
      },
      updatedAt: new Date().toISOString(),
    };

    return withRedisFallback(
      'create room state',
      async (client) => {
        const keys = roomKeys(normalizedRoomId);
        await client.set(keys.state, serialize(nextState), { EX: ACTIVE_ROOM_TTL_SECONDS });
        await expireRoomKeys(client, normalizedRoomId);
        return nextState;
      },
      () => {
        const room = touchMemoryRoom(normalizedRoomId);
        room.state = nextState;
        return nextState;
      },
    );
  }

  async function getRoomState(roomId) {
    const normalizedRoomId = normalizeRoomId(roomId);
    if (!normalizedRoomId) {
      return null;
    }

    return withRedisFallback(
      'get room state',
      async (client) => {
        const state = safeJsonParse(await client.get(roomKeys(normalizedRoomId).state), null);
        if (state) {
          await expireRoomKeys(client, normalizedRoomId);
          return {
            ...defaultRoomState(normalizedRoomId),
            ...state,
            permissions: { ...defaultPermissions, ...(state.permissions || {}) },
            sharedFile: { ...defaultSharedFileState, ...(state.sharedFile || {}) },
            recording: { ...defaultRecordingState, ...(state.recording || {}) },
          };
        }

        return createRoomState(normalizedRoomId);
      },
      () => touchMemoryRoom(normalizedRoomId).state,
    );
  }

  async function updateRoomState(roomId, updates = {}) {
    const normalizedRoomId = normalizeRoomId(roomId);
    if (!normalizedRoomId) {
      return null;
    }

    const currentState = await getRoomState(normalizedRoomId);
    const nextState = {
      ...currentState,
      ...updates,
      permissions: {
        ...(currentState?.permissions || defaultPermissions),
        ...(updates.permissions || {}),
      },
      sharedFile: {
        ...(currentState?.sharedFile || defaultSharedFileState),
        ...(updates.sharedFile || {}),
      },
      recording: {
        ...(currentState?.recording || defaultRecordingState),
        ...(updates.recording || {}),
      },
      updatedAt: new Date().toISOString(),
    };

    return createRoomState(normalizedRoomId, nextState);
  }

  async function deleteRoomState(roomId) {
    const normalizedRoomId = normalizeRoomId(roomId);
    if (!normalizedRoomId) {
      return;
    }

    await withRedisFallback(
      'delete room state',
      async (client) => {
        await client.del(Object.values(roomKeys(normalizedRoomId)));
      },
      () => {
        memoryRooms.delete(normalizedRoomId);
      },
    );
  }

  async function expireRoomState(roomId, ttlSeconds = ENDED_ROOM_TTL_SECONDS) {
    const normalizedRoomId = normalizeRoomId(roomId);
    if (!normalizedRoomId) {
      return;
    }

    await withRedisFallback(
      'expire room state',
      async (client) => {
        await expireRoomKeys(client, normalizedRoomId, ttlSeconds);
      },
      () => {
        touchMemoryRoom(normalizedRoomId, ttlSeconds);
      },
    );
  }

  async function addParticipant(roomId, participant) {
    const normalizedRoomId = normalizeRoomId(roomId);
    if (!normalizedRoomId || !participant?.socketId) {
      return null;
    }

    const participantWithDefaults = {
      ...participant,
      permissions: {
        ...defaultPermissions,
        ...(participant.permissions || {}),
      },
    };

    return withRedisFallback(
      'add participant',
      async (client) => {
        await getRoomState(normalizedRoomId);
        await client.hSet(
          roomKeys(normalizedRoomId).participants,
          participantWithDefaults.socketId,
          serialize(participantWithDefaults),
        );
        await expireRoomKeys(client, normalizedRoomId);
        return participantWithDefaults;
      },
      () => {
        const room = touchMemoryRoom(normalizedRoomId);
        room.participants.set(participantWithDefaults.socketId, participantWithDefaults);
        return participantWithDefaults;
      },
    );
  }

  async function getParticipants(roomId) {
    const normalizedRoomId = normalizeRoomId(roomId);
    if (!normalizedRoomId) {
      return [];
    }

    return withRedisFallback(
      'get participants',
      async (client) => {
        await getRoomState(normalizedRoomId);
        const participants = await client.hGetAll(roomKeys(normalizedRoomId).participants);
        await expireRoomKeys(client, normalizedRoomId);
        return participantsObjectToArray(participants);
      },
      () => Array.from(touchMemoryRoom(normalizedRoomId).participants.values()),
    );
  }

  async function getParticipant(roomId, socketId) {
    if (!socketId) {
      return null;
    }

    const normalizedRoomId = normalizeRoomId(roomId);
    if (!normalizedRoomId) {
      return null;
    }

    return withRedisFallback(
      'get participant',
      async (client) => {
        const participant = safeJsonParse(
          await client.hGet(roomKeys(normalizedRoomId).participants, socketId),
          null,
        );
        await expireRoomKeys(client, normalizedRoomId);
        return participant;
      },
      () => touchMemoryRoom(normalizedRoomId).participants.get(socketId) || null,
    );
  }

  async function removeParticipant(roomId, socketId) {
    const participant = await getParticipant(roomId, socketId);
    const normalizedRoomId = normalizeRoomId(roomId);
    if (!normalizedRoomId || !socketId) {
      return null;
    }

    await withRedisFallback(
      'remove participant',
      async (client) => {
        await client.hDel(roomKeys(normalizedRoomId).participants, socketId);
        await expireRoomKeys(client, normalizedRoomId);
      },
      () => {
        touchMemoryRoom(normalizedRoomId).participants.delete(socketId);
      },
    );

    return participant;
  }

  async function updateParticipant(roomId, socketId, updates = {}) {
    const participant = await getParticipant(roomId, socketId);
    if (!participant) {
      return null;
    }

    const nextParticipant = {
      ...participant,
      ...updates,
      permissions: {
        ...(participant.permissions || defaultPermissions),
        ...(updates.permissions || {}),
      },
    };

    return addParticipant(roomId, nextParticipant);
  }

  async function updateParticipantMediaState(roomId, socketId, updates = {}) {
    const validUpdates = {};
    ['micOn', 'cameraOn', 'isScreenSharing'].forEach((key) => {
      if (typeof updates[key] === 'boolean') {
        validUpdates[key] = updates[key];
      }
    });

    return updateParticipant(roomId, socketId, validUpdates);
  }

  async function updateHandRaiseState(roomId, socketId, handRaised) {
    return updateParticipant(roomId, socketId, { handRaised: Boolean(handRaised) });
  }

  async function updateParticipantRole(roomId, socketId, role) {
    if (!['host', 'cohost', 'participant', 'guest'].includes(role)) {
      return null;
    }

    return updateParticipant(roomId, socketId, { role });
  }

  async function findParticipantByTarget(roomId, target) {
    if (!target) {
      return null;
    }

    const participants = await getParticipants(roomId);
    return (
      participants.find((participant) => participant.socketId === target) ||
      participants.find((participant) => participant.userId === target) ||
      null
    );
  }

  async function setParticipantsPermissions(roomId, permissions) {
    const participants = await getParticipants(roomId);
    const nextParticipants = await Promise.all(
      participants.map((participant) =>
        updateParticipant(roomId, participant.socketId, { permissions }),
      ),
    );

    return nextParticipants.filter(Boolean);
  }

  async function addWaitingParticipant(roomId, participant) {
    const normalizedRoomId = normalizeRoomId(roomId);
    if (!normalizedRoomId || !participant?.socketId) {
      return null;
    }

    return withRedisFallback(
      'add waiting participant',
      async (client) => {
        await getRoomState(normalizedRoomId);
        await client.hSet(
          roomKeys(normalizedRoomId).waiting,
          participant.socketId,
          serialize(participant),
        );
        await expireRoomKeys(client, normalizedRoomId);
        return participant;
      },
      () => {
        touchMemoryRoom(normalizedRoomId).waiting.set(participant.socketId, participant);
        return participant;
      },
    );
  }

  async function getWaitingParticipants(roomId) {
    const normalizedRoomId = normalizeRoomId(roomId);
    if (!normalizedRoomId) {
      return [];
    }

    return withRedisFallback(
      'get waiting participants',
      async (client) => {
        await getRoomState(normalizedRoomId);
        const participants = await client.hGetAll(roomKeys(normalizedRoomId).waiting);
        await expireRoomKeys(client, normalizedRoomId);
        return participantsObjectToArray(participants);
      },
      () => Array.from(touchMemoryRoom(normalizedRoomId).waiting.values()),
    );
  }

  async function getWaitingParticipant(roomId, socketId) {
    const normalizedRoomId = normalizeRoomId(roomId);
    if (!normalizedRoomId || !socketId) {
      return null;
    }

    return withRedisFallback(
      'get waiting participant',
      async (client) => {
        const participant = safeJsonParse(
          await client.hGet(roomKeys(normalizedRoomId).waiting, socketId),
          null,
        );
        await expireRoomKeys(client, normalizedRoomId);
        return participant;
      },
      () => touchMemoryRoom(normalizedRoomId).waiting.get(socketId) || null,
    );
  }

  async function removeWaitingParticipant(roomId, socketId) {
    const participant = await getWaitingParticipant(roomId, socketId);
    const normalizedRoomId = normalizeRoomId(roomId);
    if (!normalizedRoomId || !socketId) {
      return null;
    }

    await withRedisFallback(
      'remove waiting participant',
      async (client) => {
        await client.hDel(roomKeys(normalizedRoomId).waiting, socketId);
        await expireRoomKeys(client, normalizedRoomId);
      },
      () => {
        touchMemoryRoom(normalizedRoomId).waiting.delete(socketId);
      },
    );

    return participant;
  }

  async function updateWaitingRoomState(roomId, participants = []) {
    const normalizedRoomId = normalizeRoomId(roomId);
    if (!normalizedRoomId) {
      return [];
    }

    return withRedisFallback(
      'update waiting room state',
      async (client) => {
        const keys = roomKeys(normalizedRoomId);
        await client.del(keys.waiting);
        if (participants.length) {
          await client.hSet(
            keys.waiting,
            Object.fromEntries(
              participants
                .filter((participant) => participant?.socketId)
                .map((participant) => [participant.socketId, serialize(participant)]),
            ),
          );
        }
        await expireRoomKeys(client, normalizedRoomId);
        return getWaitingParticipants(normalizedRoomId);
      },
      () => {
        const room = touchMemoryRoom(normalizedRoomId);
        room.waiting.clear();
        participants.forEach((participant) => {
          if (participant?.socketId) {
            room.waiting.set(participant.socketId, participant);
          }
        });
        return Array.from(room.waiting.values());
      },
    );
  }

  async function updateSharedFileState(roomId, state = {}) {
    const nextSharedFile = {
      ...defaultSharedFileState,
      ...state,
      currentPage: Math.max(Number(state.currentPage) || 1, 1),
    };

    const nextState = await updateRoomState(roomId, { sharedFile: nextSharedFile });
    return nextState?.sharedFile || nextSharedFile;
  }

  async function getSharedFileState(roomId) {
    const state = await getRoomState(roomId);
    return state?.sharedFile || { ...defaultSharedFileState };
  }

  async function updateRecordingState(roomId, state = {}) {
    const nextRecording = {
      ...defaultRecordingState,
      ...state,
    };

    const nextState = await updateRoomState(roomId, { recording: nextRecording });
    return nextState?.recording || nextRecording;
  }

  async function getRecordingState(roomId) {
    const state = await getRoomState(roomId);
    return state?.recording || { ...defaultRecordingState };
  }

  async function updateCodeEditorState(roomId, state = {}) {
    const normalizedRoomId = normalizeRoomId(roomId);
    if (!normalizedRoomId) {
      return null;
    }

    const nextCodeState = {
      ...defaultCodeState,
      ...state,
      cursors: state.cursors || {},
    };

    return withRedisFallback(
      'update code editor state',
      async (client) => {
        await getRoomState(normalizedRoomId);
        await client.set(roomKeys(normalizedRoomId).code, serialize(nextCodeState), {
          EX: ACTIVE_ROOM_TTL_SECONDS,
        });
        await expireRoomKeys(client, normalizedRoomId);
        return nextCodeState;
      },
      () => {
        const room = touchMemoryRoom(normalizedRoomId);
        room.code = nextCodeState;
        return nextCodeState;
      },
    );
  }

  async function getCodeEditorState(roomId) {
    const normalizedRoomId = normalizeRoomId(roomId);
    if (!normalizedRoomId) {
      return null;
    }

    return withRedisFallback(
      'get code editor state',
      async (client) => {
        const state = safeJsonParse(await client.get(roomKeys(normalizedRoomId).code), null);
        await expireRoomKeys(client, normalizedRoomId);
        return state ? { ...defaultCodeState, ...state, cursors: state.cursors || {} } : null;
      },
      () => touchMemoryRoom(normalizedRoomId).code,
    );
  }

  async function updateWhiteboardState(roomId, strokes = []) {
    const normalizedRoomId = normalizeRoomId(roomId);
    if (!normalizedRoomId) {
      return [];
    }

    const nextStrokes = Array.isArray(strokes) ? strokes.slice(-500) : [];

    return withRedisFallback(
      'update whiteboard state',
      async (client) => {
        await getRoomState(normalizedRoomId);
        await client.set(roomKeys(normalizedRoomId).whiteboard, serialize(nextStrokes), {
          EX: ACTIVE_ROOM_TTL_SECONDS,
        });
        await expireRoomKeys(client, normalizedRoomId);
        return nextStrokes;
      },
      () => {
        const room = touchMemoryRoom(normalizedRoomId);
        room.whiteboard = nextStrokes;
        return nextStrokes;
      },
    );
  }

  async function getWhiteboardState(roomId) {
    const normalizedRoomId = normalizeRoomId(roomId);
    if (!normalizedRoomId) {
      return [];
    }

    return withRedisFallback(
      'get whiteboard state',
      async (client) => {
        const strokes = safeJsonParse(await client.get(roomKeys(normalizedRoomId).whiteboard), []);
        await expireRoomKeys(client, normalizedRoomId);
        return Array.isArray(strokes) ? strokes : [];
      },
      () => touchMemoryRoom(normalizedRoomId).whiteboard,
    );
  }

  async function addWhiteboardStroke(roomId, stroke) {
    const strokes = await getWhiteboardState(roomId);
    return updateWhiteboardState(roomId, [...strokes, stroke].slice(-500));
  }

  async function clearWhiteboard(roomId) {
    return updateWhiteboardState(roomId, []);
  }

  async function removeWhiteboardStroke(roomId, predicate) {
    const strokes = await getWhiteboardState(roomId);
    const strokeIndex = [...strokes].reverse().findIndex(predicate);

    if (strokeIndex === -1) {
      return { removedStroke: null, strokes };
    }

    const actualIndex = strokes.length - 1 - strokeIndex;
    const nextStrokes = [...strokes];
    const [removedStroke] = nextStrokes.splice(actualIndex, 1);
    await updateWhiteboardState(roomId, nextStrokes);

    return { removedStroke, strokes: nextStrokes };
  }

  async function getRoomSnapshot(roomId) {
    const normalizedRoomId = normalizeRoomId(roomId);
    if (!normalizedRoomId) {
      return null;
    }

    const [state, participants, waiting, whiteboard, code] = await Promise.all([
      getRoomState(normalizedRoomId),
      getParticipants(normalizedRoomId),
      getWaitingParticipants(normalizedRoomId),
      getWhiteboardState(normalizedRoomId),
      getCodeEditorState(normalizedRoomId),
    ]);

    return {
      ...state,
      participants,
      waiting,
      whiteboard,
      code: code || { ...defaultCodeState, cursors: {} },
    };
  }

  return {
    addParticipant,
    addWaitingParticipant,
    addWhiteboardStroke,
    clearWhiteboard,
    createRoomState,
    deleteRoomState,
    expireRoomState,
    findParticipantByTarget,
    getCodeEditorState,
    getParticipant,
    getParticipants,
    getRecordingState,
    getRoomSnapshot,
    getRoomState,
    getSharedFileState,
    getWaitingParticipant,
    getWaitingParticipants,
    getWhiteboardState,
    removeParticipant,
    removeWaitingParticipant,
    removeWhiteboardStroke,
    setParticipantsPermissions,
    updateCodeEditorState,
    updateHandRaiseState,
    updateParticipant,
    updateParticipantMediaState,
    updateParticipantRole,
    updateRecordingState,
    updateRoomState,
    updateSharedFileState,
    updateWaitingRoomState,
    updateWhiteboardState,
  };
}

const roomStateService = createRoomStateService();

export default roomStateService;
