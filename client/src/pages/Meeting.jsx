import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import Button from '../components/Button.jsx';
import MeetingRoom from '../components/meeting/MeetingRoom.jsx';
import { LoadingState } from '../components/StateBlock.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { variants } from '../lib/utils/animations.js';
import { getMeeting, joinMeeting } from '../services/meetings.js';

function LocalPreview({ displayName, isCameraOn, isMicOn, stream }) {
  const videoRef = useRef(null);

  // Set srcObject once whenever the stream reference changes.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream || null;
    if (stream) {
      video.play().catch(() => {});
    }
  }, [stream]);

  // When the user re-enables the camera, make sure the video is playing.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream || !isCameraOn) return;
    video.play().catch(() => {});
  }, [isCameraOn, stream]);

  const showVideo = Boolean(stream && isCameraOn);

  return (
    <div className="relative aspect-video overflow-hidden rounded-2xl bg-surface-inverse shadow-xl ring-1 ring-border/20">
      {/*
        Always render the video — conditional rendering unmounts the element,
        losing srcObject so it never re-plays when camera toggles back on.
        visibility:hidden keeps the stream alive (display:none would pause it).
      */}
      <video
        ref={videoRef}
        autoPlay
        className="absolute inset-0 h-full w-full object-cover"
        muted
        playsInline
        style={{ visibility: showVideo ? 'visible' : 'hidden' }}
      />

      {/* Avatar overlay — fades over the video when camera is off */}
      <div
        className="absolute inset-0 grid place-items-center text-center transition-opacity duration-200"
        style={{ opacity: showVideo ? 0 : 1, pointerEvents: showVideo ? 'none' : 'auto' }}
      >
        <div>
          <div className="mx-auto grid h-24 w-24 place-items-center rounded-full bg-primary text-4xl font-bold text-primary-foreground shadow-glow">
            {(displayName || 'M').trim().charAt(0).toUpperCase()}
          </div>
          <p className="mt-4 text-lg font-semibold text-white">{displayName || 'Preview'}</p>
        </div>
      </div>

      {/* Spacer to give the container its aspect-ratio height */}
      <div className="aspect-video" />

      <p className="absolute bottom-3 left-3 rounded-xl bg-black/65 px-3 py-1.5 text-sm font-medium text-white backdrop-blur">
        {isCameraOn ? 'Camera on' : 'Camera off'} - {isMicOn ? 'Mic on' : 'Mic muted'}
      </p>
    </div>
  );
}

function Meeting() {
  const { meetingId } = useParams();
  const { currentUser, joinAsGuest } = useAuth();
  const [meeting, setMeeting] = useState(null);
  const [displayName, setDisplayName] = useState(currentUser?.name || '');
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [hasJoined, setHasJoined] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');
  const [mediaError, setMediaError] = useState('');
  const [mediaStream, setMediaStream] = useState(null);
  const micPreferenceRef = useRef(isMicOn);
  const cameraPreferenceRef = useRef(isCameraOn);

  const enableTracks = useCallback((stream, trackKind, isEnabled) => {
    stream
      ?.getTracks()
      .filter((track) => track.kind === trackKind)
      .forEach((track) => {
        track.enabled = isEnabled;
      });
  }, []);

  const startMedia = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMediaError('Camera access is not supported in this browser');
      return null;
    }

    try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        });
      } catch (err) {
        if (
          err.name === 'NotFoundError' ||
          err.name === 'DevicesNotFoundError' ||
          err.name === 'NotReadableError' ||
          err.name === 'TrackStartError' ||
          err.name === 'AbortError'
        ) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            setIsCameraOn(false);
          } catch {
            try {
              stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
              setIsMicOn(false);
            } catch {
              throw err;
            }
          }
        } else {
          throw err;
        }
      }
      enableTracks(stream, 'audio', micPreferenceRef.current);
      enableTracks(stream, 'video', cameraPreferenceRef.current);
      setMediaStream(stream);
      setMediaError('');
      return stream;
    } catch (requestError) {
      setMediaError(
        requestError.name === 'NotAllowedError'
          ? 'Camera or microphone permission was blocked'
          : 'Camera or microphone is busy in another app or unavailable',
      );
      setIsCameraOn(false);
      setIsMicOn(false);
      return null;
    }
  }, [enableTracks]);

  useEffect(() => {
    let isMounted = true;

    async function loadMeeting() {
      try {
        const nextMeeting = await getMeeting(meetingId);
        if (isMounted) {
          setMeeting(nextMeeting);
        }
      } catch (requestError) {
        if (isMounted) {
          setError(requestError.response?.data?.message || 'Meeting not found');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadMeeting();

    return () => {
      isMounted = false;
    };
  }, [meetingId]);

  useEffect(() => {
    if (currentUser?.name) {
      setDisplayName(currentUser.name);
    }
  }, [currentUser]);

  useEffect(() => {
    micPreferenceRef.current = isMicOn;
  }, [isMicOn]);

  useEffect(() => {
    cameraPreferenceRef.current = isCameraOn;
  }, [isCameraOn]);

  useEffect(() => {
    startMedia();

    return () => {
      setMediaStream((currentStream) => {
        currentStream?.getTracks().forEach((track) => track.stop());
        return null;
      });
    };
  }, [startMedia]);

  useEffect(() => {
    // Once joined, MeetingRoom/useWebRTC owns the stream — don’t interfere.
    if (hasJoined) return;
    enableTracks(mediaStream, 'audio', isMicOn);
  }, [enableTracks, hasJoined, isMicOn, mediaStream]);

  useEffect(() => {
    // Once joined, MeetingRoom/useWebRTC owns the stream — don’t interfere.
    if (hasJoined) return;
    enableTracks(mediaStream, 'video', isCameraOn);
  }, [enableTracks, hasJoined, isCameraOn, mediaStream]);

  const toggleMic = async () => {
    if (!mediaStream && !isMicOn) {
      await startMedia();
    }
    setIsMicOn((currentValue) => !currentValue);
  };

  const toggleCamera = async () => {
    if (!mediaStream && !isCameraOn) {
      await startMedia();
    }
    setIsCameraOn((currentValue) => !currentValue);
  };

  const submitPreJoin = async (event) => {
    event.preventDefault();

    if (!displayName.trim()) {
      setError('Enter your name to join');
      return;
    }

    setIsJoining(true);
    setError('');

    try {
      let guestId = '';
      if (!currentUser) {
        const guestUser = joinAsGuest(displayName);
        guestId = guestUser?.id || '';
      } else if (currentUser?.role === 'guest' || currentUser?.id) {
        guestId = currentUser.role === 'guest' ? currentUser.id : '';
      }

      const nextMeeting = await joinMeeting({
        meetingId,
        name: displayName,
        guestId,
      });
      setMeeting(nextMeeting);
      setHasJoined(true);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not join this meeting');
    } finally {
      setIsJoining(false);
    }
  };

  if (isLoading) {
    return <LoadingState message="Preparing meeting..." />;
  }

  if (error && !meeting) {
    return (
      <Motion.section
        animate="animate"
        className="ui-card mx-auto max-w-2xl p-6 shadow-md sm:p-8"
        initial="initial"
        variants={variants.scaleFade}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-error/25 bg-error/10 text-error">
            <AlertCircle className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-wider text-error">Meeting unavailable</p>
            <h1 className="mt-2 break-all text-2xl font-semibold tracking-normal text-foreground sm:text-3xl">{meetingId}</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{error}</p>
          </div>
        </div>
        <Button as={Link} className="mt-6 rounded-xl" to="/" variant="secondary">
          <ArrowLeft className="h-4 w-4" />
          Back home
        </Button>
      </Motion.section>
    );
  }

  if (hasJoined) {
    return (
      <MeetingRoom
        displayName={displayName}
        initialCameraOn={isCameraOn}
        initialMicOn={isMicOn}
        initialStream={mediaStream}
        meeting={meeting}
      />
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground sm:p-6 lg:p-8">
      <Motion.section
        animate="animate"
        className="grid w-full max-w-6xl gap-5 sm:gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,26rem)] lg:items-center"
        initial="initial"
        variants={variants.list}
      >
        <Motion.div className="overflow-hidden rounded-2xl bg-surface-inverse shadow-xl ring-1 ring-border/20" variants={variants.listItem}>
          <LocalPreview
            displayName={displayName}
            isCameraOn={isCameraOn}
            isMicOn={isMicOn}
            stream={mediaStream}
          />
          <AnimatePresence>
            {mediaError ? (
              <Motion.p
                animate="animate"
                className="border-t border-error/20 bg-error/10 p-4 text-sm font-medium text-error"
                exit="exit"
                initial="initial"
                variants={variants.slideUpFade}
              >
                {mediaError}
              </Motion.p>
            ) : null}
          </AnimatePresence>
        </Motion.div>

        <Motion.form
          className="ui-card p-5 shadow-xl sm:p-6 lg:p-8"
          onSubmit={submitPreJoin}
          variants={variants.listItem}
        >
          <div className="mb-8">
            <p className="text-xs font-bold uppercase tracking-wider text-primary mb-2">
              Ready to join
            </p>
            <h1 className="break-words text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">{meeting.title}</h1>
            <p className="mt-2 inline-block rounded-md bg-accent/50 px-2 py-1 font-mono text-xs text-muted-foreground">
              {meeting.meetingId}
            </p>
          </div>

          <label className="block text-sm font-semibold text-foreground mb-1">
            Your name
          </label>
          <input
            data-testid="prejoin-name-input"
            className="ui-input mb-6 h-12 pb-3 pt-3 placeholder:text-muted-foreground"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Enter your name"
          />

          <div className="mb-8 grid gap-3 sm:grid-cols-2">
            <Button variant={isMicOn ? 'secondary' : 'destructive'} onClick={toggleMic} type="button">
              {isMicOn ? 'Mic on' : 'Mic off'}
            </Button>
            <Button variant={isCameraOn ? 'secondary' : 'destructive'} onClick={toggleCamera} type="button">
              {isCameraOn ? 'Camera on' : 'Camera off'}
            </Button>
          </div>

          <AnimatePresence>
            {error ? (
              <Motion.div
                animate="animate"
                className="error-pulse mb-6 rounded-md border border-error/20 bg-error/10 p-3 text-sm font-medium text-error"
                exit="exit"
                initial="initial"
                variants={variants.slideUpFade}
              >
                {error}
              </Motion.div>
            ) : null}
          </AnimatePresence>

          <Button data-testid="prejoin-submit" className="w-full shadow-glow" disabled={isJoining} isLoading={isJoining} type="submit" size="lg">
            {isJoining ? 'Joining...' : 'Join meeting'}
          </Button>
        </Motion.form>
      </Motion.section>
    </main>
  );
}

export default Meeting;
