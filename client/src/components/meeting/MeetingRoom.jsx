import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion as Motion } from 'framer-motion';
import { Maximize2, Minimize2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useWebRTC } from '../../hooks/useWebRTC.js';
import ControlBar from './ControlBar.jsx';
import RightSidebar from './RightSidebar.jsx';
import VideoGrid from './VideoGrid.jsx';
import { uploadRecordingChunk, assembleRecordingSession } from '../../services/recordings.js';

function formatMeetingDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function getSupportedRecordingMimeType() {
  const preferredTypes = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];

  return preferredTypes.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

function recordingFileName(meetingId, startedAt = new Date()) {
  const timestamp = new Date(startedAt).toISOString().replace(/[:.]/g, '-');
  return `${meetingId || 'meeting'}-${timestamp}.webm`;
}

function MeetingRoom({
  displayName,
  initialCameraOn = true,
  initialMicOn = true,
  initialStream = null,
  meeting,
}) {
  const navigate = useNavigate();
  const { currentUser, isGuest } = useAuth();
  const { showToast } = useToast();
  const [activePanel, setActivePanel] = useState('participants');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [pendingRecording, setPendingRecording] = useState(null);
  const [isPersonalRecording, setIsPersonalRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const roomRef = useRef(null);
  const stableGuestIdRef = useRef(crypto.randomUUID());
  const mediaRecorderRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const recordingStartedAtRef = useRef(null);
  const recordingStreamRef = useRef(null);
  const wasRecordingRef = useRef(false);
  const recordingSessionIdRef = useRef('');
  const chunkIndexRef = useRef(0);
  const chunkUploadChainRef = useRef(Promise.resolve());
  const roomId = meeting?.meetingId;

  const userId = useMemo(
    () => currentUser?.id || currentUser?._id || stableGuestIdRef.current,
    [currentUser],
  );
  const requestedRole =
    (meeting?.host?.userId && String(meeting.host.userId) === String(userId)) ||
    (meeting?.host?.guestId && String(meeting.host.guestId) === String(userId))
      ? 'host'
      : isGuest
        ? 'guest'
        : 'participant';

  const {
    admissionStatus,
    announceUploadedFile,
    approveWaitingUser,
    changeSharedFilePage,
    chatMessages,
    closeSharedFile,
    codeEditorState,
    endMeeting,
    isCameraOn,
    isHandRaised,
    isMicOn,
    isScreenSharing,
    lastReaction,
    leaveMeeting,
    localSocketId,
    localStream,
    makeCohost,
    mediaError,
    muteAll,
    muteParticipant,
    participants,
    permissions,
    recordingState,
    rejectWaitingUser,
    remoteStreams,
    removeParticipant,
    screenShareStream,
    sharedFiles,
    sharedFileState,
    sendChatMessage,
    sendCodeChange,
    sendCursorPosition,
    sendLanguageChange,
    sendReaction,
    sendTyping,
    stopTyping,
    stopScreenShareForParticipant,
    toggleCamera,
    toggleHand,
    toggleMic,
    toggleScreenShare,
    typingParticipants,
    updatePermissions,
    waitingParticipants,
    openSharedFile,
    whiteboardEvents,
    sendWhiteboardClear,
    sendWhiteboardDraw,
    sendWhiteboardUndo,
    yDoc,
    awareness,
  } = useWebRTC({
    displayName: displayName || currentUser?.name || 'Guest',
    initialCameraOn,
    initialMicOn,
    initialStream,
    onEnded: () => navigate('/'),
    onRemoved: () => navigate('/'),
    role: requestedRole,
    roomId,
    userId,
    waitingRoomEnabled: Boolean(meeting?.settings?.waitingRoom),
  });

  const localParticipant = participants.find(
    (participant) => participant.socketId === localSocketId,
  );
  const canModerate = localParticipant?.role === 'host' || localParticipant?.role === 'cohost';
  const screenSharingParticipant = participants.find((p) => p.isScreenSharing) || null;
  const [sidebarWidth, setSidebarWidth] = useState(360);
  const [isResizing, setIsResizing] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === 'undefined' ? 1280 : window.innerWidth,
  );
  const isOverlaySidebar = viewportWidth < 1180;
  const isPhoneViewport = viewportWidth < 700;

  useEffect(() => {
    const handleResize = () => {
      setViewportWidth(window.innerWidth);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const startedAt = new Date(meeting?.startedAt || meeting?.createdAt || Date.now()).getTime();

    const updateElapsed = () => {
      setElapsedSeconds(Math.max(Math.floor((Date.now() - startedAt) / 1000), 0));
    };

    updateElapsed();
    const interval = window.setInterval(updateElapsed, 1000);

    return () => window.clearInterval(interval);
  }, [meeting?.createdAt, meeting?.startedAt]);

  useEffect(() => {
    if (isOverlaySidebar) {
      return;
    }

    if (activePanel === 'code' || activePanel === 'whiteboard') {
      setSidebarWidth((prev) => Math.max(prev, Math.min(440, window.innerWidth * 0.32)));
    } else {
      setSidebarWidth((prev) => Math.min(prev, 380));
    }
  }, [activePanel, isOverlaySidebar]);

  useEffect(() => {
    if (!isResizing) return;

    const handlePointerMove = (e) => {
      const newWidth = window.innerWidth - e.clientX;
      const minWidth = activePanel === 'code' || activePanel === 'whiteboard' ? 380 : 320;
      const maxWidth = Math.min(activePanel === 'code' || activePanel === 'whiteboard' ? 720 : 560, window.innerWidth * 0.58);
      setSidebarWidth(Math.min(Math.max(newWidth, minWidth), maxWidth));
    };

    const handlePointerUp = () => {
      setIsResizing(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [activePanel, isResizing]);

  const handlePointerDownResize = (e) => {
    if (isOverlaySidebar) {
      return;
    }

    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setIsResizing(true);
  };

  const changePanel = (panel) => {
    setActivePanel(panel);
    setIsSidebarOpen(true);
  };

  const [isUiVisible, setIsUiVisible] = useState(true);
  const uiTimeoutRef = useRef(null);

  useEffect(() => {
    const handleMouseMove = () => {
      setIsUiVisible(true);
      if (uiTimeoutRef.current) {
        clearTimeout(uiTimeoutRef.current);
      }
      uiTimeoutRef.current = setTimeout(() => {
        setIsUiVisible(false);
      }, 3500);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchstart', handleMouseMove);
    window.addEventListener('click', handleMouseMove);
    handleMouseMove(); // Initial trigger

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchstart', handleMouseMove);
      window.removeEventListener('click', handleMouseMove);
      if (uiTimeoutRef.current) clearTimeout(uiTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!mediaError) {
      return;
    }

    showToast({ message: mediaError, title: 'Device issue', type: 'error' });
  }, [mediaError, showToast]);

  useEffect(() => {
    if (recordingState.isRecording && !wasRecordingRef.current) {
      showToast({
        message: `${recordingState.startedBy?.name || 'The host'} started recording this meeting.`,
        title: 'Recording started',
        type: 'info',
        duration: 6000,
      });
    }

    if (!recordingState.isRecording && wasRecordingRef.current) {
      showToast({
        message: `${recordingState.stoppedBy?.name || 'The host'} stopped recording this meeting.`,
        title: 'Recording stopped',
        type: 'info',
        duration: 5000,
      });
    }

    wasRecordingRef.current = recordingState.isRecording;
  }, [recordingState, showToast]);

  useEffect(() => {
    const isTypingTarget = (target) => {
      const tagName = target?.tagName?.toLowerCase();
      return (
        tagName === 'input' ||
        tagName === 'textarea' ||
        tagName === 'select' ||
        target?.isContentEditable ||
        Boolean(target?.closest?.('.monaco-editor, .monaco-editor textarea, [role="textbox"]'))
      );
    };

    const onShortcutToggleMic = () => {
      toggleMic();
      showToast({
        message: isMicOn ? 'Microphone muted' : 'Microphone unmuted',
        title: 'Shortcut Ctrl+Alt+M',
      });
    };

    const onShortcutToggleCamera = () => {
      toggleCamera();
      showToast({
        message: isCameraOn ? 'Camera turned off' : 'Camera turned on',
        title: 'Shortcut Ctrl+Alt+V',
      });
    };

    const onShortcutToggleHand = () => {
      toggleHand();
      showToast({
        message: isHandRaised ? 'Hand lowered' : 'Hand raised',
        title: 'Shortcut Ctrl+Alt+H',
      });
    };

    const handleKeyDown = (event) => {
      if (isTypingTarget(event.target)) {
        return;
      }

      const isMeetingShortcut = (event.ctrlKey || event.metaKey) && event.altKey;

      if (!isMeetingShortcut) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === 'escape') {
        setIsSidebarOpen(false);
        showToast({ message: 'Sidebar closed', title: 'Shortcut' });
        return;
      }

      if (key === 'm') {
        event.preventDefault();
        onShortcutToggleMic();
      }

      if (key === 'v') {
        event.preventDefault();
        onShortcutToggleCamera();
      }

      if (key === 'c') {
        event.preventDefault();
        changePanel('chat');
        showToast({ message: 'Chat opened', title: 'Shortcut' });
      }

      if (key === 'p') {
        event.preventDefault();
        changePanel('participants');
        showToast({ message: 'Participants opened', title: 'Shortcut' });
      }

      if (key === 'h') {
        event.preventDefault();
        onShortcutToggleHand();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isCameraOn,
    isHandRaised,
    isMicOn,
    showToast,
    toggleCamera,
    toggleHand,
    toggleMic,
  ]);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        showToast({ message: 'Fullscreen closed', title: 'Meeting view' });
        return;
      }

      await roomRef.current?.requestFullscreen();
      showToast({ message: 'Fullscreen opened', title: 'Meeting view', type: 'success' });
    } catch {
      showToast({
        message: 'Your browser could not switch fullscreen mode.',
        title: 'Fullscreen unavailable',
        type: 'error',
      });
    }
  };

  const handleLeave = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    leaveMeeting();
    navigate('/');
  };

  useEffect(
    () => () => {
      if (pendingRecording?.url) {
        URL.revokeObjectURL(pendingRecording.url);
      }
    },
    [pendingRecording],
  );

  async function cleanupRecordingCapture() {
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;
  }

  function buildPersonalRecordingStream() {
    const liveTracks = localStream
      ?.getTracks?.()
      .filter((track) => track.readyState === 'live' && track.enabled)
      .map((track) => track.clone()) || [];

    if (!liveTracks.length) {
      throw new Error('Turn on your camera or microphone before starting a personal recording.');
    }

    const recordingStream = new MediaStream(liveTracks);
    recordingStreamRef.current = recordingStream;
    return recordingStream;
  }

  async function handleStartRecording() {
    if (!window.MediaRecorder) {
      showToast({
        message: 'This browser does not support personal recording.',
        title: 'Recording unavailable',
        type: 'error',
      });
      return;
    }

    let recordingStream;
    try {
      recordingStream = buildPersonalRecordingStream();
    } catch (error) {
      showToast({
        message: error.message || 'Turn on your camera or microphone before recording.',
        title: 'Recording unavailable',
        type: 'error',
      });
      return;
    }

    try {
      const mimeType = getSupportedRecordingMimeType();
      const recorder = new MediaRecorder(recordingStream, mimeType ? { mimeType } : undefined);
      const startedAt = new Date().toISOString();
      const sessionId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      recordingChunksRef.current = [];
      recordingStartedAtRef.current = startedAt;
      recordingSessionIdRef.current = sessionId;
      chunkIndexRef.current = 0;
      chunkUploadChainRef.current = Promise.resolve();

      if (pendingRecording?.url) {
        URL.revokeObjectURL(pendingRecording.url);
      }
      setPendingRecording(null);

      recorder.ondataavailable = (event) => {
        if (event.data?.size) {
          const chunk = event.data;
          recordingChunksRef.current.push(chunk);

          // Upload chunk incrementally to server with manifest tracking
          const currentChunkIdx = chunkIndexRef.current++;
          const recId = recordingSessionIdRef.current;
          const fileName = recordingFileName(roomId, recordingStartedAtRef.current);

          chunkUploadChainRef.current = chunkUploadChainRef.current
            .then(async () => {
              await uploadRecordingChunk(roomId, recId, chunk, {
                chunkIndex: currentChunkIdx,
                isLastChunk: false,
                fileName,
                recordedBy: {
                  userId: String(userId || ''),
                  name: String(currentUser?.name || displayName || 'Guest'),
                  socketId: String(localSocketId || ''),
                },
              });
            })
            .catch((err) => {
              console.warn('[MeetingRoom] Chunk upload error:', err);
            });
        }
      };

      recorder.onstop = async () => {
        const blob = new Blob(recordingChunksRef.current, {
          type: recorder.mimeType || 'video/webm',
        });
        const url = URL.createObjectURL(blob);
        const stoppedAt = new Date();
        const durationSeconds = Math.max(
          Math.round((stoppedAt - new Date(recordingStartedAtRef.current)) / 1000),
          0,
        );

        setPendingRecording({
          blob,
          durationSeconds,
          fileName: recordingFileName(roomId, recordingStartedAtRef.current),
          startedAt: recordingStartedAtRef.current,
          url,
        });

        // Trigger assembly of uploaded chunks on server
        const recId = recordingSessionIdRef.current;
        chunkUploadChainRef.current = chunkUploadChainRef.current
          .then(async () => {
            if (recId) {
              await assembleRecordingSession(roomId, recId).catch(() => {});
            }
          })
          .catch(() => {});

        recordingChunksRef.current = [];
        mediaRecorderRef.current = null;
        await cleanupRecordingCapture();
        setIsPersonalRecording(false);
        showToast({
          message: 'Your personal recording is ready and backed up incrementally.',
          title: 'Recording ready',
          type: 'success',
        });
      };

      recorder.start(2000);
      mediaRecorderRef.current = recorder;
      setIsPersonalRecording(true);
      showToast({
        message: 'Recording your own camera and microphone locally on this device.',
        title: 'Personal recording started',
        type: 'success',
      });
    } catch {
      await cleanupRecordingCapture();
      setIsPersonalRecording(false);
      showToast({
        message: 'The browser could not start a personal recording.',
        title: 'Recording failed',
        type: 'error',
      });
    }
  }

  async function handleStopRecording() {
    const recorder = mediaRecorderRef.current;
    if (recorder?.state === 'recording') {
      recorder.requestData();
      recorder.stop();
    }
  }

  async function handleToggleRecording() {
    if (mediaRecorderRef.current?.state === 'recording' || isPersonalRecording) {
      await handleStopRecording();
      return;
    }

    await handleStartRecording();
  }

  function handleDownloadRecording() {
    if (!pendingRecording) {
      return;
    }

    const link = document.createElement('a');
    link.href = pendingRecording.url;
    link.download = pendingRecording.fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();

    showToast({
      message: 'The recording download has started.',
      title: 'Saving locally',
      type: 'success',
    });
  }

  function handleDismissRecording() {
    if (pendingRecording?.url) {
      URL.revokeObjectURL(pendingRecording.url);
    }

    setPendingRecording(null);
  }

  if (admissionStatus === 'waiting') {
    return (
      <section className="meeting-surface grid min-h-screen place-items-center overflow-hidden p-6 text-center text-white">
        <div className="meeting-chrome w-full max-w-xl rounded-[1.75rem] p-8">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/10">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-primary" />
            </span>
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-primary">
            Waiting room
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-white">
            Waiting for host approval
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-white/62">
            You will enter the meeting as soon as a host or co-host approves your request.
          </p>
          <button
            className="mt-7 inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-glow transition hover:bg-primary/90"
            onClick={handleLeave}
            type="button"
          >
            Leave waiting room
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      className={`meeting-surface relative flex h-screen w-screen overflow-hidden font-sans text-white ${isResizing ? 'cursor-col-resize select-none' : ''}`}
      style={{ minHeight: '100dvh', height: '100dvh' }}
      ref={roomRef}
    >
      <AnimatePresence>
        {(isUiVisible || isSidebarOpen) && (
          <Motion.header
            initial={{ opacity: 0, y: -24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24, transition: { duration: 0.3 } }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-auto absolute left-2 right-2 top-2 z-40 flex items-start justify-between gap-2 sm:left-4 sm:right-4 sm:top-4 sm:gap-4"
          >
        <div className="meeting-chrome flex max-w-[min(34rem,calc(100vw-4.75rem))] flex-col gap-1 rounded-2xl px-3 py-2 sm:max-w-[min(42rem,calc(100vw-2rem))] sm:rounded-full sm:px-4 sm:py-2.5">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <span className="flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-2.5 w-2.5 animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
            </span>
            <h1 className="truncate text-sm font-bold tracking-tight sm:text-base">
              {meeting?.title || 'Vync room'}
            </h1>
            <div className="hidden h-4 w-px bg-white/20 md:block" />
            <p className="hidden font-mono text-xs text-white/50 md:block">
              {meeting?.meetingId || 'meeting-room'}
            </p>
            <div className="hidden h-4 w-px bg-white/20 min-[390px]:block" />
            <p className="font-mono text-xs font-semibold text-white/72">
              {formatMeetingDuration(elapsedSeconds)}
            </p>
          </div>
          {mediaError ? (
            <p className="mt-1 text-xs font-medium text-error">
              {mediaError}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            className="meeting-chrome hidden h-11 w-11 items-center justify-center rounded-full text-white/75 transition hover:bg-white/10 hover:text-white sm:flex"
            onClick={toggleFullscreen}
            type="button"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          {canModerate && waitingParticipants.length ? (
            <button
              className="meeting-chrome min-h-9 rounded-full px-3 py-2 text-xs font-bold text-warning transition hover:bg-warning/20 sm:px-4"
              onClick={() => changePanel('host')}
              type="button"
            >
              <span className="sm:hidden">{waitingParticipants.length}</span>
              <span className="hidden sm:inline">{waitingParticipants.length} waiting</span>
            </button>
          ) : null}
          {isPersonalRecording ? (
            <div className="meeting-chrome hidden animate-pulse-slow items-center gap-2 rounded-full px-4 py-2 text-xs font-bold text-error sm:flex">
              <span className="h-2 w-2 rounded-full bg-error shadow-[0_0_18px_rgba(255,69,58,0.75)]" />
              Personal recording
            </div>
          ) : null}
        </div>
          </Motion.header>
        )}
      </AnimatePresence>

      <div className="absolute inset-0 z-10 flex overflow-hidden">
        <div className="flex-1 relative min-w-0 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]">
          <VideoGrid
            isCameraOn={isCameraOn}
            isScreenSharing={isScreenSharing}
            localSocketId={localSocketId}
            localStream={localStream}
            participants={participants}
            remoteStreams={remoteStreams}
            screenShareStream={screenShareStream}
            screenSharingParticipant={screenSharingParticipant}
          />
          <ControlBar
            activePanel={isSidebarOpen ? activePanel : ''}
            canModerate={canModerate}
            isCameraOn={isCameraOn}
            isHandRaised={isHandRaised}
            isMicOn={isMicOn}
            isRecording={isPersonalRecording}
            isScreenSharing={isScreenSharing}
            isUiVisible={isUiVisible}
            onLeave={handleLeave}
            onPanelChange={changePanel}
            onToggleRecording={handleToggleRecording}
            onToggleCamera={toggleCamera}
            onToggleHand={toggleHand}
            onToggleMic={toggleMic}
            onToggleScreenShare={toggleScreenShare}
            permissions={permissions}
            waitingCount={waitingParticipants.length}
          />
        </div>

        <Motion.div
          animate={
            isOverlaySidebar
              ? {
                  opacity: isSidebarOpen ? 1 : 0,
                  x: isSidebarOpen ? 0 : 28,
                }
              : {
                  width: isSidebarOpen ? sidebarWidth : 0,
                  opacity: isSidebarOpen ? 1 : 0,
                }
          }
          transition={isResizing ? { duration: 0.08, ease: 'linear' } : { duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className={`meeting-panel z-40 overflow-hidden rounded-[1.35rem] ${ 
            isOverlaySidebar
              ? `absolute ${isPhoneViewport ? 'left-2 right-2 top-18 bottom-[5.5rem]' : 'right-3 top-20 w-[min(30rem,calc(100vw-1.5rem))] bottom-24'} m-0 shadow-2xl overflow-y-auto`
              : 'relative m-3 ml-0 shrink-0'
          } ${
            !isSidebarOpen ? 'pointer-events-none -mr-[1px] overflow-hidden border-none' : ''
          }`}
        >
          {isSidebarOpen && !isOverlaySidebar && (
            <div
              aria-label="Resize collaboration panel"
              className="resize-handle absolute bottom-3 left-0 top-3 z-50 -ml-1 w-3 cursor-col-resize touch-none rounded-full"
              data-active={isResizing}
              onPointerDown={handlePointerDownResize}
              role="separator"
            />
          )}
          {isSidebarOpen ? (
            <RightSidebar
              activePanel={activePanel}
              canModerate={canModerate}
              chatMessages={chatMessages}
              codeEditorState={codeEditorState}
              currentUser={currentUser}
              localSocketId={localSocketId}
              meetingId={roomId}
              onAnnounceUploadedFile={announceUploadedFile}
              onChangeSharedFilePage={changeSharedFilePage}
              onCloseSharedFile={closeSharedFile}
              onApproveUser={approveWaitingUser}
              onClose={() => setIsSidebarOpen(false)}
              onEndMeeting={endMeeting}
              onHostStopScreenShare={stopScreenShareForParticipant}
              onMakeCohost={makeCohost}
              onMuteAll={muteAll}
              onSendChatMessage={sendChatMessage}
              onCodeChange={sendCodeChange}
              onCursorPosition={sendCursorPosition}
              onLanguageChange={sendLanguageChange}
              onOpenSharedFile={openSharedFile}
              onMuteParticipant={muteParticipant}
              onRejectUser={rejectWaitingUser}
              onRemoveParticipant={removeParticipant}
              onSendReaction={sendReaction}
              onSendTyping={sendTyping}
              onStopTyping={stopTyping}
              onUpdatePermissions={updatePermissions}
              onWhiteboardClear={sendWhiteboardClear}
              onWhiteboardDraw={sendWhiteboardDraw}
              onWhiteboardUndo={sendWhiteboardUndo}
              participants={participants}
              yDoc={yDoc}
              awareness={awareness}
              permissions={permissions}
              sharedFiles={sharedFiles}
              sharedFileState={sharedFileState}
              typingParticipants={typingParticipants}
              waitingParticipants={waitingParticipants}
              whiteboardEvents={whiteboardEvents}
            />
          ) : null}
        </Motion.div>
      </div>

      {pendingRecording ? (
        <section className="meeting-chrome absolute left-1/2 top-20 z-50 w-[min(42rem,calc(100vw-1rem))] -translate-x-1/2 rounded-[1.35rem] p-3 pr-11 text-white sm:top-24 sm:p-4 sm:pr-12">
          <button
            aria-label="Dismiss recording"
            className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold text-white/70 hover:bg-white/10 hover:text-white"
            onClick={handleDismissRecording}
            type="button"
          >
            x
          </button>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">
                Personal recording ready
              </p>
              <p className="mt-1 truncate text-sm text-white/60">
                {pendingRecording.fileName}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                className="inline-flex min-h-10 items-center justify-center rounded-full border border-white/10 px-3 text-sm font-semibold text-white/80 hover:bg-white/10 hover:text-white"
                href={pendingRecording.url}
                rel="noreferrer"
                target="_blank"
              >
                Preview
              </a>
              <button
                className="inline-flex min-h-10 items-center justify-center rounded-full border border-white/10 px-3 text-sm font-semibold text-white/80 hover:bg-white/10 hover:text-white"
                onClick={handleDownloadRecording}
                type="button"
              >
                Save locally
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {lastReaction ? (
        <div className="fixed bottom-28 left-1/2 z-50 -translate-x-1/2 rounded-full border border-white/10 bg-black/60 px-5 py-3 text-sm font-semibold text-white shadow-2xl backdrop-blur-xl transition-all duration-300">
          {lastReaction.participant?.name || 'Someone'} reacted: <span className="text-xl ml-2">{lastReaction.reaction}</span>
        </div>
      ) : null}

    </section>
  );
}

export default MeetingRoom;
