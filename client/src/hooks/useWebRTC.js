import { useCallback, useEffect, useRef, useState } from 'react';
import * as mediasoupClient from 'mediasoup-client';
import { getChatHistory } from '../services/chat.js';
import { getMeetingFiles } from '../services/files.js';
import { createSocket } from '../services/socket.js';
import { getRtcConfiguration } from '../lib/webrtcConfig.js';
import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';

const rtcConfiguration = getRtcConfiguration();

function stopStream(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

function setTracksEnabled(stream, kind, isEnabled) {
  stream
    ?.getTracks()
    .filter((track) => track.kind === kind)
    .forEach((track) => {
      track.enabled = isEnabled;
    });
}

export function useWebRTC({
  displayName,
  initialCameraOn = true,
  initialMicOn = true,
  initialStream = null,
  onEnded,
  onRemoved,
  role = 'participant',
  roomId,
  userId,
  waitingRoomEnabled = false,
}) {
  const [participants, setParticipants] = useState([]);
  const [waitingParticipants, setWaitingParticipants] = useState([]);
  const [permissions, setPermissions] = useState({
    allowChat: true,
    allowScreenShare: true,
    allowWhiteboard: true,
    allowFileShare: true,
  });
  const [admissionStatus, setAdmissionStatus] = useState('joining');
  const [localSocketId, setLocalSocketId] = useState('');
  const [localStream, setLocalStream] = useState(initialStream);
  const [isMediaReady, setIsMediaReady] = useState(Boolean(initialStream));
  const [remoteStreams, setRemoteStreams] = useState({});
  const [isMicOn, setIsMicOn] = useState(initialMicOn);
  const [isCameraOn, setIsCameraOn] = useState(initialCameraOn);
  const isMicOnRef = useRef(initialMicOn);
  const isCameraOnRef = useRef(initialCameraOn);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenShareStream, setScreenShareStream] = useState(null);
  const screenStreamRef = useRef(null);
  const [lastReaction, setLastReaction] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [sharedFiles, setSharedFiles] = useState([]);
  const [sharedFileState, setSharedFileState] = useState({
    activeFile: null,
    currentPage: 1,
  });
  const [whiteboardEvents, setWhiteboardEvents] = useState([]);
  const [codeEditorState, setCodeEditorState] = useState({
    code: '// Start coding together\n',
    language: 'javascript',
    activeUser: null,
    cursors: {},
    isReady: false,
    version: 0,
  });
  const [typingParticipants, setTypingParticipants] = useState([]);
  const [mediaError, setMediaError] = useState('');
  const [recordingState, setRecordingState] = useState({
    isRecording: false,
    startedAt: null,
    startedBy: null,
    stoppedAt: null,
    stoppedBy: null,
  });

  const socketRef = useRef(null);
  const deviceRef = useRef(null);
  const sendTransportRef = useRef(null);
  const recvTransportRef = useRef(null);
  const producersRef = useRef(new Map()); // source ('mic' | 'camera' | 'screen') -> Producer
  const consumersRef = useRef(new Map()); // consumerId -> Consumer
  const isConnectingSfuRef = useRef(false);

  const localStreamRef = useRef(initialStream);
  const ownsStreamRef = useRef(!initialStream);
  const hasJoinedRef = useRef(false);
  const initialJoinStateRef = useRef({
    micOn: initialMicOn,
    cameraOn: initialCameraOn,
    handRaised: false,
    isScreenSharing: false,
  });
  const onEndedRef = useRef(onEnded);
  const onRemovedRef = useRef(onRemoved);
  const typingTimeoutsRef = useRef({});
  const stopScreenShareRef = useRef(null);
  const isCodeEditorReadyRef = useRef(false);
  const yDocRef = useRef(null);
  if (!yDocRef.current) {
    yDocRef.current = new Y.Doc();
  }
  const awarenessRef = useRef(null);
  if (!awarenessRef.current) {
    awarenessRef.current = new awarenessProtocol.Awareness(yDocRef.current);
  }

  useEffect(() => {
    onEndedRef.current = onEnded;
    onRemovedRef.current = onRemoved;
  }, [onEnded, onRemoved]);

  const emitSocketEvent = useCallback(
    (eventName, payload = {}) => {
      socketRef.current?.emit(eventName, {
        roomId,
        ...payload,
      });
    },
    [roomId],
  );

  const emitSocketRequest = useCallback((eventName, payload = {}) => {
    return new Promise((resolve, reject) => {
      if (!socketRef.current) {
        reject(new Error('Socket not connected'));
        return;
      }

      socketRef.current.emit(eventName, payload, (response) => {
        if (!response) {
          reject(new Error(`No response received for ${eventName}`));
        } else if (response.ok === false) {
          reject(new Error(response.message || `Failed to execute ${eventName}`));
        } else {
          resolve(response);
        }
      });
    });
  }, []);

  const addChatMessage = useCallback((message) => {
    setChatMessages((currentMessages) => {
      if (currentMessages.some((currentMessage) => currentMessage._id === message._id)) {
        return currentMessages;
      }

      return [...currentMessages, message];
    });
  }, []);

  const clearTypingParticipant = useCallback((socketId) => {
    window.clearTimeout(typingTimeoutsRef.current[socketId]);
    delete typingTimeoutsRef.current[socketId];
    setTypingParticipants((currentParticipants) =>
      currentParticipants.filter((participant) => participant.socketId !== socketId),
    );
  }, []);

  const showTypingParticipant = useCallback(
    (participant) => {
      if (!participant?.socketId || participant.socketId === socketRef.current?.id) {
        return;
      }

      setTypingParticipants((currentParticipants) => {
        if (currentParticipants.some((currentParticipant) => currentParticipant.socketId === participant.socketId)) {
          return currentParticipants;
        }

        return [...currentParticipants, participant];
      });

      window.clearTimeout(typingTimeoutsRef.current[participant.socketId]);
      typingTimeoutsRef.current[participant.socketId] = window.setTimeout(
        () => clearTypingParticipant(participant.socketId),
        2500,
      );
    },
    [clearTypingParticipant],
  );

  const closeParticipantMedia = useCallback((socketId) => {
    for (const [id, consumer] of consumersRef.current.entries()) {
      if (consumer.appData?.producerSocketId === socketId || consumer.appData?.socketId === socketId) {
        consumer.close();
        consumersRef.current.delete(id);
      }
    }

    setRemoteStreams((currentStreams) => {
      const nextStreams = { ...currentStreams };
      delete nextStreams[socketId];
      return nextStreams;
    });
  }, []);

  const cleanupConnections = useCallback(() => {
    for (const producer of producersRef.current.values()) {
      producer.close();
    }
    producersRef.current.clear();

    for (const consumer of consumersRef.current.values()) {
      consumer.close();
    }
    consumersRef.current.clear();

    if (sendTransportRef.current) {
      sendTransportRef.current.close();
      sendTransportRef.current = null;
    }

    if (recvTransportRef.current) {
      recvTransportRef.current.close();
      recvTransportRef.current = null;
    }

    deviceRef.current = null;
    isConnectingSfuRef.current = false;
    setRemoteStreams({});
  }, []);

  const consumeProducer = useCallback(
    async ({ producerId, producerSocketId }) => {
      const device = deviceRef.current;
      const recvTransport = recvTransportRef.current;
      const socket = socketRef.current;

      if (!device || !device.loaded || !recvTransport || !socket) {
        return;
      }

      if (producerSocketId === socket.id) {
        return;
      }

      for (const consumer of consumersRef.current.values()) {
        if (consumer.producerId === producerId) {
          return;
        }
      }

      try {
        const response = await emitSocketRequest('consume-media', {
          roomId,
          transportId: recvTransport.id,
          producerId,
          rtpCapabilities: device.rtpCapabilities,
        });

        const consumerParams = response.params;
        const consumer = await recvTransport.consume({
          id: consumerParams.id,
          producerId: consumerParams.producerId,
          kind: consumerParams.kind,
          rtpParameters: consumerParams.rtpParameters,
          appData: { ...consumerParams.appData, producerSocketId },
        });

        consumersRef.current.set(consumer.id, consumer);

        await emitSocketRequest('resume-consumer', {
          roomId,
          consumerId: consumer.id,
        });

        const { track } = consumer;

        setRemoteStreams((currentStreams) => {
          const existingStream = currentStreams[producerSocketId];
          let nextStream;
          if (existingStream) {
            const tracks = existingStream.getTracks().filter((t) => t.kind !== track.kind);
            nextStream = new MediaStream([...tracks, track]);
          } else {
            nextStream = new MediaStream([track]);
          }

          return {
            ...currentStreams,
            [producerSocketId]: nextStream,
          };
        });

        consumer.on('transportclose', () => {
          consumersRef.current.delete(consumer.id);
        });

        consumer.on('producerclose', () => {
          consumersRef.current.delete(consumer.id);
          setRemoteStreams((currentStreams) => {
            const existingStream = currentStreams[producerSocketId];
            if (!existingStream) {
              return currentStreams;
            }

            const remainingTracks = existingStream.getTracks().filter((t) => t.id !== track.id);
            if (remainingTracks.length === 0) {
              const next = { ...currentStreams };
              delete next[producerSocketId];
              return next;
            }

            return {
              ...currentStreams,
              [producerSocketId]: new MediaStream(remainingTracks),
            };
          });
        });
      } catch (error) {
        console.error('[mediasoup] Error consuming remote producer:', error);
      }
    },
    [emitSocketRequest, roomId],
  );

  const initMediasoup = useCallback(async () => {
    if (isConnectingSfuRef.current || !socketRef.current) {
      return;
    }
    isConnectingSfuRef.current = true;

    try {
      const { rtpCapabilities } = await emitSocketRequest('get-router-rtp-capabilities', { roomId });

      const device = new mediasoupClient.Device();
      await device.load({ routerRtpCapabilities: rtpCapabilities });
      deviceRef.current = device;

      const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const forceWorkerParam = urlParams?.get('worker');
      const forceWorkerIndex = forceWorkerParam !== null && forceWorkerParam !== undefined ? Number(forceWorkerParam) : undefined;

      // 1. Create Send Transport
      const sendTransportRes = await emitSocketRequest('create-webrtc-transport', {
        roomId,
        producing: true,
        consuming: false,
        forceWorkerIndex,
      });

      const sendTransport = device.createSendTransport({
        ...sendTransportRes.params,
        iceServers: rtcConfiguration.iceServers,
      });
      sendTransportRef.current = sendTransport;

      sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        try {
          await emitSocketRequest('connect-transport', {
            roomId,
            transportId: sendTransport.id,
            dtlsParameters,
          });
          callback();
        } catch (error) {
          errback(error);
        }
      });

      sendTransport.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
        try {
          const { id } = await emitSocketRequest('produce-media', {
            roomId,
            transportId: sendTransport.id,
            kind,
            rtpParameters,
            appData,
          });
          callback({ id });
        } catch (error) {
          errback(error);
        }
      });

      // 2. Create Recv Transport
      const recvTransportRes = await emitSocketRequest('create-webrtc-transport', {
        roomId,
        producing: false,
        consuming: true,
        forceWorkerIndex,
      });

      const recvTransport = device.createRecvTransport({
        ...recvTransportRes.params,
        iceServers: rtcConfiguration.iceServers,
      });
      recvTransportRef.current = recvTransport;

      recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        try {
          await emitSocketRequest('connect-transport', {
            roomId,
            transportId: recvTransport.id,
            dtlsParameters,
          });
          callback();
        } catch (error) {
          errback(error);
        }
      });

      // 3. Produce initial local tracks
      if (localStreamRef.current) {
        const audioTrack = localStreamRef.current.getAudioTracks()[0];
        if (audioTrack && isMicOnRef.current) {
          try {
            const audioProducer = await sendTransport.produce({
              track: audioTrack,
              appData: { source: 'mic' },
            });
            producersRef.current.set('mic', audioProducer);
          } catch (err) {
            console.error('[mediasoup] Failed to produce initial audio:', err);
          }
        }

        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        if (videoTrack && isCameraOnRef.current) {
          try {
            const videoProducer = await sendTransport.produce({
              track: videoTrack,
              encodings: [
                { maxBitrate: 100000, scaleResolutionDownBy: 4 },
                { maxBitrate: 300000, scaleResolutionDownBy: 2 },
                { maxBitrate: 900000, scaleResolutionDownBy: 1 },
              ],
              codecOptions: {
                videoGoogleStartBitrate: 1000,
              },
              appData: { source: 'camera' },
            });
            producersRef.current.set('camera', videoProducer);
          } catch (err) {
            console.error('[mediasoup] Failed to produce initial video:', err);
          }
        }
      }

      // 4. Consume existing producers in the room
      const { producers = [] } = await emitSocketRequest('get-producers', { roomId });
      for (const producer of producers) {
        await consumeProducer(producer);
      }
    } catch (error) {
      console.error('[mediasoup] SFU initialization failed:', error);
      setMediaError('Could not establish media connection to SFU server');
    } finally {
      isConnectingSfuRef.current = false;
    }
  }, [consumeProducer, emitSocketRequest, roomId]);

  const initialValuesRef = useRef({ initialCameraOn, initialMicOn, initialStream });

  useEffect(() => {
    let isMounted = true;
    const { initialCameraOn: camOn, initialMicOn: micOn, initialStream: stream } =
      initialValuesRef.current;

    async function prepareLocalMedia() {
      try {
        if (stream) {
          localStreamRef.current = stream;
          setTracksEnabled(stream, 'audio', micOn);
          setTracksEnabled(stream, 'video', camOn);
          setLocalStream(stream);
          return;
        }

        if (!navigator.mediaDevices?.getUserMedia) {
          setMediaError('Camera access is not supported in this browser');
          isMicOnRef.current = false;
          isCameraOnRef.current = false;
          setIsMicOn(false);
          setIsCameraOn(false);
          return;
        }

        try {
          let acquiredStream;
          try {
            acquiredStream = await navigator.mediaDevices.getUserMedia({
              audio: true,
              video: true,
            });
          } catch (mediaErr) {
            if (
              mediaErr.name === 'NotReadableError' ||
              mediaErr.name === 'TrackStartError' ||
              mediaErr.name === 'AbortError' ||
              mediaErr.name === 'NotFoundError' ||
              mediaErr.name === 'DevicesNotFoundError'
            ) {
              try {
                acquiredStream = await navigator.mediaDevices.getUserMedia({
                  audio: true,
                  video: false,
                });
                isCameraOnRef.current = false;
                setIsCameraOn(false);
              } catch {
                try {
                  acquiredStream = await navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: true,
                  });
                  isMicOnRef.current = false;
                  setIsMicOn(false);
                } catch {
                  throw mediaErr;
                }
              }
            } else {
              throw mediaErr;
            }
          }

          if (!isMounted) {
            stopStream(acquiredStream);
            return;
          }

          setTracksEnabled(acquiredStream, 'audio', micOn);
          setTracksEnabled(acquiredStream, 'video', camOn);
          localStreamRef.current = acquiredStream;
          ownsStreamRef.current = true;
          setLocalStream(acquiredStream);
          setMediaError('');
        } catch (error) {
          if (!isMounted) {
            return;
          }

          setMediaError(
            error.name === 'NotAllowedError'
              ? 'Camera or microphone permission was blocked'
              : 'Camera or microphone is busy in another app or unavailable',
          );
          isMicOnRef.current = false;
          isCameraOnRef.current = false;
          setIsMicOn(false);
          setIsCameraOn(false);
        }
      } finally {
        if (isMounted) {
          setIsMediaReady(true);
        }
      }
    }

    prepareLocalMedia();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!roomId || !isMediaReady || hasJoinedRef.current) {
      return undefined;
    }

    const socket = createSocket();
    isCodeEditorReadyRef.current = false;
    socketRef.current = socket;

    socket.on('connect', () => {
      setLocalSocketId(socket.id);
      hasJoinedRef.current = true;

      socket.emit(
        'join-room',
        {
          roomId,
          userId,
          name: displayName || 'Guest',
          role,
          waitingRoomEnabled,
          ...initialJoinStateRef.current,
          micOn: isMicOnRef.current,
          cameraOn: isCameraOnRef.current,
        },
        (response) => {
          if (response?.waiting) {
            setAdmissionStatus('waiting');
            return;
          }

          if (!response?.ok) {
            setAdmissionStatus('rejected');
            return;
          }

          setAdmissionStatus('admitted');
        },
      );
    });

    socket.on('update-participants', (nextParticipants) => {
      setParticipants(Array.isArray(nextParticipants) ? nextParticipants : []);
    });

    socket.on('new-producer', (producer) => {
      consumeProducer(producer);
    });

    socket.on('producer-closed', ({ producerId, producerSocketId }) => {
      let closedTrackId = null;
      for (const [id, consumer] of consumersRef.current.entries()) {
        if (consumer.producerId === producerId) {
          closedTrackId = consumer.track?.id;
          consumer.close();
          consumersRef.current.delete(id);
        }
      }

      setRemoteStreams((currentStreams) => {
        const existingStream = currentStreams[producerSocketId];
        if (!existingStream) return currentStreams;
        if (!closedTrackId) return currentStreams;

        const remainingTracks = existingStream.getTracks().filter((t) => t.id !== closedTrackId);
        if (remainingTracks.length === 0) {
          const nextStreams = { ...currentStreams };
          delete nextStreams[producerSocketId];
          return nextStreams;
        }

        return {
          ...currentStreams,
          [producerSocketId]: new MediaStream(remainingTracks),
        };
      });
    });

    socket.on('update-waiting-room', (nextWaitingParticipants) => {
      setWaitingParticipants(Array.isArray(nextWaitingParticipants) ? nextWaitingParticipants : []);
    });

    socket.on('update-permissions', (nextPermissions) => {
      setPermissions((currentPermissions) => ({
        ...currentPermissions,
        ...(nextPermissions || {}),
      }));
    });

    socket.on('waiting-room-request', (participant) => {
      setWaitingParticipants((currentParticipants) => {
        if (currentParticipants.some((currentParticipant) => currentParticipant.socketId === participant.socketId)) {
          return currentParticipants;
        }

        return [...currentParticipants, participant];
      });
    });

    socket.on('approve-user', (response) => {
      setAdmissionStatus('admitted');
      setPermissions((currentPermissions) => ({
        ...currentPermissions,
        ...(response?.permissions || {}),
      }));
    });

    socket.on('reject-user', () => {
      setAdmissionStatus('rejected');
      cleanupConnections();
      socket.disconnect();
      onRemovedRef.current?.();
    });

    socket.on('user-left', (participant) => {
      closeParticipantMedia(participant.socketId);
      clearTypingParticipant(participant.socketId);
    });

    socket.on('host-mute-user', () => {
      setTracksEnabled(localStreamRef.current, 'audio', false);
      isMicOnRef.current = false;
      setIsMicOn(false);

      const micProducer = producersRef.current.get('mic');
      if (micProducer && !micProducer.closed) {
        micProducer.pause();
        socketRef.current?.emit('pause-producer', { roomId, producerId: micProducer.id });
      }
    });

    socket.on('mute-user', () => {
      setTracksEnabled(localStreamRef.current, 'audio', false);
      isMicOnRef.current = false;
      setIsMicOn(false);

      const micProducer = producersRef.current.get('mic');
      if (micProducer && !micProducer.closed) {
        micProducer.pause();
        socketRef.current?.emit('pause-producer', { roomId, producerId: micProducer.id });
      }
    });

    socket.on('remove-user', () => {
      cleanupConnections();
      socket.disconnect();
      onRemovedRef.current?.();
    });

    socket.on('end-meeting', () => {
      cleanupConnections();
      socket.disconnect();
      onEndedRef.current?.();
    });

    socket.on('host-stop-screen-share', () => {
      stopScreenShareRef.current?.();
    });

    socket.on('screen-share-denied', ({ reason } = {}) => {
      setMediaError(reason || 'Screen sharing is not allowed');
    });

    socket.on('send-reaction', (reactionEvent) => {
      setLastReaction(reactionEvent);
      window.setTimeout(() => setLastReaction(null), 2500);
    });

    socket.on('recording-started', (nextRecordingState = {}) => {
      setRecordingState({
        isRecording: true,
        startedAt: nextRecordingState.startedAt || new Date().toISOString(),
        startedBy: nextRecordingState.startedBy || null,
        stoppedAt: null,
        stoppedBy: null,
      });
    });

    socket.on('recording-stopped', (nextRecordingState = {}) => {
      setRecordingState((currentState) => ({
        ...currentState,
        ...nextRecordingState,
        isRecording: false,
        stoppedAt: nextRecordingState.stoppedAt || new Date().toISOString(),
      }));
    });

    socket.on('receive-message', addChatMessage);
    socket.on('private-message', addChatMessage);

    socket.on('file-uploaded', ({ file } = {}) => {
      if (!file?._id) {
        return;
      }

      setSharedFiles((currentFiles) => {
        if (currentFiles.some((currentFile) => currentFile._id === file._id)) {
          return currentFiles;
        }

        return [{ ...file, absoluteUrl: file.absoluteUrl || file.fileUrl }, ...currentFiles];
      });
    });

    socket.on('shared-file-state', (nextState = {}) => {
      setSharedFileState((currentState) => ({
        ...currentState,
        ...(nextState || {}),
        currentPage: nextState?.currentPage || 1,
      }));
    });

    socket.on('open-shared-file', (nextState = {}) => {
      setSharedFileState((currentState) => ({
        ...currentState,
        ...nextState,
        currentPage: nextState.currentPage || 1,
      }));
    });

    socket.on('close-shared-file', () => {
      setSharedFileState({
        activeFile: null,
        currentPage: 1,
      });
    });

    socket.on('change-file-page', (nextState = {}) => {
      setSharedFileState((currentState) => ({
        ...currentState,
        ...nextState,
        currentPage: nextState.currentPage || currentState.currentPage || 1,
      }));
    });

    socket.on('whiteboard-state', ({ strokes = [] } = {}) => {
      setWhiteboardEvents((currentEvents) => [
        ...currentEvents,
        {
          id: crypto.randomUUID(),
          type: 'state',
          strokes: Array.isArray(strokes) ? strokes : [],
        },
      ]);
    });

    socket.on('whiteboard-draw', ({ stroke } = {}) => {
      if (!stroke) {
        return;
      }

      setWhiteboardEvents((currentEvents) => [
        ...currentEvents,
        { id: stroke.id || crypto.randomUUID(), type: 'draw', stroke },
      ]);
    });

    socket.on('whiteboard-clear', (payload = {}) => {
      setWhiteboardEvents((currentEvents) => [
        ...currentEvents,
        { id: crypto.randomUUID(), type: 'clear', ...payload },
      ]);
    });

    socket.on('whiteboard-undo', ({ strokeId } = {}) => {
      if (!strokeId) {
        return;
      }

      setWhiteboardEvents((currentEvents) => [
        ...currentEvents,
        { id: crypto.randomUUID(), type: 'undo', strokeId },
      ]);
    });

    socket.on('code-state', (nextState = {}) => {
      isCodeEditorReadyRef.current = true;
      setCodeEditorState((currentState) => ({
        ...currentState,
        ...nextState,
        cursors: nextState.cursors || {},
        isReady: true,
      }));
    });

    socket.on('code-change', ({ code, language, activeUser, version } = {}) => {
      setCodeEditorState((currentState) => ({
        ...currentState,
        code: typeof code === 'string' ? code : currentState.code,
        language: language || currentState.language,
        activeUser: activeUser || currentState.activeUser,
        version: typeof version === 'number' ? version : currentState.version,
        isReady: true,
      }));
    });

    socket.on('language-change', ({ language, activeUser, version } = {}) => {
      setCodeEditorState((currentState) => ({
        ...currentState,
        language: language || currentState.language,
        activeUser: activeUser || currentState.activeUser,
        version: typeof version === 'number' ? version : currentState.version,
        isReady: true,
      }));
    });

    socket.on('cursor-position', ({ position, participant } = {}) => {
      if (!participant?.socketId) {
        return;
      }

      setCodeEditorState((currentState) => ({
        ...currentState,
        activeUser: participant,
        cursors: {
          ...currentState.cursors,
          [participant.socketId]: {
            position,
            participant,
            updatedAt: new Date().toISOString(),
          },
        },
      }));
    });

    socket.on('typing', ({ participant }) => {
      showTypingParticipant(participant);
    });

    socket.on('stop-typing', ({ participant }) => {
      clearTypingParticipant(participant?.socketId);
    });

    const ydoc = yDocRef.current;
    const awareness = awarenessRef.current;

    const userColors = ['#f43f5e', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#3b82f6'];
    const assignedColor = userColors[Math.abs((userId || displayName || 'guest').split('').reduce((acc, c) => (acc << 5) - acc + c.charCodeAt(0), 0)) % userColors.length];

    awareness.setLocalStateField('user', {
      name: displayName || 'Guest',
      color: assignedColor,
    });

    const handleYjsDocUpdate = (update, origin) => {
      if (origin !== 'server') {
        socket.emit('yjs-code-update', {
          roomId,
          update: Array.from(update),
        });
      }
    };

    const handleAwarenessUpdate = ({ added, updated, removed }, origin) => {
      if (origin !== 'server') {
        const changedClients = [...added, ...updated, ...removed];
        const update = awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients);
        socket.emit('yjs-awareness-update', {
          roomId,
          update: Array.from(update),
        });
      }
    };

    ydoc.on('update', handleYjsDocUpdate);
    awareness.on('update', handleAwarenessUpdate);

    socket.on('yjs-code-init', ({ update }) => {
      if (update && Array.isArray(update)) {
        Y.applyUpdate(ydoc, new Uint8Array(update), 'server');
      }
    });

    socket.on('yjs-code-update', ({ update }) => {
      if (update && Array.isArray(update)) {
        Y.applyUpdate(ydoc, new Uint8Array(update), 'server');
      }
    });

    socket.on('yjs-awareness-update', ({ update }) => {
      if (update && Array.isArray(update)) {
        awarenessProtocol.applyAwarenessUpdate(awareness, new Uint8Array(update), 'server');
      }
    });

    socket.on('disconnect', () => {
      cleanupConnections();
      hasJoinedRef.current = false;
    });

    if (typeof window !== 'undefined') {
      window.__vync = {
        socket,
        yDoc: ydoc,
        awareness,
        roomId,
      };
    }

    socket.connect();

    return () => {
      if (typeof window !== 'undefined' && window.__vync?.socket === socket) {
        delete window.__vync;
      }
      ydoc.off('update', handleYjsDocUpdate);
      awareness.off('update', handleAwarenessUpdate);
      cleanupConnections();
      socket.disconnect();
      socketRef.current = null;
      hasJoinedRef.current = false;
    };
  }, [
    cleanupConnections,
    addChatMessage,
    clearTypingParticipant,
    closeParticipantMedia,
    consumeProducer,
    displayName,
    isMediaReady,
    role,
    roomId,
    showTypingParticipant,
    userId,
    waitingRoomEnabled,
  ]);

  // Connect to SFU once admitted
  useEffect(() => {
    if (admissionStatus === 'admitted' && socketRef.current && !deviceRef.current) {
      initMediasoup();
    }
  }, [admissionStatus, initMediasoup]);

  useEffect(() => {
    let isMounted = true;

    async function loadChatHistory() {
      if (!roomId) {
        return;
      }

      try {
        const messages = await getChatHistory(roomId, userId);

        if (isMounted) {
          setChatMessages(Array.isArray(messages) ? messages : []);
        }
      } catch {
        if (isMounted) {
          setChatMessages([]);
        }
      }
    }

    loadChatHistory();

    return () => {
      isMounted = false;
    };
  }, [roomId, userId]);

  useEffect(() => {
    let isMounted = true;

    async function loadFiles() {
      if (!roomId) {
        return;
      }

      try {
        const files = await getMeetingFiles(roomId);

        if (isMounted) {
          setSharedFiles(files);
        }
      } catch {
        if (isMounted) {
          setSharedFiles([]);
        }
      }
    }

    loadFiles();

    return () => {
      isMounted = false;
    };
  }, [roomId]);

  const acquireTrack = useCallback(async (kind) => {
    const constraints = kind === 'audio' ? { audio: true } : { video: true };
    const newStream = await navigator.mediaDevices.getUserMedia(constraints);
    const [track] = newStream.getTracks();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks()
        .filter((t) => t.kind === kind)
        .forEach((t) => {
          t.stop();
          localStreamRef.current.removeTrack(t);
        });
      localStreamRef.current.addTrack(track);
      const nextStream = new MediaStream(localStreamRef.current.getTracks());
      localStreamRef.current = nextStream;
      setLocalStream(nextStream);
    } else {
      localStreamRef.current = newStream;
      setLocalStream(newStream);
    }

    const sendTransport = sendTransportRef.current;
    if (sendTransport) {
      const sourceKey = kind === 'audio' ? 'mic' : 'camera';
      const existingProducer = producersRef.current.get(sourceKey);

      if (existingProducer && !existingProducer.closed) {
        await existingProducer.replaceTrack({ track });
        if (existingProducer.paused) {
          await existingProducer.resume();
          socketRef.current?.emit('resume-producer', { roomId, producerId: existingProducer.id });
        }
      } else {
        try {
          const producer = await sendTransport.produce({
            track,
            appData: { source: sourceKey },
            ...(kind === 'video'
              ? {
                  encodings: [
                    { maxBitrate: 100000, scaleResolutionDownBy: 4 },
                    { maxBitrate: 300000, scaleResolutionDownBy: 2 },
                    { maxBitrate: 900000, scaleResolutionDownBy: 1 },
                  ],
                  codecOptions: {
                    videoGoogleStartBitrate: 1000,
                  },
                }
              : {}),
          });
          producersRef.current.set(sourceKey, producer);
        } catch (err) {
          console.error(`[mediasoup] Failed to produce ${sourceKey}:`, err);
        }
      }
    }

    return track;
  }, [roomId]);

  const toggleMic = useCallback(async () => {
    const nextValue = !isMicOnRef.current;
    const hasAudio = (localStreamRef.current?.getAudioTracks().length ?? 0) > 0;

    if (nextValue && !hasAudio) {
      try {
        await acquireTrack('audio');
      } catch {
        setMediaError('Could not access your microphone');
        return;
      }
    }

    setTracksEnabled(localStreamRef.current, 'audio', nextValue);
    isMicOnRef.current = nextValue;
    setIsMicOn(nextValue);

    const micProducer = producersRef.current.get('mic');
    if (micProducer && !micProducer.closed) {
      if (nextValue) {
        micProducer.resume();
        socketRef.current?.emit('resume-producer', { roomId, producerId: micProducer.id });
      } else {
        micProducer.pause();
        socketRef.current?.emit('pause-producer', { roomId, producerId: micProducer.id });
      }
    } else if (nextValue && sendTransportRef.current && localStreamRef.current?.getAudioTracks()[0]) {
      try {
        const producer = await sendTransportRef.current.produce({
          track: localStreamRef.current.getAudioTracks()[0],
          appData: { source: 'mic' },
        });
        producersRef.current.set('mic', producer);
      } catch (err) {
        console.error('[mediasoup] Failed to produce mic:', err);
      }
    }

    emitSocketEvent('toggle-mic', { micOn: nextValue });
  }, [acquireTrack, emitSocketEvent, roomId]);

  const toggleCamera = useCallback(async () => {
    const nextValue = !isCameraOnRef.current;
    const hasVideo = (localStreamRef.current?.getVideoTracks().length ?? 0) > 0;

    if (nextValue && !hasVideo) {
      try {
        await acquireTrack('video');
      } catch {
        setMediaError('Could not access your camera');
        return;
      }
    }

    setTracksEnabled(localStreamRef.current, 'video', nextValue);
    isCameraOnRef.current = nextValue;
    setIsCameraOn(nextValue);

    const camProducer = producersRef.current.get('camera');
    if (camProducer && !camProducer.closed) {
      if (nextValue) {
        camProducer.resume();
        socketRef.current?.emit('resume-producer', { roomId, producerId: camProducer.id });
      } else {
        camProducer.pause();
        socketRef.current?.emit('pause-producer', { roomId, producerId: camProducer.id });
      }
    } else if (nextValue && sendTransportRef.current && localStreamRef.current?.getVideoTracks()[0]) {
      try {
        const producer = await sendTransportRef.current.produce({
          track: localStreamRef.current.getVideoTracks()[0],
          encodings: [
            { maxBitrate: 100000, scaleResolutionDownBy: 4 },
            { maxBitrate: 300000, scaleResolutionDownBy: 2 },
            { maxBitrate: 900000, scaleResolutionDownBy: 1 },
          ],
          codecOptions: {
            videoGoogleStartBitrate: 1000,
          },
          appData: { source: 'camera' },
        });
        producersRef.current.set('camera', producer);
      } catch (err) {
        console.error('[mediasoup] Failed to produce camera:', err);
      }
    }

    emitSocketEvent('toggle-camera', { cameraOn: nextValue });
  }, [acquireTrack, emitSocketEvent, roomId]);

  const toggleHand = useCallback(() => {
    setIsHandRaised((currentValue) => {
      const nextValue = !currentValue;
      emitSocketEvent(nextValue ? 'raise-hand' : 'lower-hand');
      return nextValue;
    });
  }, [emitSocketEvent]);

  const stopScreenShare = useCallback(async () => {
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;
    setScreenShareStream(null);
    setIsScreenSharing(false);

    const cameraProducer = producersRef.current.get('camera');
    const cameraTrack = localStreamRef.current?.getVideoTracks()[0] ?? null;

    if (cameraProducer && !cameraProducer.closed) {
      await cameraProducer.replaceTrack({ track: cameraTrack }).catch(() => {});
      if (!isCameraOnRef.current) {
        cameraProducer.pause();
        socketRef.current?.emit('pause-producer', { roomId, producerId: cameraProducer.id });
      }
    } else {
      const screenProducer = producersRef.current.get('screen');
      if (screenProducer) {
        screenProducer.close();
        socketRef.current?.emit('close-producer', { roomId, producerId: screenProducer.id });
        producersRef.current.delete('screen');
      }
    }

    emitSocketEvent('stop-screen-share');
  }, [emitSocketEvent, roomId]);

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      await stopScreenShare();
      return;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setMediaError('Screen sharing is not supported in this browser');
      return;
    }

    let displayStream;
    try {
      displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' },
        audio: false,
      });
    } catch {
      return;
    }

    const [displayTrack] = displayStream.getVideoTracks();
    if (!displayTrack) {
      stopStream(displayStream);
      return;
    }

    const cameraProducer = producersRef.current.get('camera');
    if (cameraProducer && !cameraProducer.closed) {
      await cameraProducer.replaceTrack({ track: displayTrack }).catch(() => {});
      if (cameraProducer.paused) {
        await cameraProducer.resume();
        socketRef.current?.emit('resume-producer', { roomId, producerId: cameraProducer.id });
      }
    } else if (sendTransportRef.current) {
      try {
        const screenProducer = await sendTransportRef.current.produce({
          track: displayTrack,
          appData: { source: 'screen' },
        });
        producersRef.current.set('screen', screenProducer);
      } catch (err) {
        console.error('[mediasoup] Failed to produce screen:', err);
      }
    }

    screenStreamRef.current = displayStream;
    setScreenShareStream(displayStream);
    setIsScreenSharing(true);

    emitSocketEvent('start-screen-share');

    displayTrack.onended = () => {
      stopScreenShare();
    };
  }, [emitSocketEvent, isScreenSharing, roomId, stopScreenShare]);

  useEffect(() => {
    stopScreenShareRef.current = stopScreenShare;
  }, [stopScreenShare]);

  const leaveMeeting = useCallback(() => {
    stopScreenShare();
    cleanupConnections();
    if (socketRef.current) {
      socketRef.current.emit('leave-room', { roomId });
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    hasJoinedRef.current = false;
  }, [cleanupConnections, roomId, stopScreenShare]);

  useEffect(() => {
    return () => {
      if (ownsStreamRef.current && localStreamRef.current) {
        stopStream(localStreamRef.current);
      }
      stopScreenShare();
    };
  }, [stopScreenShare]);

  const stopScreenShareForParticipant = useCallback(
    (participant) => {
      emitSocketEvent('host-stop-screen-share', {
        targetSocketId: participant.socketId,
        targetUserId: participant.userId,
      });
    },
    [emitSocketEvent],
  );

  const muteParticipant = useCallback(
    (participant) => {
      emitSocketEvent('mute-user', {
        targetSocketId: participant.socketId,
        targetUserId: participant.userId,
      });
    },
    [emitSocketEvent],
  );

  const muteAll = useCallback(() => {
    emitSocketEvent('mute-all');
  }, [emitSocketEvent]);

  const makeCohost = useCallback(
    (participant) => {
      emitSocketEvent('make-cohost', {
        targetSocketId: participant.socketId,
        targetUserId: participant.userId,
      });
    },
    [emitSocketEvent],
  );

  const approveWaitingUser = useCallback(
    (participant) => {
      emitSocketEvent('approve-user', {
        targetSocketId: participant.socketId,
        targetUserId: participant.userId,
      });
    },
    [emitSocketEvent],
  );

  const rejectWaitingUser = useCallback(
    (participant) => {
      emitSocketEvent('reject-user', {
        targetSocketId: participant.socketId,
        targetUserId: participant.userId,
      });
    },
    [emitSocketEvent],
  );

  const updatePermissions = useCallback(
    (nextPermissions) => {
      emitSocketEvent('update-permissions', { permissions: nextPermissions });
    },
    [emitSocketEvent],
  );

  const removeParticipant = useCallback(
    (participant) => {
      emitSocketEvent('remove-user', {
        targetSocketId: participant.socketId,
        targetUserId: participant.userId,
      });
    },
    [emitSocketEvent],
  );

  const sendReaction = useCallback(
    (reaction) => {
      emitSocketEvent('send-reaction', { reaction });
    },
    [emitSocketEvent],
  );

  const endMeeting = useCallback(() => {
    emitSocketEvent('end-meeting');
  }, [emitSocketEvent]);

  const startRecording = useCallback(
    () =>
      new Promise((resolve) => {
        if (!socketRef.current) {
          resolve({ ok: false, message: 'Meeting connection is not ready yet' });
          return;
        }

        socketRef.current?.emit('recording-started', { roomId }, (response = {}) => {
          if (response.ok) {
            resolve({ ok: true, recording: response.recording });
            return;
          }

          resolve({ ok: false, message: response.message || 'Could not start recording' });
        });
      }),
    [roomId],
  );

  const stopRecording = useCallback(
    () =>
      new Promise((resolve) => {
        if (!socketRef.current) {
          resolve({ ok: false, message: 'Meeting connection is not ready yet' });
          return;
        }

        socketRef.current?.emit('recording-stopped', { roomId }, (response = {}) => {
          if (response.ok) {
            resolve({ ok: true, recording: response.recording });
            return;
          }

          resolve({ ok: false, message: response.message || 'Could not stop recording' });
        });
      }),
    [roomId],
  );

  const sendChatMessage = useCallback(
    ({ message, receiverSocketId = '', type = 'text' }) => {
      const eventName = receiverSocketId ? 'private-message' : 'send-message';
      socketRef.current?.emit(eventName, {
        roomId,
        receiverSocketId,
        message,
        type,
      });
    },
    [roomId],
  );

  const sendTyping = useCallback(() => {
    emitSocketEvent('typing');
  }, [emitSocketEvent]);

  const stopTyping = useCallback(() => {
    emitSocketEvent('stop-typing');
  }, [emitSocketEvent]);

  const announceUploadedFile = useCallback(
    (file) => {
      emitSocketEvent('file-uploaded', { file });
    },
    [emitSocketEvent],
  );

  const openSharedFile = useCallback(
    (file, currentPage = 1) => {
      emitSocketEvent('open-shared-file', { file, currentPage });
    },
    [emitSocketEvent],
  );

  const closeSharedFile = useCallback(() => {
    emitSocketEvent('close-shared-file');
  }, [emitSocketEvent]);

  const changeSharedFilePage = useCallback(
    (currentPage) => {
      emitSocketEvent('change-file-page', { currentPage });
    },
    [emitSocketEvent],
  );

  const sendWhiteboardDraw = useCallback(
    (stroke) => {
      emitSocketEvent('whiteboard-draw', { stroke });
    },
    [emitSocketEvent],
  );

  const sendWhiteboardClear = useCallback(() => {
    emitSocketEvent('whiteboard-clear');
  }, [emitSocketEvent]);

  const sendWhiteboardUndo = useCallback(
    (strokeId) => {
      emitSocketEvent('whiteboard-undo', { strokeId });
    },
    [emitSocketEvent],
  );

  const sendCodeChange = useCallback(
    (codeOrPayload) => {
      if (!isCodeEditorReadyRef.current) {
        return;
      }
      const code = typeof codeOrPayload === 'string'
        ? codeOrPayload
        : typeof codeOrPayload?.code === 'string'
          ? codeOrPayload.code
          : '';
      const language = typeof codeOrPayload?.language === 'string'
        ? codeOrPayload.language
        : undefined;

      emitSocketEvent('code-change', { code, language });
    },
    [emitSocketEvent],
  );

  const sendLanguageChange = useCallback(
    (language) => {
      if (!isCodeEditorReadyRef.current) {
        return;
      }
      emitSocketEvent('language-change', { language });
    },
    [emitSocketEvent],
  );

  const sendCursorPosition = useCallback(
    (position) => {
      if (!isCodeEditorReadyRef.current) {
        return;
      }
      emitSocketEvent('cursor-position', { position });
    },
    [emitSocketEvent],
  );

  return {
    admissionStatus,
    approveWaitingUser,
    announceUploadedFile,
    changeSharedFilePage,
    closeSharedFile,
    endMeeting,
    codeEditorState,
    chatMessages,
    isCameraOn,
    isHandRaised,
    isMicOn,
    isScreenSharing,
    lastReaction,
    leaveMeeting,
    localSocketId,
    localStream,
    mediaError,
    makeCohost,
    muteAll,
    muteParticipant,
    participants,
    permissions,
    rejectWaitingUser,
    recordingState,
    remoteStreams,
    removeParticipant,
    screenShareStream,
    sharedFiles,
    sharedFileState,
    openSharedFile,
    sendReaction,
    sendChatMessage,
    sendCodeChange,
    sendCursorPosition,
    sendLanguageChange,
    sendTyping,
    stopTyping,
    startRecording,
    stopScreenShareForParticipant,
    stopRecording,
    toggleCamera,
    toggleHand,
    toggleMic,
    toggleScreenShare,
    typingParticipants,
    updatePermissions,
    waitingParticipants,
    whiteboardEvents,
    sendWhiteboardClear,
    sendWhiteboardDraw,
    sendWhiteboardUndo,
    yDoc: yDocRef.current,
    awareness: awarenessRef.current,
  };
}
