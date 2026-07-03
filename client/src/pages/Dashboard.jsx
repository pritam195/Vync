import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Command,
  History,
  Plus,
  Search,
  SlidersHorizontal,
  Users,
  Video,
  Zap,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import DashboardCard from '../components/DashboardCard.jsx';
import MeetingCard from '../components/MeetingCard.jsx';
import Sidebar from '../components/Sidebar.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { getMeetingHistory } from '../services/meetings.js';

const quickActions = [
  { label: 'Start room', detail: 'Open a live meeting', icon: Video, action: 'new' },
  { label: 'Schedule', detail: 'Plan the next session', icon: Calendar, action: 'new' },
  { label: 'History', detail: 'Review past rooms', icon: History, to: '/meetings/history' },
];

const filterOptions = ['All', 'Upcoming', 'Scheduled'];
const activeRoomWindowMs = 2 * 60 * 60 * 1000;

function formatDate(value) {
  if (!value) return 'Not started';

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatTime(value) {
  if (!value) return 'Now';

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
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

function isFutureScheduledMeeting(meeting) {
  return Boolean(
    meeting.isScheduled &&
      meeting.status !== 'ended' &&
      meeting.scheduledAt &&
      new Date(meeting.scheduledAt).getTime() > Date.now(),
  );
}

function isRecentlyLiveMeeting(meeting) {
  const startTime = getMeetingStartTime(meeting);
  return Boolean(
    meeting.status === 'live' &&
      !meeting.endedAt &&
      startTime &&
      Date.now() - new Date(startTime).getTime() <= activeRoomWindowMs,
  );
}

function isDashboardUpcomingMeeting(meeting) {
  return isFutureScheduledMeeting(meeting) || isRecentlyLiveMeeting(meeting);
}

function formatMeetingDuration(meeting) {
  if (meeting.status !== 'ended' && !meeting.endedAt) {
    return 'Open record';
  }

  return formatDuration(meeting.durationSeconds);
}

function formatRelativeTime(value) {
  if (!value) return 'Recently';

  const timestamp = new Date(value).getTime();
  const diffSeconds = Math.round((Date.now() - timestamp) / 1000);
  const absSeconds = Math.abs(diffSeconds);
  const units = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];

  for (const [unit, seconds] of units) {
    if (absSeconds >= seconds) {
      return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(
        -Math.round(diffSeconds / seconds),
        unit,
      );
    }
  }

  return 'Just now';
}

function getCurrentUserId(currentUser) {
  return String(currentUser?._id || currentUser?.id || '');
}

function isHostedByUser(meeting, currentUser) {
  const userId = getCurrentUserId(currentUser);
  return Boolean(userId) && String(meeting.host?.userId || '') === userId;
}

function toDashboardMeeting(meeting) {
  const isScheduled = isFutureScheduledMeeting(meeting);
  const type = isScheduled ? 'Scheduled' : 'Upcoming';
  const dateForTime = meeting.scheduledAt || getMeetingStartTime(meeting);

  return {
    id: meeting.meetingId,
    title: meeting.title || 'Untitled meeting',
    type,
    time: isScheduled ? formatDate(meeting.scheduledAt) : formatTime(dateForTime),
    description: `Hosted by ${meeting.host?.name || 'Unknown'} - ${isScheduled ? 'scheduled room' : 'recent live room'}`,
    participants: meeting.participants?.length || 0,
  };
}

function toRecentMeeting(meeting) {
  return {
    id: meeting.meetingId,
    title: meeting.title || 'Untitled meeting',
    duration: formatMeetingDuration(meeting),
    date: formatDate(getMeetingStartTime(meeting)),
  };
}

function toActivityItem(meeting, currentUser) {
  const hosted = isHostedByUser(meeting, currentUser);
  const action = meeting.isScheduled ? 'Scheduled' : hosted ? 'Hosted' : 'Joined';
  const time = meeting.createdAt || meeting.startedAt || meeting.scheduledAt;

  return {
    id: meeting.meetingId,
    action,
    target: meeting.title || 'Untitled meeting',
    detail: `with ${meeting.participants?.length || 0} participants`,
    time: formatRelativeTime(time),
  };
}

function Panel({ children, className = '', ...props }) {
  return (
    <section
      className={`scroll-mt-28 rounded-2xl border border-border/60 bg-card/88 shadow-sm backdrop-blur-sm ${className}`}
      {...props}
    >
      {children}
    </section>
  );
}

function SectionHeader({ icon, title, description, action }) {
  const HeaderIcon = icon;

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-surface text-muted-foreground shadow-xs">
          <HeaderIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-normal text-foreground">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

function EmptyState({ searchQuery }) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-surface/45 px-6 py-12 text-center shadow-xs">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border/70 bg-card text-muted-foreground shadow-sm">
        <Search className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-foreground">
        {searchQuery ? 'No matching meetings' : 'No upcoming meetings'}
      </h3>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        {searchQuery ? 'Try a different keyword or clear the current filter.' : 'Create a room when you are ready to meet.'}
      </p>
    </div>
  );
}

function Dashboard() {
  const { currentUser, isGuest } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(true);
  const [meetings, setMeetings] = useState([]);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('All');
  const [mobileSectionTab, setMobileSectionTab] = useState('main');

  useEffect(() => {
    let isMounted = true;

    async function loadDashboard() {
      if (isGuest) {
        setMeetings([]);
        setError('');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const nextMeetings = await getMeetingHistory();
        if (isMounted) {
          setMeetings(nextMeetings);
          setError('');
        }
      } catch (requestError) {
        if (isMounted) {
          setError(requestError.response?.data?.message || 'Could not load your dashboard');
          setMeetings([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadDashboard();

    return () => {
      isMounted = false;
    };
  }, [isGuest]);

  useEffect(() => {
    if (!location.hash) return;

    const target = document.getElementById(location.hash.slice(1));
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [location.hash]);

  const upcomingMeetings = useMemo(
    () =>
      meetings
        .filter(isDashboardUpcomingMeeting)
        .map(toDashboardMeeting),
    [meetings],
  );

  const recentMeetings = useMemo(
    () =>
      meetings
        .filter((meeting) => meeting.status === 'ended' || meeting.startedAt || meeting.createdAt)
        .slice(0, 3)
        .map(toRecentMeeting),
    [meetings],
  );

  const activityItems = useMemo(
    () => meetings.slice(0, 4).map((meeting) => toActivityItem(meeting, currentUser)),
    [currentUser, meetings],
  );

  const stats = useMemo(() => {
    const userId = getCurrentUserId(currentUser);
    const hosted = meetings.filter((meeting) => isHostedByUser(meeting, currentUser)).length;
    const joined = meetings.filter((meeting) =>
      meeting.participants?.some((participant) => String(participant.userId || '') === userId),
    ).length;

    return {
      hosted,
      joined,
      upcoming: meetings.filter(isDashboardUpcomingMeeting).length,
    };
  }, [currentUser, meetings]);

  const filteredMeetings = useMemo(() => {
    return upcomingMeetings.filter((meeting) => {
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !query ||
        meeting.title.toLowerCase().includes(query) ||
        meeting.description.toLowerCase().includes(query);
      const matchesFilter = filterType === 'All' || meeting.type === filterType;
      return matchesSearch && matchesFilter;
    });
  }, [filterType, searchQuery, upcomingMeetings]);

  const displayName = isGuest ? 'Guest' : currentUser?.name || 'User';
  const initials = displayName.charAt(0).toUpperCase();

  return (
    <section id="overview" className="app-two-column animate-fade-in scroll-mt-28">
      <Sidebar />

      <div className="min-w-0 space-y-5 lg:space-y-6">
        <Panel className="overflow-hidden p-4 sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              {isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-8 w-72 max-w-full" />
                  <Skeleton className="h-4 w-96 max-w-full" />
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted-foreground">
                    <span className="rounded-full border border-border/70 bg-surface px-2.5 py-1 shadow-xs">Dashboard</span>
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                      Workspace in sync
                    </span>
                  </div>
                  <h1 className="mt-3 text-2xl font-semibold tracking-normal text-foreground sm:text-3xl 2xl:text-4xl">
                    Welcome back, {displayName}
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                    Your meetings, recent rooms, and team activity are organized for a fast start.
                  </p>
                </>
              )}
            </div>

            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center xl:w-auto xl:justify-end">
              {isLoading ? (
                <>
                  <Skeleton className="h-11 w-full rounded-xl sm:w-80" />
                  <Skeleton className="h-11 w-full rounded-xl sm:w-36" />
                </>
              ) : (
                <>
                  <div className="relative w-full sm:min-w-72 xl:w-80 2xl:w-96">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search meetings"
                      className="h-11 w-full rounded-xl border border-border/70 bg-surface/70 pl-10 pr-11 text-sm text-foreground shadow-xs transition-all duration-200 placeholder:text-muted-foreground focus:border-ring/50 focus:bg-card focus:outline-none focus:ring-4 focus:ring-ring/10"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                    />
                    <span className="absolute right-2.5 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded-md border border-border/60 bg-card px-1.5 py-1 text-2xs font-semibold text-muted-foreground shadow-xs sm:flex">
                      <Command className="h-3 w-3" /> K
                    </span>
                  </div>
                  <Button onClick={() => navigate('/')} className="h-11 w-full rounded-xl shadow-glow sm:w-auto">
                    <Plus className="h-4 w-4" />
                    New Meeting
                  </Button>
                </>
              )}
            </div>
          </div>
        </Panel>

        {/* Mobile section tabs — visible only below lg breakpoint */}
        <div className="mobile-section-tabs">
          <button
            type="button"
            data-active={mobileSectionTab === 'main'}
            className="mobile-section-tab"
            onClick={() => setMobileSectionTab('main')}
          >
            Meetings
          </button>
          <button
            type="button"
            data-active={mobileSectionTab === 'sidebar'}
            className="mobile-section-tab"
            onClick={() => setMobileSectionTab('sidebar')}
          >
            Profile &amp; Actions
          </button>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem] 2xl:grid-cols-[minmax(0,1fr)_24rem] 2xl:gap-6">
          <div className={`min-w-0 space-y-5 lg:space-y-6 ${mobileSectionTab === 'sidebar' ? 'hidden xl:block' : ''}`}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {isLoading ? (
                <>
                  <Skeleton className="h-36 rounded-2xl" />
                  <Skeleton className="h-36 rounded-2xl" />
                  <Skeleton className="h-36 rounded-2xl" />
                </>
              ) : (
                <>
                  <DashboardCard icon={Video} label="Meetings Hosted" value={stats.hosted} detail="From your saved meeting history" />
                  <DashboardCard icon={Users} label="Meetings Joined" value={stats.joined} detail="Rooms where you participated" />
                  <DashboardCard icon={Calendar} label="Upcoming Meetings" value={stats.upcoming} detail="Future scheduled or recently live" />
                </>
              )}
            </div>

            {error ? (
              <div className="rounded-2xl border border-error/30 bg-error/10 px-4 py-3 text-sm font-medium text-error shadow-xs">
                {error}
              </div>
            ) : null}

            <Panel id="upcoming" className="p-5 sm:p-6">
              <div className="flex flex-col gap-5 2xl:flex-row 2xl:items-start 2xl:justify-between">
                <SectionHeader
                  icon={Calendar}
                  title="Upcoming meetings"
                  description="A focused view of the next rooms on your calendar."
                />

                {isLoading ? (
                  <Skeleton className="h-10 w-full rounded-xl lg:w-72" />
                ) : (
                  <div className="flex w-full flex-col gap-3 md:flex-row 2xl:w-auto">
                    <div className="grid grid-cols-3 rounded-xl border border-border/70 bg-surface/70 p-1 shadow-xs md:flex">
                      {filterOptions.map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setFilterType(option)}
                          className={`min-h-9 rounded-lg px-3 py-2 text-xs font-semibold transition-all duration-200 md:flex-none ${
                            filterType === option
                              ? 'bg-card text-foreground shadow-xs'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                    <div className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border/70 bg-surface/70 px-3 py-2 text-sm text-muted-foreground shadow-xs md:justify-start">
                      <SlidersHorizontal className="h-4 w-4" />
                      <span>{filteredMeetings.length} visible</span>
                    </div>
                  </div>
                )}
              </div>

              {isLoading ? (
                <div className="mt-6 grid grid-cols-1 gap-4 2xl:grid-cols-2">
                  <Skeleton className="h-56 rounded-2xl" />
                  <Skeleton className="h-56 rounded-2xl" />
                </div>
              ) : filteredMeetings.length > 0 ? (
                <div className="mt-6 grid grid-cols-1 gap-4 2xl:grid-cols-2">
                  {filteredMeetings.map((meeting) => (
                    <MeetingCard key={meeting.id} meeting={meeting} />
                  ))}
                </div>
              ) : (
                <div className="mt-6">
                  <EmptyState searchQuery={searchQuery} />
                </div>
              )}
            </Panel>

            <Panel id="recent" className="overflow-hidden">
              <div className="border-b border-border/60 p-5 sm:p-6">
                <SectionHeader
                  icon={Clock}
                  title="Recent meetings"
                  description="Rooms you have been in lately."
                  action={
                    <Link
                      to="/meetings/history"
                      className="hidden items-center rounded-lg px-2 py-1 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:flex"
                    >
                      View all <ChevronRight className="ml-1 h-4 w-4" />
                    </Link>
                  }
                />
              </div>

              {isLoading ? (
                <div className="space-y-3 p-5 sm:p-6">
                  <Skeleton className="h-16 rounded-xl" />
                  <Skeleton className="h-16 rounded-xl" />
                  <Skeleton className="h-16 rounded-xl" />
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {!isLoading && !error && recentMeetings.length === 0 ? (
                    <div className="p-6 text-sm text-muted-foreground">
                      No recent meetings yet.
                    </div>
                  ) : null}
                  {recentMeetings.map((item) => (
                    <Link
                      key={item.id}
                      to={`/meetings/history/${item.id}`}
                    className="group grid gap-3 p-4 transition-all duration-200 hover:bg-surface/70 sm:px-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-surface text-muted-foreground shadow-xs transition-colors group-hover:text-primary">
                          <Video className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">{item.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{item.date}</p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center justify-between gap-3 md:justify-end">
                        <span className="rounded-lg border border-border/60 bg-surface px-2.5 py-1 text-xs font-semibold text-muted-foreground shadow-xs">
                          {item.duration}
                        </span>
                        <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          <aside className={`space-y-6 ${mobileSectionTab === 'main' ? 'hidden xl:block' : ''}`}>
            <Panel id="profile" className="p-5 sm:p-6">
              {isLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-12 w-12 rounded-2xl" />
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-56" />
                </div>
              ) : (
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-lg font-semibold text-primary-foreground shadow-glow">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate text-base font-semibold text-foreground">{displayName}</h2>
                      <span className="rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-2xs font-semibold uppercase text-success">
                        Active
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {isGuest ? 'Guest workspace' : currentUser?.email || 'Personal workspace'}
                    </p>
                  </div>
                </div>
              )}
            </Panel>

            <Panel id="quick-actions" className="p-5 sm:p-6">
              <SectionHeader icon={Zap} title="Quick actions" description="Common workflows, one click away." />
              {isLoading ? (
                <div className="mt-5 space-y-3">
                  <Skeleton className="h-14 rounded-xl" />
                  <Skeleton className="h-14 rounded-xl" />
                  <Skeleton className="h-14 rounded-xl" />
                </div>
              ) : (
                <div className="mt-5 space-y-2">
                  {quickActions.map((item) => {
                    const content = (
                      <>
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-card text-muted-foreground shadow-xs transition-colors group-hover:text-primary">
                          <item.icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-foreground">{item.label}</span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.detail}</span>
                        </span>
                        <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                      </>
                    );

                    return item.to ? (
                      <Link
                        key={item.label}
                        to={item.to}
                        className="group flex w-full items-center gap-3 rounded-xl border border-transparent p-2 text-left transition-all duration-200 hover:border-border/70 hover:bg-surface hover:shadow-xs"
                      >
                        {content}
                      </Link>
                    ) : (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => navigate('/')}
                        className="group flex w-full items-center gap-3 rounded-xl border border-transparent p-2 text-left transition-all duration-200 hover:border-border/70 hover:bg-surface hover:shadow-xs"
                      >
                        {content}
                      </button>
                    );
                  })}
                </div>
              )}
            </Panel>

            <Panel id="activity" className="p-5 sm:p-6">
              <SectionHeader icon={Activity} title="Activity timeline" description="A quiet trail of recent workspace changes." />
              {isLoading ? (
                <div className="mt-6 space-y-6">
                  <div className="flex gap-3"><Skeleton className="mt-2 h-2 w-2 shrink-0 rounded-full" /><Skeleton className="h-10 w-full rounded-xl" /></div>
                  <div className="flex gap-3"><Skeleton className="mt-2 h-2 w-2 shrink-0 rounded-full" /><Skeleton className="h-10 w-full rounded-xl" /></div>
                  <div className="flex gap-3"><Skeleton className="mt-2 h-2 w-2 shrink-0 rounded-full" /><Skeleton className="h-10 w-full rounded-xl" /></div>
                </div>
              ) : (
                <div className="relative mt-6 space-y-5 pl-5">
                  <div className="absolute left-1.5 top-2 bottom-2 w-px bg-border/80" />
                  {!isLoading && !error && activityItems.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/80 bg-surface/45 p-4 text-sm text-muted-foreground">
                      Activity will appear after you create or join meetings.
                    </div>
                  ) : null}
                  {activityItems.map((item) => (
                    <div key={item.id} className="group relative">
                      <div className="absolute -left-[18px] top-1.5 h-3 w-3 rounded-full border-2 border-card bg-primary shadow-xs ring-4 ring-primary/10" />
                      <p className="text-sm leading-5 text-foreground">
                        <span className="font-semibold">{item.action}</span> {item.target}{' '}
                        <span className="text-muted-foreground">{item.detail}</span>
                      </p>
                      <p className="mt-1 text-xs font-medium text-muted-foreground">{item.time}</p>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </aside>
        </div>
      </div>
    </section>
  );
}

export default Dashboard;
