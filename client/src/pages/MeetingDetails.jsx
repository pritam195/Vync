import { createElement, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion as Motion } from 'framer-motion';
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  CalendarClock,
  Clock,
  FileText,
  MessageSquareText,
  NotebookPen,
  Users,
  Video,
} from 'lucide-react';
import Button from '../components/Button.jsx';
import { LoadingState } from '../components/StateBlock.jsx';
import { variants } from '../lib/utils/animations.js';
import { absoluteFileUrl } from '../services/files.js';
import { getMeetingHistoryDetail } from '../services/meetings.js';

function formatDate(value) {
  if (!value) return 'Not recorded';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatDuration(totalSeconds = 0) {
  const seconds = Math.max(Number(totalSeconds) || 0, 0);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
}

function EmptyState({ children }) {
  return (
    <div className="empty-panel min-h-36 py-8">
      <p className="text-sm font-medium text-muted-foreground">{children}</p>
    </div>
  );
}

function SectionTitle({ icon, title, description }) {
  return (
    <div className="flex items-start gap-3">
      <div className="icon-tile">
        {createElement(icon, { className: 'h-4 w-4' })}
      </div>
      <div className="min-w-0">
        <h2 className="text-base font-semibold tracking-normal text-foreground">{title}</h2>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
    </div>
  );
}

function MeetingDetails() {
  const { meetingId } = useParams();
  const [meeting, setMeeting] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function loadDetails() {
      try {
        const nextMeeting = await getMeetingHistoryDetail(meetingId);
        if (isMounted) {
          setMeeting(nextMeeting);
        }
      } catch (requestError) {
        if (isMounted) {
          setError(requestError.response?.data?.message || 'Could not load meeting details');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadDetails();

    return () => {
      isMounted = false;
    };
  }, [meetingId]);

  if (isLoading) {
    return <LoadingState message="Loading meeting details..." />;
  }

  if (error || !meeting) {
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
            <p className="text-sm font-semibold uppercase tracking-wider text-error">History unavailable</p>
            <h1 className="mt-2 break-all text-2xl font-semibold tracking-normal text-foreground sm:text-3xl">{meetingId}</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{error}</p>
          </div>
        </div>
        <Button as={Link} className="mt-6 rounded-xl" to="/meetings/history" variant="secondary">
          <ArrowLeft className="h-4 w-4" />
          Back to history
        </Button>
      </Motion.section>
    );
  }

  return (
    <Motion.section animate="animate" className="page-stack" initial="initial" variants={variants.list}>
      <Motion.div className="ui-card p-4 sm:p-6" variants={variants.listItem}>
        <Button as={Link} className="rounded-xl" to="/meetings/history" variant="ghost">
          <ArrowLeft className="h-4 w-4" />
          Back to history
        </Button>
        <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="inline-flex min-h-8 items-center rounded-full border border-primary/20 bg-primary/10 px-3 text-xs font-semibold uppercase tracking-wider text-primary">
              Meeting details
            </p>
            <h1 className="mt-3 break-words text-2xl font-semibold tracking-normal text-foreground sm:text-3xl 2xl:text-4xl">
              {meeting.title}
            </h1>
            <p className="mt-2 break-all font-mono text-sm font-medium text-muted-foreground">
              {meeting.meetingId}
            </p>
          </div>
          <div className="grid w-full gap-3 sm:grid-cols-3 lg:w-auto lg:min-w-[34rem]">
            <div className="metric-tile">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Clock className="h-3.5 w-3.5" /> Duration
              </p>
              <p className="mt-2 font-semibold text-foreground">
                {formatDuration(meeting.durationSeconds)}
              </p>
            </div>
            <div className="metric-tile">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <CalendarClock className="h-3.5 w-3.5" /> Started
              </p>
              <p className="mt-2 text-sm font-semibold text-foreground">
                {formatDate(meeting.startTime)}
              </p>
            </div>
            <div className="metric-tile">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <CalendarClock className="h-3.5 w-3.5" /> Ended
              </p>
              <p className="mt-2 text-sm font-semibold text-foreground">
                {formatDate(meeting.endTime)}
              </p>
            </div>
          </div>
        </div>
      </Motion.div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_21rem] 2xl:grid-cols-[minmax(0,1fr)_24rem] 2xl:gap-6">
        <div className="min-w-0 space-y-5 lg:space-y-6">
          <Motion.section className="ui-card p-5" variants={variants.listItem}>
            <SectionTitle icon={Users} title="Participants" description="People who joined this meeting." />
            <div className="mt-4 grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {(meeting.participants || []).length ? (
                (meeting.participants || []).map((participant) => (
                  <Motion.div
                    className="interactive-row"
                    key={`${participant.userId || participant.guestId || participant.name}-${participant.joinedAt}`}
                    whileHover={{ y: -1 }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-glow">
                        {(participant.name || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-foreground">{participant.name}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Joined {formatDate(participant.joinedAt)}
                        </p>
                      </div>
                    </div>
                  </Motion.div>
                ))
              ) : (
                <div className="sm:col-span-2 2xl:col-span-3">
                  <EmptyState>No participant records were captured.</EmptyState>
                </div>
              )}
            </div>
          </Motion.section>

          <Motion.section className="ui-card p-5" variants={variants.listItem}>
            <SectionTitle icon={MessageSquareText} title="Chat history" description="Messages saved during the room." />
            <div className="mt-4 space-y-3">
              {meeting.chatHistory?.length ? (
                meeting.chatHistory.map((message) => (
                  <Motion.div
                    className="interactive-row"
                    key={message._id}
                    whileHover={{ y: -1 }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-foreground">
                        {message.sender?.name || 'Unknown'}
                      </p>
                      <p className="text-xs font-medium text-muted-foreground">
                        {formatDate(message.createdAt)}
                      </p>
                    </div>
                    <p className="mt-2 break-words text-sm leading-6 text-muted-foreground">
                      {message.message}
                    </p>
                  </Motion.div>
                ))
              ) : (
                <EmptyState>No chat messages were captured.</EmptyState>
              )}
            </div>
          </Motion.section>

          <Motion.section className="ui-card p-5" variants={variants.listItem}>
            <SectionTitle icon={FileText} title="Shared files" description="Resources uploaded to this room." />
            <div className="mt-4 divide-y divide-border/70">
              {meeting.sharedFiles?.length ? (
                meeting.sharedFiles.map((file) => (
                  <a
                    className="grid gap-2 py-3 text-sm transition hover:text-primary lg:grid-cols-[minmax(0,1fr)_auto]"
                    href={absoluteFileUrl(file.fileUrl)}
                    key={file._id}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <span className="break-all font-semibold text-foreground">
                      {file.fileName}
                    </span>
                    <span className="text-muted-foreground lg:text-right">
                      {file.uploadedBy?.name || 'Unknown'} - {formatDate(file.createdAt)}
                    </span>
                  </a>
                ))
              ) : (
                <EmptyState>No files were shared.</EmptyState>
              )}
            </div>
          </Motion.section>
        </div>

        <aside className="space-y-5 lg:space-y-6">
          <Motion.section className="ui-card p-5" variants={variants.listItem}>
            <SectionTitle icon={NotebookPen} title="Notes" description="Decisions and follow-ups." />
            <div className="mt-4 space-y-3">
              {meeting.notes?.length ? (
                meeting.notes.map((note) => (
                  <Motion.div className="interactive-row" key={note._id} whileHover={{ y: -1 }}>
                    <p className="break-words text-sm leading-6 text-foreground">{note.text}</p>
                    <p className="mt-2 text-xs font-medium text-muted-foreground">
                      {note.createdBy?.name || 'Unknown'} - {formatDate(note.createdAt)}
                    </p>
                  </Motion.div>
                ))
              ) : (
                <EmptyState>No notes saved for this meeting.</EmptyState>
              )}
            </div>
          </Motion.section>

          <Motion.section className="ui-card p-5" variants={variants.listItem}>
            <SectionTitle icon={Video} title="Recording" description="Uploaded meeting captures." />
            <div className="mt-4 space-y-3">
              {meeting.recordings?.length ? (
                meeting.recordings.map((recording) => (
                  <a
                    className="interactive-row block text-sm hover:text-primary"
                    href={absoluteFileUrl(recording.fileUrl)}
                    key={recording._id}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <span className="block break-all font-semibold text-foreground">
                      {recording.fileName}
                    </span>
                    <span className="mt-1 block text-muted-foreground">
                      {recording.recordedBy?.name || 'Unknown'} - {formatDate(recording.createdAt)}
                    </span>
                  </a>
                ))
              ) : meeting.recordingUrl ? (
                <a
                  className="ui-button ui-button-outline rounded-xl"
                  href={absoluteFileUrl(meeting.recordingUrl)}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open recording
                </a>
              ) : (
                <EmptyState>No recording was uploaded for this meeting.</EmptyState>
              )}
            </div>
          </Motion.section>

          <Motion.section className="ui-card p-5" variants={variants.listItem}>
            <SectionTitle icon={Activity} title="Activity logs" description="Room events and moderation actions." />
            <div className="mt-4 space-y-3">
              {meeting.activityLogs?.length ? (
                meeting.activityLogs.map((log) => (
                  <div className="rounded-xl border border-border/70 bg-surface/60 p-3 shadow-xs" key={log._id}>
                    <p className="text-sm font-semibold text-foreground">
                      {log.action}
                    </p>
                    <p className="mt-1 text-xs font-medium text-muted-foreground">
                      {log.user?.name || 'System'} - {formatDate(log.timestamp)}
                    </p>
                  </div>
                ))
              ) : (
                <EmptyState>No activity logs captured.</EmptyState>
              )}
            </div>
          </Motion.section>
        </aside>
      </div>
    </Motion.section>
  );
}

export default MeetingDetails;
