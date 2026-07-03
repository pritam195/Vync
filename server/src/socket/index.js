import jwt from 'jsonwebtoken';
import ChatMessage from '../models/ChatMessage.js';
import Meeting from '../models/Meeting.js';
import roomStateService, {
  defaultCodeState,
  defaultPermissions,
  defaultRecordingState,
  defaultSharedFileState,
} from '../services/roomStateService.js';
import { logActivity } from '../utils/activityLog.js';
import { normalizeMeetingId as normalizeRoomId } from '../utils/normalizeMeetingId.js';

async function getRoom(roomId) {
  const normalizedRoomId = normalizeRoomId(roomId);

  if (!normalizedRoomId) {
    return {
      roomId: '',
      participants: [],
    };
  }

  await roomStateService.getRoomState(normalizedRoomId);
  const participants = await roomStateService.getParticipants(normalizedRoomId);

  return {
    roomId: normalizedRoomId,
    participants,
  };
}

async function ensureCodeState(roomId) {
  const existingState = await roomStateService.getCodeEditorState(roomId);

  if (existingState) {
    return existingState;
  }

  const meeting = await Meeting.findOne({ meetingId: roomId }).select('codeSnapshot').lean();
  const savedSnapshot = meeting?.codeSnapshot;
  const codeState = {
    ...defaultCodeState,
    code: typeof savedSnapshot?.code === 'string' ? savedSnapshot.code : defaultCodeState.code,
    language: sanitizeLanguage(savedSnapshot?.language || defaultCodeState.language),
    activeUser: savedSnapshot?.updatedBy?.name
      ? {
          userId: savedSnapshot.updatedBy.userId || '',
          name: savedSnapshot.updatedBy.name,
          socketId: savedSnapshot.updatedBy.socketId || '',
          role: 'participant',
        }
      : null,
    cursors: {},
    version: savedSnapshot?.updatedAt ? new Date(savedSnapshot.updatedAt).getTime() : 0,
  };

  await roomStateService.updateCodeEditorState(roomId, codeState);
  return codeState;
}

async function getParticipants(roomId) {
  return roomStateService.getParticipants(roomId);
}

async function emitParticipants(io, roomId) {
  io.to(roomId).emit('update-participants', await getParticipants(roomId));
}

async function getWaitingParticipants(roomId) {
  return roomStateService.getWaitingParticipants(roomId);
}

async function emitWaitingRoom(io, roomId) {
  io.to(roomId).emit('update-waiting-room', await getWaitingParticipants(roomId));
}

async function getPermissions(roomId) {
  const state = await roomStateService.getRoomState(roomId);
  return state?.permissions || defaultPermissions;
}

async function emitPermissions(io, roomId) {
  io.to(roomId).emit('update-permissions', await getPermissions(roomId));
}

function participantFromPayload(socket, participantCount, permissions, payload = {}) {
  const requestedRole = ['host', 'cohost', 'participant', 'guest'].includes(payload.role)
    ? payload.role
    : 'participant';
  const isFirstParticipant = participantCount === 0;
  const userId = String(payload.userId || socket.user?.userId || socket.id);

  return {
    userId,
    name: String(payload.name || 'Guest').trim() || 'Guest',
    socketId: socket.id,
    role: isFirstParticipant ? 'host' : requestedRole,
    micOn: payload.micOn !== false,
    cameraOn: payload.cameraOn !== false,
    handRaised: Boolean(payload.handRaised),
    isScreenSharing: Boolean(payload.isScreenSharing),
    permissions: { ...permissions },
  };
}

function findParticipantByTarget(roomParticipants = [], target) {
  if (!target) {
    return null;
  }

  return roomParticipants.find(
    (participant) => participant.socketId === target || participant.userId === target,
  );
}

function canModerate(participant) {
  return participant?.role === 'host' || participant?.role === 'cohost';
}

async function canUseWhiteboard(participant, roomId) {
  const permissions = await getPermissions(roomId);
  return Boolean(participant && (permissions.allowWhiteboard || canModerate(participant)));
}

function sanitizeWhiteboardStroke(payload = {}, participant) {
  const points = Array.isArray(payload.points)
    ? payload.points
        .map((point) => ({
          x: Number(point?.x),
          y: Number(point?.y),
        }))
        .filter(
          (point) =>
            Number.isFinite(point.x) &&
            Number.isFinite(point.y) &&
            point.x >= 0 &&
            point.x <= 1 &&
            point.y >= 0 &&
            point.y <= 1,
        )
        .slice(0, 1000)
    : [];

  if (points.length < 2) {
    return null;
  }

  const size = Number(payload.size);
  const safeSize = Number.isFinite(size) ? Math.min(Math.max(size, 1), 80) : 4;
  const color = /^#[0-9a-f]{6}$/i.test(payload.color) ? payload.color : '#0f172a';

  return {
    id: String(payload.id || `${participant.socketId}-${Date.now()}`),
    tool: payload.tool === 'eraser' ? 'eraser' : 'pen',
    color,
    size: safeSize,
    points,
    authorSocketId: participant.socketId,
    authorName: participant.name,
    createdAt: new Date().toISOString(),
  };
}

async function emitToModerators(io, roomId, eventName, payload) {
  const participants = await getParticipants(roomId);

  participants.forEach((participant) => {
    if (canModerate(participant)) {
      io.to(participant.socketId).emit(eventName, payload);
    }
  });
}

function chatPersonFromParticipant(participant) {
  return {
    userId: participant.userId,
    name: participant.name,
    socketId: participant.socketId,
    role: participant.role,
  };
}

function editorPersonFromParticipant(participant) {
  return {
    userId: participant.userId,
    name: participant.name,
    socketId: participant.socketId,
    role: participant.role,
  };
}

function sanitizeLanguage(language) {
  const allowedLanguages = new Set([
    'javascript',
    'typescript',
    'python',
    'java',
    'csharp',
    'cpp',
    'go',
    'html',
    'css',
    'json',
    'markdown',
  ]);

  return allowedLanguages.has(language) ? language : 'javascript';
}

async function persistCodeSnapshot(roomId, state, participant) {
  try {
    await Meeting.updateOne(
      { meetingId: roomId },
      {
        $set: {
          codeSnapshot: {
            code: state.code,
            language: state.language,
            updatedBy: {
              userId: participant.userId,
              name: participant.name,
              socketId: participant.socketId,
            },
            updatedAt: new Date(),
          },
        },
      },
    );
  } catch (error) {
    console.error('Could not save code snapshot:', error);
  }
}

function calculateDurationSeconds(startedAt, endedAt) {
  if (!startedAt || !endedAt) {
    return 0;
  }

  return Math.max(Math.round((new Date(endedAt) - new Date(startedAt)) / 1000), 0);
}

function logSocketLifecycle(message) {
  if (process.env.NODE_ENV !== 'test') {
    console.log(message);
  }
}

async function createChatMessage(roomId, participant, payload = {}) {
  const receiver = payload.receiverSocketId
    ? await roomStateService.getParticipant(roomId, payload.receiverSocketId)
    : null;
  const message = String(payload.message || '').trim();
  const type = ['text', 'file', 'emoji', 'system'].includes(payload.type) ? payload.type : 'text';

  if (!message) {
    return null;
  }

  const messageRecord = await ChatMessage.create({
    meetingId: roomId,
    sender: chatPersonFromParticipant(participant),
    receiver: receiver ? chatPersonFromParticipant(receiver) : null,
    message,
    type,
  });
  await logActivity(roomId, participant, receiver ? 'Sent private chat message' : 'Sent chat message');

  return messageRecord;
}

async function removeSocketFromRooms(io, socket) {
  const roomId = normalizeRoomId(socket.data.roomId);

  if (roomId) {
    const participant = await roomStateService.removeParticipant(roomId, socket.id);

    if (participant) {
      socket.to(roomId).emit('user-left', participant);

      const remainingParticipants = await getParticipants(roomId);
      if (remainingParticipants.length === 0) {
        await roomStateService.expireRoomState(roomId);
      } else {
        await emitParticipants(io, roomId);
      }
    }
  }

  const waitingRoomId = normalizeRoomId(socket.data.waitingRoomId);
  if (waitingRoomId) {
    const waitingParticipant = await roomStateService.removeWaitingParticipant(
      waitingRoomId,
      socket.id,
    );

    if (waitingParticipant) {
      await emitWaitingRoom(io, waitingRoomId);
    }
  }
}

function registerSocketHandlers(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next();
    }

    try {
      if (!process.env.JWT_SECRET) {
        return next(new Error('JWT_SECRET is not defined'));
      }

      socket.user = jwt.verify(token, process.env.JWT_SECRET);
      return next();
    } catch {
      return next(new Error('Invalid socket token'));
    }
  });

  io.on('connection', (socket) => {
    logSocketLifecycle(`Socket connected: ${socket.id}`);

    const handleChatMessage = async (payload = {}, acknowledge) => {
      try {
        const normalizedRoomId = normalizeRoomId(payload.roomId || socket.data.roomId);
        const participant = await roomStateService.getParticipant(normalizedRoomId, socket.id);

        if (!participant) {
          acknowledge?.({ ok: false, message: 'Join the room before sending messages' });
          return;
        }

        const permissions = await getPermissions(normalizedRoomId);
        if (!permissions.allowChat && !canModerate(participant)) {
          acknowledge?.({ ok: false, message: 'Chat is disabled by the host' });
          return;
        }

        const savedMessage = await createChatMessage(normalizedRoomId, participant, payload);

        if (!savedMessage) {
          acknowledge?.({ ok: false, message: 'Message is required' });
          return;
        }

        const message = savedMessage.toObject();

        if (message.receiver?.socketId) {
          io.to(message.receiver.socketId).emit('private-message', message);
          io.to(socket.id).emit('private-message', message);
        } else {
          io.to(normalizedRoomId).emit('receive-message', message);
        }

        acknowledge?.({ ok: true, message });
      } catch (error) {
        acknowledge?.({ ok: false, message: error.message || 'Could not send message' });
      }
    };

    socket.on('join-room', async (payload = {}, acknowledge) => {
      const { roomId, participants } = await getRoom(payload.roomId || payload.meetingId);

      if (!roomId) {
        acknowledge?.({ ok: false, message: 'Room ID is required' });
        return;
      }

      const codeState = await ensureCodeState(roomId);
      const permissions = await getPermissions(roomId);
      const existingParticipant = await roomStateService.getParticipant(roomId, socket.id);
      const nextParticipant = participantFromPayload(socket, participants.length, permissions, payload);
      const participant = {
        ...nextParticipant,
        role: existingParticipant?.role || nextParticipant.role,
        permissions: { ...permissions },
      };

      if (payload.waitingRoomEnabled && participants.length > 0 && !canModerate(participant)) {
        await roomStateService.addWaitingParticipant(roomId, participant);
        socket.data.waitingRoomId = roomId;
        await emitToModerators(io, roomId, 'waiting-room-request', participant);
        await emitWaitingRoom(io, roomId);
        acknowledge?.({ ok: false, waiting: true, participant });
        return;
      }

      await roomStateService.addParticipant(roomId, participant);
      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.waitingRoomId = '';
      logActivity(roomId, participant, 'Connected to meeting').catch((error) => {
        console.error('Could not save activity log:', error);
      });

      socket.to(roomId).emit('user-joined', participant);
      await emitParticipants(io, roomId);
      await emitPermissions(io, roomId);
      socket.emit('whiteboard-state', { strokes: await roomStateService.getWhiteboardState(roomId) });
      socket.emit('code-state', codeState);
      socket.emit(
        'shared-file-state',
        (await roomStateService.getSharedFileState(roomId)) || defaultSharedFileState,
      );
      const recordingState = await roomStateService.getRecordingState(roomId);
      if (recordingState?.isRecording) {
        socket.emit('recording-started', recordingState);
      }
      acknowledge?.({ ok: true, participant, participants: await getParticipants(roomId) });
    });

    socket.on('approve-user', async ({ roomId, targetSocketId } = {}) => {
      const normalizedRoomId = normalizeRoomId(roomId || socket.data.roomId);
      const moderator = await roomStateService.getParticipant(normalizedRoomId, socket.id);
      const waitingParticipant = await roomStateService.getWaitingParticipant(
        normalizedRoomId,
        targetSocketId,
      );
      const targetSocket = io.sockets.sockets.get(targetSocketId);

      if (!canModerate(moderator) || !waitingParticipant || !targetSocket) {
        return;
      }

      await roomStateService.removeWaitingParticipant(normalizedRoomId, targetSocketId);
      await roomStateService.addParticipant(normalizedRoomId, waitingParticipant);
      logActivity(normalizedRoomId, moderator, `Approved ${waitingParticipant.name}`).catch(
        (error) => {
          console.error('Could not save activity log:', error);
        },
      );
      targetSocket.join(normalizedRoomId);
      targetSocket.data.roomId = normalizedRoomId;
      targetSocket.data.waitingRoomId = '';
      targetSocket.emit('approve-user', {
        participant: waitingParticipant,
        participants: await getParticipants(normalizedRoomId),
        permissions: await getPermissions(normalizedRoomId),
      });
      targetSocket.to(normalizedRoomId).emit('user-joined', waitingParticipant);
      await emitParticipants(io, normalizedRoomId);
      await emitWaitingRoom(io, normalizedRoomId);
      await emitPermissions(io, normalizedRoomId);
      targetSocket.emit('whiteboard-state', {
        strokes: await roomStateService.getWhiteboardState(normalizedRoomId),
      });
      targetSocket.emit('code-state', await ensureCodeState(normalizedRoomId));
      targetSocket.emit(
        'shared-file-state',
        (await roomStateService.getSharedFileState(normalizedRoomId)) || defaultSharedFileState,
      );
      const recordingState = await roomStateService.getRecordingState(normalizedRoomId);
      if (recordingState?.isRecording) {
        targetSocket.emit('recording-started', recordingState);
      }
    });

    socket.on('reject-user', async ({ roomId, targetSocketId } = {}) => {
      const normalizedRoomId = normalizeRoomId(roomId || socket.data.roomId);
      const moderator = await roomStateService.getParticipant(normalizedRoomId, socket.id);
      const waitingParticipant = await roomStateService.getWaitingParticipant(
        normalizedRoomId,
        targetSocketId,
      );

      if (!canModerate(moderator) || !waitingParticipant) {
        return;
      }

      await roomStateService.removeWaitingParticipant(normalizedRoomId, targetSocketId);
      io.to(targetSocketId).emit('reject-user', { roomId: normalizedRoomId });
      logActivity(normalizedRoomId, moderator, `Rejected ${waitingParticipant.name}`).catch(
        (error) => {
          console.error('Could not save activity log:', error);
        },
      );
      await emitWaitingRoom(io, normalizedRoomId);
    });

    socket.on('offer', ({ targetSocketId, description } = {}) => {
      if (!targetSocketId || !description) {
        return;
      }

      io.to(targetSocketId).emit('offer', {
        fromSocketId: socket.id,
        description,
      });
    });

    socket.on('answer', ({ targetSocketId, description } = {}) => {
      if (!targetSocketId || !description) {
        return;
      }

      io.to(targetSocketId).emit('answer', {
        fromSocketId: socket.id,
        description,
      });
    });

    socket.on('ice-candidate', ({ targetSocketId, candidate } = {}) => {
      if (!targetSocketId || !candidate) {
        return;
      }

      io.to(targetSocketId).emit('ice-candidate', {
        fromSocketId: socket.id,
        candidate,
      });
    });

    socket.on('toggle-mic', async ({ roomId, micOn } = {}) => {
      const normalizedRoomId = normalizeRoomId(roomId || socket.data.roomId);
      const participant = await roomStateService.getParticipant(normalizedRoomId, socket.id);

      if (!participant) {
        return;
      }

      await roomStateService.updateParticipantMediaState(normalizedRoomId, socket.id, {
        micOn: typeof micOn === 'boolean' ? micOn : !participant.micOn,
      });
      await emitParticipants(io, normalizedRoomId);
    });

    socket.on('toggle-camera', async ({ roomId, cameraOn } = {}) => {
      const normalizedRoomId = normalizeRoomId(roomId || socket.data.roomId);
      const participant = await roomStateService.getParticipant(normalizedRoomId, socket.id);

      if (!participant) {
        return;
      }

      await roomStateService.updateParticipantMediaState(normalizedRoomId, socket.id, {
        cameraOn: typeof cameraOn === 'boolean' ? cameraOn : !participant.cameraOn,
      });
      await emitParticipants(io, normalizedRoomId);
    });

    socket.on('toggle-screen-share', async ({ roomId, isScreenSharing } = {}) => {
      const normalizedRoomId = normalizeRoomId(roomId || socket.data.roomId);
      const participant = await roomStateService.getParticipant(normalizedRoomId, socket.id);

      if (!participant) {
        return;
      }

      if (isScreenSharing && !canModerate(participant)) {
        const permissions = await getPermissions(normalizedRoomId);
        if (!permissions.allowScreenShare) {
          return;
        }
      }

      await roomStateService.updateParticipantMediaState(normalizedRoomId, socket.id, {
        isScreenSharing:
          typeof isScreenSharing === 'boolean' ? isScreenSharing : !participant.isScreenSharing,
      });
      await emitParticipants(io, normalizedRoomId);
    });

    socket.on('start-screen-share', async ({ roomId } = {}) => {
      const normalizedRoomId = normalizeRoomId(roomId || socket.data.roomId);
      const participant = await roomStateService.getParticipant(normalizedRoomId, socket.id);

      if (!participant) {
        return;
      }

      if (!canModerate(participant)) {
        const permissions = await getPermissions(normalizedRoomId);
        if (!permissions.allowScreenShare) {
          socket.emit('screen-share-denied', { reason: 'Screen sharing is disabled by the host' });
          return;
        }
      }

      const nextParticipant = await roomStateService.updateParticipantMediaState(
        normalizedRoomId,
        socket.id,
        {
          isScreenSharing: true,
        },
      );
      logActivity(normalizedRoomId, participant, 'Started screen share').catch((error) => {
        console.error('Could not save activity log:', error);
      });
      await emitParticipants(io, normalizedRoomId);
      io.to(normalizedRoomId).emit('screen-share-started', {
        participant: nextParticipant || participant,
      });
    });

    socket.on('stop-screen-share', async ({ roomId } = {}) => {
      const normalizedRoomId = normalizeRoomId(roomId || socket.data.roomId);
      const participant = await roomStateService.getParticipant(normalizedRoomId, socket.id);

      if (!participant) {
        return;
      }

      const nextParticipant = await roomStateService.updateParticipantMediaState(
        normalizedRoomId,
        socket.id,
        {
          isScreenSharing: false,
        },
      );
      logActivity(normalizedRoomId, participant, 'Stopped screen share').catch((error) => {
        console.error('Could not save activity log:', error);
      });
      await emitParticipants(io, normalizedRoomId);
      io.to(normalizedRoomId).emit('screen-share-stopped', {
        participant: nextParticipant || participant,
      });
    });

    socket.on('host-stop-screen-share', async ({ roomId, targetSocketId, targetUserId } = {}) => {
      const normalizedRoomId = normalizeRoomId(roomId || socket.data.roomId);
      const roomParticipants = await getParticipants(normalizedRoomId);
      const moderator = await roomStateService.getParticipant(normalizedRoomId, socket.id);
      const target = findParticipantByTarget(roomParticipants, targetSocketId || targetUserId);

      if (!canModerate(moderator) || !target) {
        return;
      }

      const nextTarget = await roomStateService.updateParticipantMediaState(
        normalizedRoomId,
        target.socketId,
        { isScreenSharing: false },
      );
      io.to(target.socketId).emit('host-stop-screen-share', { stoppedBy: moderator });
      await emitParticipants(io, normalizedRoomId);
      io.to(normalizedRoomId).emit('screen-share-stopped', {
        participant: nextTarget || target,
      });
    });

    socket.on('raise-hand', async ({ roomId } = {}) => {
      const normalizedRoomId = normalizeRoomId(roomId || socket.data.roomId);
      const participant = await roomStateService.getParticipant(normalizedRoomId, socket.id);

      if (!participant) {
        return;
      }

      await roomStateService.updateHandRaiseState(normalizedRoomId, socket.id, true);
      await emitParticipants(io, normalizedRoomId);
    });

    socket.on('lower-hand', async ({ roomId } = {}) => {
      const normalizedRoomId = normalizeRoomId(roomId || socket.data.roomId);
      const participant = await roomStateService.getParticipant(normalizedRoomId, socket.id);

      if (!participant) {
        return;
      }

      await roomStateService.updateHandRaiseState(normalizedRoomId, socket.id, false);
      await emitParticipants(io, normalizedRoomId);
    });

    socket.on('send-reaction', async ({ roomId, reaction } = {}) => {
      const normalizedRoomId = normalizeRoomId(roomId || socket.data.roomId);
      const participant = await roomStateService.getParticipant(normalizedRoomId, socket.id);

      if (!participant || !reaction) {
        return;
      }

      io.to(normalizedRoomId).emit('send-reaction', {
        reaction,
        participant,
        sentAt: new Date().toISOString(),
      });
    });

    socket.on('send-message', handleChatMessage);

    socket.on('private-message', handleChatMessage);

    socket.on('recording-started', async ({ roomId } = {}, acknowledge) => {
      const normalizedRoomId = normalizeRoomId(roomId || socket.data.roomId);
      const participant = await roomStateService.getParticipant(normalizedRoomId, socket.id);

      if (participant?.role !== 'host') {
        acknowledge?.({ ok: false, message: 'Only the host can start recording' });
        return;
      }

      const nextRecordingState = {
        isRecording: true,
        startedAt: new Date().toISOString(),
        startedBy: participant,
      };

      await roomStateService.updateRecordingState(normalizedRoomId, nextRecordingState);
      io.to(normalizedRoomId).emit('recording-started', nextRecordingState);
      logActivity(normalizedRoomId, participant, 'Started recording').catch((error) => {
        console.error('Could not save recording activity:', error);
      });
      acknowledge?.({ ok: true, recording: nextRecordingState });
    });

    socket.on('recording-stopped', async ({ roomId } = {}, acknowledge) => {
      const normalizedRoomId = normalizeRoomId(roomId || socket.data.roomId);
      const participant = await roomStateService.getParticipant(normalizedRoomId, socket.id);

      if (participant?.role !== 'host') {
        acknowledge?.({ ok: false, message: 'Only the host can stop recording' });
        return;
      }

      const previousRecordingState =
        (await roomStateService.getRecordingState(normalizedRoomId)) || defaultRecordingState;
      const nextRecordingState = {
        isRecording: false,
        startedAt: previousRecordingState.startedAt || null,
        stoppedAt: new Date().toISOString(),
        startedBy: previousRecordingState.startedBy || null,
        stoppedBy: participant,
      };

      await roomStateService.updateRecordingState(normalizedRoomId, nextRecordingState);
      io.to(normalizedRoomId).emit('recording-stopped', nextRecordingState);
      logActivity(normalizedRoomId, participant, 'Stopped recording').catch((error) => {
        console.error('Could not save recording activity:', error);
      });
      acknowledge?.({ ok: true, recording: nextRecordingState });
    });

    socket.on('file-uploaded', async ({ roomId, file } = {}) => {
      const normalizedRoomId = normalizeRoomId(roomId || socket.data.roomId);
      const participant = await roomStateService.getParticipant(normalizedRoomId, socket.id);
      const permissions = await getPermissions(normalizedRoomId);

      if (!participant || (!permissions.allowFileShare && !canModerate(participant)) || !file) {
        return;
      }

      io.to(normalizedRoomId).emit('file-uploaded', { file, uploadedBy: participant });
      logActivity(normalizedRoomId, participant, `Shared file ${file.fileName || 'file'}`).catch(
        (error) => {
          console.error('Could not save activity log:', error);
        },
      );
    });

    socket.on('open-shared-file', async ({ roomId, file, currentPage = 1 } = {}) => {
      const normalizedRoomId = normalizeRoomId(roomId || socket.data.roomId);
      const participant = await roomStateService.getParticipant(normalizedRoomId, socket.id);

      if (!participant || !file) {
        return;
      }

      const nextState = {
        activeFile: file,
        currentPage: Math.max(Number(currentPage) || 1, 1),
        openedBy: participant,
      };

      await roomStateService.updateSharedFileState(normalizedRoomId, nextState);
      logActivity(normalizedRoomId, participant, `Opened shared file ${file.fileName || 'file'}`).catch(
        (error) => {
          console.error('Could not save activity log:', error);
        },
      );
      io.to(normalizedRoomId).emit('open-shared-file', nextState);
    });

    socket.on('close-shared-file', async ({ roomId } = {}) => {
      const normalizedRoomId = normalizeRoomId(roomId || socket.data.roomId);
      const participant = await roomStateService.getParticipant(normalizedRoomId, socket.id);

      if (!participant) {
        return;
      }

      const nextState = {
        activeFile: null,
        currentPage: 1,
        closedBy: participant,
      };

      await roomStateService.updateSharedFileState(normalizedRoomId, nextState);
      logActivity(normalizedRoomId, participant, 'Closed shared file').catch((error) => {
        console.error('Could not save activity log:', error);
      });
      io.to(normalizedRoomId).emit('close-shared-file', nextState);
    });

    socket.on('change-file-page', async ({ roomId, currentPage } = {}) => {
      const normalizedRoomId = normalizeRoomId(roomId || socket.data.roomId);
      const participant = await roomStateService.getParticipant(normalizedRoomId, socket.id);
      const state = await roomStateService.getSharedFileState(normalizedRoomId);

      if (!participant || !state?.activeFile) {
        return;
      }

      const nextState = {
        ...state,
        currentPage: Math.max(Number(currentPage) || 1, 1),
        changedBy: participant,
      };

      await roomStateService.updateSharedFileState(normalizedRoomId, nextState);
      io.to(normalizedRoomId).emit('change-file-page', nextState);
    });

    socket.on('whiteboard-draw', async (payload = {}, acknowledge) => {
      const normalizedRoomId = normalizeRoomId(payload.roomId || socket.data.roomId);
      const participant = await roomStateService.getParticipant(normalizedRoomId, socket.id);

      if (!(await canUseWhiteboard(participant, normalizedRoomId))) {
        acknowledge?.({ ok: false, message: 'Whiteboard is disabled by the host' });
        return;
      }

      const stroke = sanitizeWhiteboardStroke(payload.stroke || payload, participant);
      if (!stroke) {
        acknowledge?.({ ok: false, message: 'Draw stroke is invalid' });
        return;
      }

      await roomStateService.addWhiteboardStroke(normalizedRoomId, stroke);
      io.to(normalizedRoomId).emit('whiteboard-draw', { stroke });
      acknowledge?.({ ok: true, stroke });
    });

    socket.on('whiteboard-clear', async (payload = {}, acknowledge) => {
      const normalizedRoomId = normalizeRoomId(payload.roomId || socket.data.roomId);
      const participant = await roomStateService.getParticipant(normalizedRoomId, socket.id);

      if (!(await canUseWhiteboard(participant, normalizedRoomId))) {
        acknowledge?.({ ok: false, message: 'Whiteboard is disabled by the host' });
        return;
      }

      await roomStateService.clearWhiteboard(normalizedRoomId);
      logActivity(normalizedRoomId, participant, 'Cleared whiteboard').catch((error) => {
        console.error('Could not save activity log:', error);
      });
      io.to(normalizedRoomId).emit('whiteboard-clear', {
        clearedBy: participant,
        clearedAt: new Date().toISOString(),
      });
      acknowledge?.({ ok: true });
    });

    socket.on('whiteboard-undo', async (payload = {}, acknowledge) => {
      const normalizedRoomId = normalizeRoomId(payload.roomId || socket.data.roomId);
      const participant = await roomStateService.getParticipant(normalizedRoomId, socket.id);

      if (!(await canUseWhiteboard(participant, normalizedRoomId))) {
        acknowledge?.({ ok: false, message: 'Whiteboard is disabled by the host' });
        return;
      }

      const { removedStroke } = await roomStateService.removeWhiteboardStroke(
        normalizedRoomId,
        (stroke) => canModerate(participant) || stroke.authorSocketId === participant.socketId,
      );

      if (!removedStroke) {
        acknowledge?.({ ok: false, message: 'Nothing to undo' });
        return;
      }

      io.to(normalizedRoomId).emit('whiteboard-undo', {
        strokeId: removedStroke.id,
        undoneBy: participant,
      });
      acknowledge?.({ ok: true, strokeId: removedStroke.id });
    });

    socket.on('code-change', async (payload = {}, acknowledge) => {
      const normalizedRoomId = normalizeRoomId(payload.roomId || socket.data.roomId);
      const participant = await roomStateService.getParticipant(normalizedRoomId, socket.id);

      if (!participant) {
        acknowledge?.({ ok: false, message: 'Join the room before editing code' });
        return;
      }

      const state = (await roomStateService.getCodeEditorState(normalizedRoomId)) || {
        ...defaultCodeState,
        cursors: {},
      };
      const code = String(payload.code || '').slice(0, 200000);
      const nextState = {
        ...state,
        code,
        language: sanitizeLanguage(payload.language || state.language),
        activeUser: editorPersonFromParticipant(participant),
        version: Date.now(),
      };

      await roomStateService.updateCodeEditorState(normalizedRoomId, nextState);
      socket.to(normalizedRoomId).emit('code-change', {
        code: nextState.code,
        language: nextState.language,
        activeUser: nextState.activeUser,
        version: nextState.version,
      });
      persistCodeSnapshot(normalizedRoomId, nextState, participant);
      acknowledge?.({ ok: true });
    });

    socket.on('language-change', async (payload = {}, acknowledge) => {
      const normalizedRoomId = normalizeRoomId(payload.roomId || socket.data.roomId);
      const participant = await roomStateService.getParticipant(normalizedRoomId, socket.id);

      if (!participant) {
        acknowledge?.({ ok: false, message: 'Join the room before changing language' });
        return;
      }

      const state = (await roomStateService.getCodeEditorState(normalizedRoomId)) || {
        ...defaultCodeState,
        cursors: {},
      };
      const nextState = {
        ...state,
        language: sanitizeLanguage(payload.language),
        activeUser: editorPersonFromParticipant(participant),
        version: Date.now(),
      };

      await roomStateService.updateCodeEditorState(normalizedRoomId, nextState);
      io.to(normalizedRoomId).emit('language-change', {
        language: nextState.language,
        activeUser: nextState.activeUser,
        version: nextState.version,
      });
      persistCodeSnapshot(normalizedRoomId, nextState, participant);
      acknowledge?.({ ok: true });
    });

    socket.on('cursor-position', async (payload = {}) => {
      const normalizedRoomId = normalizeRoomId(payload.roomId || socket.data.roomId);
      const participant = await roomStateService.getParticipant(normalizedRoomId, socket.id);

      if (!participant) {
        return;
      }

      const position = {
        lineNumber: Number(payload.position?.lineNumber) || 1,
        column: Number(payload.position?.column) || 1,
      };
      const state = (await roomStateService.getCodeEditorState(normalizedRoomId)) || {
        ...defaultCodeState,
        cursors: {},
      };

      state.cursors = {
        ...state.cursors,
        [socket.id]: {
          position,
          participant: editorPersonFromParticipant(participant),
          updatedAt: new Date().toISOString(),
        },
      };
      state.activeUser = editorPersonFromParticipant(participant);
      await roomStateService.updateCodeEditorState(normalizedRoomId, state);
      socket.to(normalizedRoomId).emit('cursor-position', {
        position,
        participant: state.activeUser,
      });
    });

    socket.on('typing', async ({ roomId, receiverSocketId } = {}) => {
      const normalizedRoomId = normalizeRoomId(roomId || socket.data.roomId);
      const participant = await roomStateService.getParticipant(normalizedRoomId, socket.id);

      if (!participant) {
        return;
      }

      const eventPayload = { participant, receiverSocketId: receiverSocketId || '' };

      if (receiverSocketId) {
        io.to(receiverSocketId).emit('typing', eventPayload);
        return;
      }

      socket.to(normalizedRoomId).emit('typing', eventPayload);
    });

    socket.on('stop-typing', async ({ roomId, receiverSocketId } = {}) => {
      const normalizedRoomId = normalizeRoomId(roomId || socket.data.roomId);
      const participant = await roomStateService.getParticipant(normalizedRoomId, socket.id);

      if (!participant) {
        return;
      }

      const eventPayload = { participant, receiverSocketId: receiverSocketId || '' };

      if (receiverSocketId) {
        io.to(receiverSocketId).emit('stop-typing', eventPayload);
        return;
      }

      socket.to(normalizedRoomId).emit('stop-typing', eventPayload);
    });

    socket.on('host-mute-user', async ({ roomId, targetUserId, targetSocketId } = {}) => {
      const normalizedRoomId = normalizeRoomId(roomId || socket.data.roomId);
      const roomParticipants = await getParticipants(normalizedRoomId);
      const moderator = await roomStateService.getParticipant(normalizedRoomId, socket.id);
      const target = findParticipantByTarget(roomParticipants, targetSocketId || targetUserId);

      if (!canModerate(moderator) || !target) {
        return;
      }

      const nextTarget = await roomStateService.updateParticipantMediaState(
        normalizedRoomId,
        target.socketId,
        { micOn: false },
      );
      io.to(target.socketId).emit('host-mute-user', nextTarget || target);
      io.to(target.socketId).emit('mute-user', nextTarget || target);
      await emitParticipants(io, normalizedRoomId);
    });

    socket.on('mute-user', async ({ roomId, targetUserId, targetSocketId } = {}) => {
      const normalizedRoomId = normalizeRoomId(roomId || socket.data.roomId);
      const roomParticipants = await getParticipants(normalizedRoomId);
      const moderator = await roomStateService.getParticipant(normalizedRoomId, socket.id);
      const target = findParticipantByTarget(roomParticipants, targetSocketId || targetUserId);

      if (!canModerate(moderator) || !target) {
        return;
      }

      const nextTarget = await roomStateService.updateParticipantMediaState(
        normalizedRoomId,
        target.socketId,
        { micOn: false },
      );
      io.to(target.socketId).emit('mute-user', nextTarget || target);
      await emitParticipants(io, normalizedRoomId);
    });

    socket.on('mute-all', async ({ roomId } = {}) => {
      const normalizedRoomId = normalizeRoomId(roomId || socket.data.roomId);
      const roomParticipants = await getParticipants(normalizedRoomId);
      const moderator = await roomStateService.getParticipant(normalizedRoomId, socket.id);

      if (!canModerate(moderator) || !roomParticipants.length) {
        return;
      }

      await Promise.all(roomParticipants.map(async (participant) => {
        if (participant.socketId !== socket.id) {
          const nextParticipant = await roomStateService.updateParticipantMediaState(
            normalizedRoomId,
            participant.socketId,
            { micOn: false },
          );
          io.to(participant.socketId).emit('mute-user', nextParticipant || participant);
        }
      }));
      await emitParticipants(io, normalizedRoomId);
    });

    socket.on('make-cohost', async ({ roomId, targetUserId, targetSocketId } = {}) => {
      const normalizedRoomId = normalizeRoomId(roomId || socket.data.roomId);
      const roomParticipants = await getParticipants(normalizedRoomId);
      const moderator = await roomStateService.getParticipant(normalizedRoomId, socket.id);
      const target = findParticipantByTarget(roomParticipants, targetSocketId || targetUserId);

      if (!canModerate(moderator) || !target || target.role === 'host') {
        return;
      }

      const nextTarget = await roomStateService.updateParticipantRole(
        normalizedRoomId,
        target.socketId,
        'cohost',
      );
      io.to(target.socketId).emit('make-cohost', nextTarget || target);
      await emitParticipants(io, normalizedRoomId);
    });

    socket.on('update-permissions', async ({ roomId, permissions = {} } = {}) => {
      const normalizedRoomId = normalizeRoomId(roomId || socket.data.roomId);
      const moderator = await roomStateService.getParticipant(normalizedRoomId, socket.id);

      if (!canModerate(moderator)) {
        return;
      }

      const validUpdates = Object.keys(defaultPermissions).reduce((nextPermissions, key) => {
        if (typeof permissions[key] === 'boolean') {
          return { ...nextPermissions, [key]: permissions[key] };
        }

        return nextPermissions;
      }, {});
      const nextPermissions = {
        ...(await getPermissions(normalizedRoomId)),
        ...validUpdates,
      };

      await roomStateService.updateRoomState(normalizedRoomId, { permissions: nextPermissions });
      logActivity(normalizedRoomId, moderator, 'Updated meeting permissions').catch((error) => {
        console.error('Could not save activity log:', error);
      });
      await roomStateService.setParticipantsPermissions(normalizedRoomId, nextPermissions);
      await emitPermissions(io, normalizedRoomId);
      await emitParticipants(io, normalizedRoomId);
    });

    socket.on('remove-user', async ({ roomId, targetUserId, targetSocketId } = {}) => {
      const normalizedRoomId = normalizeRoomId(roomId || socket.data.roomId);
      const roomParticipants = await getParticipants(normalizedRoomId);
      const moderator = await roomStateService.getParticipant(normalizedRoomId, socket.id);
      const target = findParticipantByTarget(roomParticipants, targetSocketId || targetUserId);

      if (!canModerate(moderator) || !target) {
        return;
      }

      await roomStateService.removeParticipant(normalizedRoomId, target.socketId);
      logActivity(normalizedRoomId, moderator, `Removed ${target.name}`).catch((error) => {
        console.error('Could not save activity log:', error);
      });
      io.to(target.socketId).emit('remove-user', { roomId: normalizedRoomId });
      io.sockets.sockets.get(target.socketId)?.leave(normalizedRoomId);
      socket.to(normalizedRoomId).emit('user-left', target);
      await emitParticipants(io, normalizedRoomId);
    });

    socket.on('end-meeting', async ({ roomId } = {}) => {
      const normalizedRoomId = normalizeRoomId(roomId || socket.data.roomId);
      const moderator = await roomStateService.getParticipant(normalizedRoomId, socket.id);

      if (!canModerate(moderator)) {
        return;
      }

      const endedAt = new Date();
      try {
        const meeting = await Meeting.findOne({ meetingId: normalizedRoomId });
        if (meeting) {
          meeting.status = 'ended';
          meeting.startedAt = meeting.startedAt || meeting.createdAt || endedAt;
          meeting.endedAt = endedAt;
          meeting.durationSeconds = calculateDurationSeconds(meeting.startedAt, endedAt);
          await meeting.save();
        }
        await logActivity(normalizedRoomId, moderator, 'Ended meeting');
      } catch (error) {
        console.error('Could not save meeting end state:', error);
      }

      io.to(normalizedRoomId).emit('end-meeting', { roomId: normalizedRoomId });
      await roomStateService.expireRoomState(normalizedRoomId);
      io.in(normalizedRoomId).socketsLeave(normalizedRoomId);
    });

    socket.on('disconnect', () => {
      removeSocketFromRooms(io, socket).catch((error) => {
        console.error('Could not remove socket from Redis room state:', error);
      });
      logSocketLifecycle(`Socket disconnected: ${socket.id}`);
    });
  });
}

export default registerSocketHandlers;
