import { Link } from 'react-router-dom';
import { Users, Clock, ArrowRight, CalendarDays } from 'lucide-react';

function MeetingCard({ meeting }) {
  const isUpcoming = meeting.type === 'Upcoming';

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/95 p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-ring/30 hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className={`flex h-2.5 w-2.5 rounded-full ${isUpcoming ? 'bg-primary shadow-glow' : 'bg-success'}`} />
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {meeting.type}
          </p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full border border-border/60 bg-surface px-2.5 py-1 text-xs font-semibold text-foreground shadow-xs">
          <Clock className="h-3 w-3 text-muted-foreground" />
          {meeting.time}
        </span>
      </div>

      <div className="mt-8 flex h-11 w-11 items-center justify-center rounded-2xl border border-border/60 bg-surface text-muted-foreground shadow-xs transition-colors group-hover:text-primary">
        <CalendarDays className="h-5 w-5" />
      </div>

      <h3 className="mt-5 text-lg font-semibold leading-tight tracking-normal text-foreground transition-colors group-hover:text-primary">
        {meeting.title}
      </h3>

      <p className="mt-2 line-clamp-2 flex-grow text-sm leading-6 text-muted-foreground">
        {meeting.description}
      </p>

      <div className="mt-6 flex items-center justify-between gap-3 border-t border-border/50 pt-4">
        <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-surface px-2.5 py-1 text-xs font-semibold text-muted-foreground shadow-xs">
          <Users className="h-3.5 w-3.5" />
          {meeting.participants}
        </div>
        <Link
          to={`/meeting/${meeting.id}`}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border/70 bg-secondary px-3 text-xs font-semibold text-secondary-foreground shadow-xs transition-all duration-200 hover:bg-primary hover:text-primary-foreground"
        >
          Open
          <ArrowRight className="h-3.5 w-3.5 opacity-70 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </article>
  );
}

export default MeetingCard;
