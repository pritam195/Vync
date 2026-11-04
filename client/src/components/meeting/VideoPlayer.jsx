import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion as Motion } from 'framer-motion';
import { Hand, MicOff, VideoOff, Volume2 } from 'lucide-react';

function VideoPlayer({
  className = '',
  isCameraOn,
  isLocal = false,
  isScreenShare = false,
  label,
  participant,
  stream,
}) {
  const videoRef = useRef(null);
  const initials = (participant?.name || label || 'U')
    .split(' ')
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream || null;
    if (stream) {
      video.play().catch(() => {});
    }
  }, [stream]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream || !isCameraOn) return;
    video.play().catch(() => {});
  }, [isCameraOn, stream]);

  useEffect(() => {
    if (!stream || !participant?.micOn || isScreenShare || stream.getAudioTracks().length === 0) {
      setIsSpeaking(false);
      return;
    }

    let audioContext;
    let analyser;
    let frameId;

    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(stream);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const levels = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteFrequencyData(levels);
        const average = levels.reduce((sum, level) => sum + level, 0) / levels.length;
        setIsSpeaking(average > 10);
        frameId = requestAnimationFrame(tick);
      };

      tick();
    } catch {
      setIsSpeaking(false);
      if (audioContext?.state !== 'closed') {
        audioContext?.close().catch(() => {});
      }
    }

    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      if (audioContext?.state !== 'closed') {
        audioContext?.close().catch(() => {});
      }
    };
  }, [participant?.micOn, isScreenShare, stream]);

  const showVideo = isScreenShare ? Boolean(stream) : Boolean(stream && isCameraOn);

  return (
    <Motion.article
      layout
      className={`video-tile group relative h-full min-h-[8.5rem] w-full overflow-hidden rounded-[1rem] transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] sm:min-h-[160px] sm:rounded-[1.5rem] ${
        isSpeaking
          ? 'active-speaker-ring scale-[1.012]'
          : 'ring-1 ring-white/10'
      } ${className}`}
    >
      <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-b from-black/5 via-transparent to-black/34 opacity-80" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-28 bg-gradient-to-t from-black/42 to-transparent" />
      <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(circle_at_50%_18%,rgba(255,255,255,0.08),transparent_32%)] opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
      <video
        autoPlay
        className={`absolute inset-0 h-full w-full transition-all duration-700 ${
          isScreenShare ? 'object-contain' : 'object-cover'
        }`}
        muted={isLocal}
        playsInline
        ref={videoRef}
        style={{ opacity: showVideo ? 1 : 0, visibility: showVideo ? 'visible' : 'hidden' }}
      />

      {!showVideo && !isScreenShare && (
        <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_50%_35%,rgba(47,125,246,0.24),transparent_34%),radial-gradient(circle_at_28%_78%,rgba(20,184,170,0.14),transparent_32%),linear-gradient(145deg,rgba(15,23,42,0.98),rgba(2,6,23,1))]">
          <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:36px_36px]" />
          <VideoOff className="absolute right-5 top-5 h-5 w-5 text-white/30" />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary via-sky-400 to-accent text-xl font-bold text-white shadow-2xl ring-8 ring-white/10 sm:h-24 sm:w-24 sm:text-3xl">
            {initials}
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute left-4 right-4 top-4 z-20 flex items-start justify-between gap-3">
        <AnimatePresence>
          {isSpeaking ? (
            <Motion.div
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ duration: 0.22 }}
              className="flex items-center gap-2 rounded-full border border-success/30 bg-success/20 px-3 py-1.5 text-xs font-bold text-success shadow-[0_0_28px_rgba(52,211,153,0.18)] backdrop-blur-md"
            >
              <Volume2 className="h-3.5 w-3.5" />
              Speaking
            </Motion.div>
          ) : (
            <span />
          )}
        </AnimatePresence>
        {isScreenShare ? (
          <div className="rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-xs font-bold text-white/80 backdrop-blur-md">
            Shared screen
          </div>
        ) : null}
      </div>

      <div className={`pointer-events-none absolute bottom-3 left-3 right-3 z-20 flex items-end justify-between gap-2 transition-all duration-300 sm:bottom-4 sm:left-4 sm:right-4 sm:gap-3 ${isSpeaking || participant?.handRaised || !participant?.micOn ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-80 group-hover:translate-y-0 group-hover:opacity-100'}`}>
        <div className="meeting-chrome pointer-events-auto flex min-w-0 max-w-full items-center gap-1.5 rounded-full px-3 py-1.5 sm:gap-2 sm:px-4 sm:py-2">
          <p className="truncate text-sm font-semibold text-white">
            {participant?.name || label}
          </p>
          <p className="shrink-0 text-xs text-white/50">
            {isLocal ? '(You)' : ''}
          </p>
        </div>

        <div className="pointer-events-auto flex shrink-0 flex-col gap-2">
          {participant && !participant.micOn && !isScreenShare && (
            <div className="meeting-chrome flex h-8 w-8 items-center justify-center rounded-full text-error shadow-lg">
              <MicOff className="h-4 w-4" />
            </div>
          )}
          {participant?.handRaised && (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-warning text-warning-foreground shadow-lg ring-4 ring-warning/15">
              <Hand className="h-4 w-4" />
            </div>
          )}
        </div>
      </div>
    </Motion.article>
  );
}

export default VideoPlayer;
