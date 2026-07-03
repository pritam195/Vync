import { useCallback, useEffect, useRef, useState } from 'react';
import { getChatHistory } from '../services/chat.js';
import { getMeetingFiles } from '../services/files.js';
import { createSocket } from '../services/socket.js';
import { getRtcConfiguration } from '../lib/webrtcConfig.js';

const rtcConfiguration = getRtcConfiguration();
const shouldDebugIce = import.meta.env.DEV;

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

async function logSelectedIceCandidateType(peerConnection, remoteSocketId) {
  if (!shouldDebugIce || !peerConnection.getStats) {
    return;
  }

  try {
    const stats = await peerConnection.getStats();
    const selectedPair = [...stats.values()].find(
      (report) =>
        report.type === 'candidate-pair' &&
        (report.selected || report.state === 'succeeded' || report.nominated),
    );
    const localCandidate = selectedPair?.localCandidateId
      ? stats.get(selectedPair.localCandidateId)
      : null;

    if (localCandidate?.candidateType) {
      console.debug('[Vync WebRTC] selected ICE candidate', {
        remoteSocketId,
        type: localCandidate.candidateType,
        protocol: localCandidate.protocol,
        url: localCandidate.url,
      });
    }
  } catch (error) {
    console.debug('[Vync WebRTC] could not inspect selected ICE candidate', {
      remoteSocketId,
      error,
    });
  }
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
  const peerConnectionsRef = useRef(new Map());
  const pendingIceCandidatesRef = useRef({});
  const localStreamRef = useRef(initialStream);
  // True only when this hook acquired the stream via getUserMedia.
  // When a stream is passed in (initialStream), the parent owns it and
  // is responsible for stopping its tracks — we must not stop it here,
  // especially because React StrictMode fires the cleanup effect on a
  // fake unmount which would permanently kill the passed-in tracks.
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

  const closePeerConnection = useCallback((socketId) => {
    peerConnectionsRef.current.get(socketId)?.close();
    peerConnectionsRef.current.delete(socketId);
    setRemoteStreams((currentStreams) => {
      const nextStreams = { ...currentStreams };
      delete nextStreams[socketId];
      return nextStreams;
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

  const cleanupConnections = useCallback(() => {
    peerConnectionsRef.current.forEach((peerConnection) => peerConnection.close());
    peerConnectionsRef.current.clear();
    setRemoteStreams({});
  }, []);

  const createPeerConnection = useCallback(
    (remoteSocketId) => {
      const existingConnection = peerConnectionsRef.current.get(remoteSocketId);

      if (existingConnection) {
        return existingConnection;
      }

      const peerConnection = new RTCPeerConnection(rtcConfiguration);
      peerConnectionsRef.current.set(remoteSocketId, peerConnection);

      localStreamRef.current?.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStreamRef.current);
      });

      peerConnection.ontrack = (event) => {
        const [remoteStream] = event.streams;

        if (!remoteStream) {
          return;
        }

        setRemoteStreams((currentStreams) => ({
          ...currentStreams,
          [remoteSocketId]: remoteStream,
        }));
      };

      peerConnection.onicecandidate = (event) => {
        if (!event.candidate) {
          return;
        }

        socketRef.current?.emit('ice-candidate', {
          targetSocketId: remoteSocketId,
          candidate: event.candidate,
        });
      };

      peerConnection.onconnectionstatechange = () => {
        if (shouldDebugIce) {
          console.debug('[Vync WebRTC] connection state', {
            remoteSocketId,
            state: peerConnection.connectionState,
          });
        }

        if (peerConnection.connectionState === 'connected') {
          logSelectedIceCandidateType(peerConnection, remoteSocketId);
        }

        if (['closed', 'disconnected', 'failed'].includes(peerConnection.connectionState)) {
          closePeerConnection(remoteSocketId);
        }
      };

      peerConnection.oniceconnectionstatechange = () => {
        if (shouldDebugIce) {
          console.debug('[Vync WebRTC] ICE connection state', {
            remoteSocketId,
            state: peerConnection.iceConnectionState,
          });
        }

        if (['connected', 'completed'].includes(peerConnection.iceConnectionState)) {
          logSelectedIceCandidateType(peerConnection, remoteSocketId);
        }
      };

      return peerConnection;
    },
    [closePeerConnection],
  );

  const createOffer = useCallback(
    async (remoteSocketId) => {
      const peerConnection = createPeerConnection(remoteSocketId);
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      socketRef.current?.emit('offer', {
        targetSocketId: remoteSocketId,
        description: peerConnection.localDescription,
      });
    },
    [createPeerConnection],
  );

  const addPendingIceCandidates = useCallback(async (socketId, peerConnection) => {
    const pendingCandidates = pendingIceCandidatesRef.current[socketId] || [];

    if (!pendingCandidates.length) {
      return;
    }

    await Promise.all(
      pendingCandidates.map((candidate) =>
        peerConnection.addIceCandidate(new RTCIceCandidate(candidate)),
      ),
    );
    delete pendingIceCandidatesRef.current[socketId];
  }, []);

  // Capture the initial values once in a ref so the effect only runs on mount.
  // Using the raw props in the dep array caused getUserMedia to be called again
  // whenever the parent toggled mic/camera before joining, which stopped the
  // first stream and left the video element with a dead srcObject.
  const initialValuesRef = useRef({ initialCameraOn, initialMicOn, initialStream });

  useEffect(() => {
    let isMounted = true;
    const { initialCameraOn: camOn, initialMicOn: micOn, initialStream: stream } =
      initialValuesRef.current;

    async function prepareLocalMedia() {
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
        const acquiredStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        });

        if (!isMounted) {
          stopStream(acquiredStream);
          return;
        }

        setTracksEnabled(acquiredStream, 'audio', micOn);
        setTracksEnabled(acquiredStream, 'video', camOn);
        localStreamRef.current = acquiredStream;
        ownsStreamRef.current = true; // we acquired this stream, we own it
        setLocalStream(acquiredStream);
        setMediaError('');
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setMediaError(
          error.name === 'NotAllowedError'
            ? 'Camera or microphone permission was blocked'
            : 'Could not access your camera or microphone',
        );
        isMicOnRef.current = false;
        isCameraOnRef.current = false;
        setIsMicOn(false);
        setIsCameraOn(false);
      }
    }

    prepareLocalMedia();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!roomId || !localStream || hasJoinedRef.current) {
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

    socket.on('user-joined', (participant) => {
      if (
        participant?.socketId &&
        participant.socketId !== socket.id &&
        !peerConnectionsRef.current.has(participant.socketId)
      ) {
        createOffer(participant.socketId);
      }
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
      closePeerConnection(participant.socketId);
      clearTypingParticipant(participant.socketId);
    });

    socket.on('offer', async ({ fromSocketId, description }) => {
      if (!fromSocketId || !description) {
        return;
      }

      const peerConnection = createPeerConnection(fromSocketId);
      await peerConnection.setRemoteDescription(new RTCSessionDescription(description));
      await addPendingIceCandidates(fromSocketId, peerConnection);
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit('answer', {
        targetSocketId: fromSocketId,
        description: peerConnection.localDescription,
      });
    });

    socket.on('answer', async ({ fromSocketId, description }) => {
      const peerConnection = peerConnectionsRef.current.get(fromSocketId);

      if (!peerConnection || !description) {
        return;
      }

      await peerConnection.setRemoteDescription(new RTCSessionDescription(description));
      await addPendingIceCandidates(fromSocketId, peerConnection);
    });

    socket.on('ice-candidate', async ({ fromSocketId, candidate }) => {
      const peerConnection = peerConnectionsRef.current.get(fromSocketId);

      if (!candidate) {
        return;
      }

      if (!peerConnection?.remoteDescription) {
        pendingIceCandidatesRef.current[fromSocketId] = [
          ...(pendingIceCandidatesRef.current[fromSocketId] || []),
          candidate,
        ];
        return;
      }

      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    });

    socket.on('host-mute-user', () => {
      setTracksEnabled(localStreamRef.current, 'audio', false);
      isMicOnRef.current = false;
      setIsMicOn(false);
    });

    socket.on('mute-user', () => {
      setTracksEnabled(localStreamRef.current, 'audio', false);
      isMicOnRef.current = false;
      setIsMicOn(false);
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
      // The host has forced our screen share to stop
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

    socket.on('disconnect', () => {
      cleanupConnections();
      hasJoinedRef.current = false;
    });

    socket.connect();

    return () => {
      cleanupConnections();
      socket.disconnect();
      socketRef.current = null;
      hasJoinedRef.current = false;
    };
  }, [
    cleanupConnections,
    addPendingIceCandidates,
    addChatMessage,
    clearTypingParticipant,
    closePeerConnection,
    createOffer,
    createPeerConnection,
    displayName,
    localStream,
    role,
    roomId,
    showTypingParticipant,
    userId,
    waitingRoomEnabled,
  ]);

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
      // Patch the existing stream so VideoPlayer's srcObject stays valid
      localStreamRef.current.getTracks()
        .filter((t) => t.kind === kind)
        .forEach((t) => {
          t.stop();
          localStreamRef.current.removeTrack(t);
        });
      localStreamRef.current.addTrack(track);
      // Force a re-render by replacing the stream reference
      const nextStream = new MediaStream(localStreamRef.current.getTracks());
      localStreamRef.current = nextStream;
      setLocalStream(nextStream);
    } else {
      localStreamRef.current = newStream;
      setLocalStream(newStream);
    }

    // Add the new track to every active peer connection
    peerConnectionsRef.current.forEach((pc) => {
      pc.addTrack(track, localStreamRef.current);
    });

    return track;
  }, []);

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
    emitSocketEvent('toggle-mic', { micOn: nextValue });
  }, [acquireTrack, emitSocketEvent]);

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
    emitSocketEvent('toggle-camera', { cameraOn: nextValue });
  }, [acquireTrack, emitSocketEvent]);

  const toggleHand = useCallback(() => {
    setIsHandRaised((currentValue) => {
      const nextValue = !currentValue;
      emitSocketEvent(nextValue ? 'raise-hand' : 'lower-hand');
      return nextValue;
    });
  }, [emitSocketEvent]);

  const stopScreenShare = useCallback(async () => {
    // Stop display media tracks
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;
    setScreenShareStream(null);
    setIsScreenSharing(false);

    // Restore the original camera video track in every peer connection
    const cameraTrack = localStreamRef.current?.getVideoTracks()[0] ?? null;
    peerConnectionsRef.current.forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
      if (sender) {
        sender.replaceTrack(cameraTrack).catch(() => {});
      }
    });

    emitSocketEvent('stop-screen-share');
  }, [emitSocketEvent]);

  const toggleScreenShare = useCallback(async () => {
    // ── Stop if already sharing ──────────────────────────────────────────────
    if (isScreenSharing) {
      await stopScreenShare();
      return;
    }

    // ── Start sharing ────────────────────────────────────────────────────────
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
      // User cancelled or permission denied — no error shown
      return;
    }

    const [displayTrack] = displayStream.getVideoTracks();
    if (!displayTrack) {
      stopStream(displayStream);
      return;
    }

    // Replace the video sender track in every active peer connection
    peerConnectionsRef.current.forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
      if (sender) {
        sender.replaceTrack(displayTrack).catch(() => {});
      }
    });

    screenStreamRef.current = displayStream;
    setScreenShareStream(displayStream);
    setIsScreenSharing(true);

    emitSocketEvent('start-screen-share');

    // Auto-stop when the user clicks the browser's native "Stop sharing" button
    displayTrack.onended = () => {
      stopScreenShare();
    };
  }, [emitSocketEvent, isScreenSharing, stopScreenShare]);

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
    () => new Promise((resolve) => {
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
    () => new Promise((resolve) => {
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

  const sendTyping = useCallback(
    (receiverSocketId = '') => {
      emitSocketEvent('typing', { receiverSocketId });
    },
    [emitSocketEvent],
  );

  const announceUploadedFile = useCallback(
    (file) => {
      socketRef.current?.emit('file-uploaded', {
        roomId,
        file,
      });
    },
    [roomId],
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

  const stopTyping = useCallback(
    (receiverSocketId = '') => {
      emitSocketEvent('stop-typing', { receiverSocketId });
    },
    [emitSocketEvent],
  );

  const sendWhiteboardDraw = useCallback(
    (stroke) => {
      socketRef.current?.emit('whiteboard-draw', {
        roomId,
        stroke,
      });
    },
    [roomId],
  );

  const sendWhiteboardClear = useCallback(() => {
    emitSocketEvent('whiteboard-clear');
  }, [emitSocketEvent]);

  const sendWhiteboardUndo = useCallback(() => {
    emitSocketEvent('whiteboard-undo');
  }, [emitSocketEvent]);

  const sendCodeChange = useCallback(
    ({ code, language }) => {
      if (!isCodeEditorReadyRef.current) {
        return;
      }

      socketRef.current?.emit('code-change', {
        roomId,
        code,
        language,
      });
    },
    [roomId],
  );

  const sendLanguageChange = useCallback(
    (language) => {
      emitSocketEvent('language-change', { language });
    },
    [emitSocketEvent],
  );

  const sendCursorPosition = useCallback(
    (position) => {
      emitSocketEvent('cursor-position', { position });
    },
    [emitSocketEvent],
  );

  const leaveMeeting = useCallback(() => {
    cleanupConnections();
    socketRef.current?.disconnect();
    // Only stop tracks if this hook acquired the stream itself.
    // If the stream was passed in from a parent, the parent is
    // responsible for cleanup (stopping here would break StrictMode
    // remounts by permanently killing shared track references).
    if (ownsStreamRef.current) {
      stopStream(localStreamRef.current);
    }
  }, [cleanupConnections]);

  useEffect(
    () => () => {
      leaveMeeting();
    },
    [leaveMeeting],
  );

  // Keep the ref pointing at the latest stopScreenShare so the socket
  // listener (which is registered once) can call it without stale closure.
  useEffect(() => {
    stopScreenShareRef.current = stopScreenShare;
  }, [stopScreenShare]);

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
  };
}
