import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarClock, History, Search } from 'lucide-react';
import Sidebar from '../components/Sidebar.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { getMeetingHistory } from '../services/meetings.js';

function formatDate(value) {
  if (!value) return 'Not started';

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatDuration(totalSeconds = 0) {
  const seconds = Math.max(Number(totalSeconds) || 0, 0);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m`;
  return `${seconds}s`;
}

function getMeetingStartTime(meeting) {
  return meeting.startedAt || meeting.createdAt || meeting.scheduledAt;
}

function getMeetingDurationLabel(meeting) {
  if (meeting.status !== 'ended' && !meeting.endedAt) {
    return 'Open record';
  }

  return formatDuration(meeting.durationSeconds);
}

function getMeetingStatusLabel(meeting) {
  if (meeting.status === 'ended' || meeting.endedAt) return 'Ended';
  if (meeting.isScheduled) return 'Scheduled';
  return 'Open';
}

function EmptyHistory() {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-surface/45 px-6 py-12 text-center shadow-xs">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border/70 bg-card text-muted-foreground shadow-sm">
        <History className="h-5 w-5" />
      </div>
      <h2 className="mt-4 text-sm font-semibold text-foreground">No meeting history yet</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Meetings will appear here after you create or join rooms.
      </p>
    </div>
  );
}

function MeetingHistory() {
  const [meetings, setMeetings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function loadHistory() {
      try {
        const nextMeetings = await getMeetingHistory();
        if (isMounted) {
          setMeetings(nextMeetings);
          setError('');
        }
      } catch (requestError) {
        if (isMounted) {
          setError(requestError.response?.data?.message || 'Could not load meeting history');
          setMeetings([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadHistory();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredMeetings = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return meetings;

    return meetings.filter((meeting) => {
      return (
        meeting.title?.toLowerCase().includes(query) ||
        meeting.meetingId?.toLowerCase().includes(query) ||
        meeting.host?.name?.toLowerCase().includes(query)
      );
    });
  }, [meetings, searchQuery]);

  return (
    <section className="app-two-column animate-fade-in">
      <Sidebar />

      <div className="min-w-0 space-y-5 lg:space-y-6">
        <section className="rounded-2xl border border-border/60 bg-card/88 p-5 shadow-sm backdrop-blur-sm sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted-foreground">
                <span className="rounded-full border border-border/70 bg-surface px-2.5 py-1 shadow-xs">
                  Meeting history
                </span>
              </div>
              <h1 className="mt-3 text-2xl font-semibold tracking-normal text-foreground sm:text-3xl 2xl:text-4xl">
                Past meetings
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Review saved rooms, participants, and completed meeting records.
              </p>
            </div>

            <div className="relative w-full lg:w-80 2xl:w-96">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search history"
                className="h-11 w-full rounded-xl border border-border/70 bg-surface/70 pl-10 pr-4 text-sm text-foreground shadow-xs transition-all duration-200 placeholder:text-muted-foreground focus:border-ring/50 focus:bg-card focus:outline-none focus:ring-4 focus:ring-ring/10"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-error/30 bg-error/10 px-4 py-3 text-sm font-medium text-error shadow-xs">
            {error}
          </div>
        ) : null}

        <section className="overflow-hidden rounded-2xl border border-border/60 bg-card/88 shadow-sm backdrop-blur-sm">
          <div className="border-b border-border/60 p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-surface text-muted-foreground shadow-xs">
                <CalendarClock className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-semibold tracking-normal text-foreground">Meeting records</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {isLoading ? 'Loading your saved rooms.' : `${filteredMeetings.length} records visible`}
                </p>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-3 p-5 sm:p-6">
              <Skeleton className="h-20 rounded-xl" />
              <Skeleton className="h-20 rounded-xl" />
              <Skeleton className="h-20 rounded-xl" />
            </div>
          ) : null}

          {!isLoading && !error && filteredMeetings.length === 0 ? (
            <div className="p-5 sm:p-6">
              <EmptyHistory />
            </div>
          ) : null}

          <div className="divide-y divide-border/60">
            {filteredMeetings.map((meeting) => (
              <article
                className="grid gap-4 p-5 transition-colors duration-200 hover:bg-surface/70 sm:px-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                key={meeting.meetingId}
                data-testid="meeting-history-row"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="max-w-full truncate text-base font-semibold text-foreground">
                      {meeting.title || 'Untitled meeting'}
                    </h3>
                    <span className="shrink-0 rounded-lg border border-border/60 bg-surface px-2.5 py-1 font-mono text-xs font-semibold text-muted-foreground shadow-xs max-w-[12rem] truncate">
                      {meeting.meetingId}
                    </span>
                    <span className="shrink-0 rounded-full border border-border/60 bg-surface px-2.5 py-1 text-2xs font-semibold uppercase text-muted-foreground shadow-xs">
                      {getMeetingStatusLabel(meeting)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Hosted by {meeting.host?.name || 'Unknown'} - {meeting.participants?.length || 0}{' '}
                    participants - {getMeetingDurationLabel(meeting)}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatDate(getMeetingStartTime(meeting))}
                  </p>
                </div>
                <Link
                  to={`/meetings/history/${meeting.meetingId}`}
                  className="group inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border/70 bg-secondary px-4 text-sm font-semibold text-secondary-foreground shadow-xs transition-all duration-200 hover:bg-primary hover:text-primary-foreground md:w-auto"
                >
                  View details
                  <ArrowRight className="h-4 w-4 opacity-70 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

export default MeetingHistory;
