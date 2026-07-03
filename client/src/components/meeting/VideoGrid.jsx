import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, MonitorUp, Users } from 'lucide-react';
import { AnimatePresence, motion as Motion } from 'framer-motion';
import VideoPlayer from './VideoPlayer.jsx';

const gridPageSize = 6;
const focusRailPageSize = 5;

function getParticipantKey(participant) {
  return participant?.socketId || participant?.userId || 'local';
}

function VideoTileButton({
  children,
  isFocused = false,
  label,
  onClick,
}) {
  return (
    <button
      aria-label={label}
      className={`group/tile relative h-full min-h-0 w-full overflow-hidden rounded-[1rem] text-left outline-none transition duration-200 focus-visible:ring-2 focus-visible:ring-primary sm:rounded-[1.5rem] ${
        isFocused ? 'ring-2 ring-primary ring-offset-2 ring-offset-black/80' : ''
      }`}
      onClick={onClick}
      type="button"
    >
      {children}
      <span className="pointer-events-none absolute right-3 top-3 z-30 grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-black/45 text-white opacity-0 backdrop-blur-md transition group-hover/tile:opacity-100 group-focus-visible/tile:opacity-100">
        {isFocused ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </span>
    </button>
  );
}

function Pager({ currentPage, onPageChange, pageCount, total }) {
  if (pageCount <= 1) {
    return null;
  }

  return (
    <div className="meeting-chrome mx-auto flex items-center gap-2 rounded-full px-2 py-1.5">
      <button
        aria-label="Previous participant page"
        className="collab-icon-button h-9 w-9"
        disabled={currentPage === 0}
        onClick={() => onPageChange(Math.max(currentPage - 1, 0))}
        type="button"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <div className="flex min-w-[8.5rem] items-center justify-center gap-2 px-2 text-xs font-bold text-white">
        <Users className="h-4 w-4 text-primary" />
        {currentPage + 1} / {pageCount}
        <span className="text-white/45">({total})</span>
      </div>
      <button
        aria-label="Next participant page"
        className="collab-icon-button h-9 w-9"
        disabled={currentPage >= pageCount - 1}
        onClick={() => onPageChange(Math.min(currentPage + 1, pageCount - 1))}
        type="button"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function VideoGrid({
  isCameraOn,
  isScreenSharing,
  localSocketId,
  localStream,
  participants,
  remoteStreams,
  screenShareStream,
}) {
  const localParticipant = participants.find(
    (participant) => participant.socketId === localSocketId,
  ) || {
    userId: 'local',
    socketId: localSocketId || 'local',
    name: 'You',
    role: 'participant',
    micOn: true,
    cameraOn: isCameraOn,
    handRaised: false,
    isScreenSharing: false,
  };
  const remoteParticipants = participants.filter(
    (participant) => participant.socketId !== localSocketId,
  );
  const allParticipants = useMemo(
    () => [localParticipant, ...remoteParticipants],
    [localParticipant, remoteParticipants],
  );
  const remotePresenter = !isScreenSharing
    ? participants.find((participant) => participant.isScreenSharing && participant.socketId !== localSocketId)
    : null;
  const spotlightStream = isScreenSharing
    ? screenShareStream
    : remotePresenter
      ? remoteStreams[remotePresenter.socketId]
      : null;
  const spotlightPresenter = isScreenSharing ? localParticipant : remotePresenter;
  const hasScreenShare = Boolean(spotlightStream || isScreenSharing || remotePresenter);
  const [currentPage, setCurrentPage] = useState(0);
  const [focusedParticipantKey, setFocusedParticipantKey] = useState('');
  const focusedParticipant = allParticipants.find(
    (participant) => getParticipantKey(participant) === focusedParticipantKey,
  );
  const isFocusMode = Boolean(focusedParticipant && !hasScreenShare);
  const pageSize = isFocusMode ? focusRailPageSize : gridPageSize;
  const pageCount = Math.max(Math.ceil(allParticipants.length / pageSize), 1);
  const pageStart = currentPage * pageSize;
  const visibleParticipants = allParticipants.slice(pageStart, pageStart + pageSize);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, pageCount - 1));
  }, [pageCount]);

  useEffect(() => {
    if (!focusedParticipantKey) {
      return;
    }

    if (!allParticipants.some((participant) => getParticipantKey(participant) === focusedParticipantKey)) {
      setFocusedParticipantKey('');
    }
  }, [allParticipants, focusedParticipantKey]);

  function getParticipantStream(participant) {
    return participant.socketId === localSocketId
      ? localStream
      : remoteStreams[participant.socketId];
  }

  function getParticipantCameraState(participant) {
    return participant.socketId === localSocketId ? isCameraOn : participant.cameraOn;
  }

  function toggleFocus(participant) {
    const participantKey = getParticipantKey(participant);
    setFocusedParticipantKey((currentKey) => (currentKey === participantKey ? '' : participantKey));
  }

  return (
    <section className="absolute inset-0 z-10 flex flex-col p-2 pb-32 pt-18 transition-all duration-500 sm:p-5 sm:pb-28 sm:pt-24 lg:p-6 lg:pb-28 lg:pt-24 2xl:p-8 2xl:pb-30">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-black/44 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/52 to-transparent" />
      <AnimatePresence mode="popLayout">
        {hasScreenShare ? (
          <Motion.div
            animate={{ opacity: 1, scale: 1 }}
            className="relative mx-auto flex h-full min-h-0 w-full max-w-[118rem] flex-1 flex-col gap-3 xl:flex-row xl:gap-4"
            exit={{ opacity: 0, scale: 0.95 }}
            initial={{ opacity: 0, scale: 0.95 }}
            key="screen-share-layout"
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <Motion.div layout className="relative flex min-h-[15rem] flex-[3] flex-col overflow-hidden rounded-[1.2rem] border border-white/10 bg-black/45 shadow-2xl sm:rounded-[1.65rem]">
              {spotlightStream ? (
                <VideoPlayer
                  className="flex-1 w-full h-full border-0 rounded-none shadow-none"
                  isCameraOn
                  isLocal={isScreenSharing}
                  isScreenShare
                  label={spotlightPresenter?.name || 'Screen share'}
                  participant={spotlightPresenter}
                  stream={spotlightStream}
                />
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center text-center text-white">
                  <div className="flex animate-pulse flex-col items-center">
                    <MonitorUp className="mb-4 h-12 w-12 text-primary/50" />
                    <h2 className="text-xl font-bold">Connecting Screen...</h2>
                  </div>
                </div>
              )}

              <div className="meeting-chrome absolute left-4 top-4 z-20 flex items-center gap-2 rounded-full px-3 py-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
                <p className="text-xs font-bold text-white">
                  {spotlightPresenter
                    ? spotlightPresenter.socketId === localSocketId
                      ? 'You are presenting'
                      : `${spotlightPresenter.name} is presenting`
                    : 'Screen sharing'}
                </p>
              </div>
            </Motion.div>

            <Motion.div layout className="flex min-h-0 flex-1 flex-col gap-3 xl:max-w-[21rem]">
              <div className="meeting-scrollbar flex min-h-0 flex-1 flex-row gap-3 overflow-x-auto pb-2 xl:flex-col xl:overflow-y-auto xl:pb-0">
                {visibleParticipants.map((participant) => {
                  const participantKey = getParticipantKey(participant);

                  return (
                    <Motion.div
                      className="aspect-video w-48 shrink-0 sm:w-56 xl:w-full"
                      key={participantKey}
                      layout
                    >
                      <VideoPlayer
                        className="h-full w-full"
                        isCameraOn={getParticipantCameraState(participant)}
                        isLocal={participant.socketId === localSocketId}
                        label={participant.socketId === localSocketId ? 'You' : participant.name}
                        participant={participant}
                        stream={getParticipantStream(participant)}
                      />
                    </Motion.div>
                  );
                })}
              </div>
              <Pager
                currentPage={currentPage}
                onPageChange={setCurrentPage}
                pageCount={pageCount}
                total={allParticipants.length}
              />
            </Motion.div>
          </Motion.div>
        ) : isFocusMode ? (
          <Motion.div
            animate={{ opacity: 1 }}
            className="mx-auto flex h-full min-h-0 w-full max-w-[118rem] flex-1 flex-col gap-3"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            key="focused-layout"
            transition={{ duration: 0.3 }}
          >
            <Motion.div layout className="min-h-0 flex-1">
              <VideoTileButton
                isFocused
                label={`Collapse ${focusedParticipant.name || 'participant'} video`}
                onClick={() => setFocusedParticipantKey('')}
              >
                <VideoPlayer
                  className="h-full min-h-[18rem] w-full"
                  isCameraOn={getParticipantCameraState(focusedParticipant)}
                  isLocal={focusedParticipant.socketId === localSocketId}
                  label={focusedParticipant.socketId === localSocketId ? 'You' : focusedParticipant.name}
                  participant={focusedParticipant}
                  stream={getParticipantStream(focusedParticipant)}
                />
              </VideoTileButton>
            </Motion.div>

            <div className="flex shrink-0 flex-col gap-3">
              <div className="grid h-[7rem] grid-cols-2 gap-2 sm:h-[8rem] sm:grid-cols-3 lg:grid-cols-5">
                {visibleParticipants.map((participant) => {
                  const participantKey = getParticipantKey(participant);
                  const isFocused = participantKey === focusedParticipantKey;

                  return (
                    <Motion.div key={participantKey} layout className="min-h-0">
                      <VideoTileButton
                        isFocused={isFocused}
                        label={`${isFocused ? 'Collapse' : 'Expand'} ${participant.name || 'participant'} video`}
                        onClick={() => toggleFocus(participant)}
                      >
                        <VideoPlayer
                          className="h-full min-h-0 w-full rounded-[1rem]"
                          isCameraOn={getParticipantCameraState(participant)}
                          isLocal={participant.socketId === localSocketId}
                          label={participant.socketId === localSocketId ? 'You' : participant.name}
                          participant={participant}
                          stream={getParticipantStream(participant)}
                        />
                      </VideoTileButton>
                    </Motion.div>
                  );
                })}
              </div>
              <Pager
                currentPage={currentPage}
                onPageChange={setCurrentPage}
                pageCount={pageCount}
                total={allParticipants.length}
              />
            </div>
          </Motion.div>
        ) : (
          <Motion.div
            animate={{ opacity: 1 }}
            className="flex h-full min-h-0 w-full flex-1 flex-col items-center justify-center gap-3"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            key="grid-layout"
            transition={{ duration: 0.5 }}
          >
            <Motion.div
              className={`grid h-full max-h-[calc(100dvh-16rem)] w-full max-w-[88rem] gap-2 sm:max-h-[calc(100dvh-13rem)] sm:gap-4 ${
                visibleParticipants.length === 1
                  ? 'grid-cols-1'
                  : visibleParticipants.length === 2
                    ? 'grid-cols-1 md:grid-cols-2'
                    : 'grid-cols-2 lg:grid-cols-3'
              }`}
              layout
            >
              <AnimatePresence>
                {visibleParticipants.map((participant) => {
                  const participantKey = getParticipantKey(participant);

                  return (
                    <Motion.div
                      animate={{ opacity: 1, scale: 1 }}
                      className="aspect-video min-h-0"
                      exit={{ opacity: 0, scale: 0.8 }}
                      initial={{ opacity: 0, scale: 0.8 }}
                      key={participantKey}
                      layout
                      transition={{ duration: 0.28, ease: 'easeOut' }}
                    >
                      <VideoTileButton
                        label={`Expand ${participant.name || 'participant'} video`}
                        onClick={() => toggleFocus(participant)}
                      >
                        <VideoPlayer
                          className="h-full min-h-0 w-full"
                          isCameraOn={getParticipantCameraState(participant)}
                          isLocal={participant.socketId === localSocketId}
                          label={participant.socketId === localSocketId ? 'You' : participant.name}
                          participant={participant}
                          stream={getParticipantStream(participant)}
                        />
                      </VideoTileButton>
                    </Motion.div>
                  );
                })}
              </AnimatePresence>
            </Motion.div>
            <Pager
              currentPage={currentPage}
              onPageChange={setCurrentPage}
              pageCount={pageCount}
              total={allParticipants.length}
            />
          </Motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

export default VideoGrid;
