import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { LayoutDashboard, Calendar, History, Activity, Settings, ChevronDown, Sparkles } from 'lucide-react';

const items = [
  { label: 'Overview', to: '/dashboard#overview', icon: LayoutDashboard },
  { label: 'Upcoming', to: '/dashboard#upcoming', icon: Calendar },
  { label: 'History', to: '/meetings/history', icon: History },
  { label: 'Activity', to: '/dashboard#activity', icon: Activity },
];

function Sidebar() {
  const { currentUser, isGuest } = useAuth();
  const location = useLocation();
  
  return (
    <aside className="hidden w-full flex-col gap-5 rounded-2xl border border-border/60 bg-card/88 p-3 shadow-sm backdrop-blur-sm lg:sticky lg:top-24 lg:flex lg:self-start">
      <div className="group flex items-center justify-between rounded-xl border border-border/60 bg-surface/70 px-3 py-3 shadow-xs transition-all duration-200 hover:bg-card hover:shadow-sm">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-glow">
            {isGuest ? 'G' : currentUser?.name?.charAt(0) || 'U'}
          </div>
          <div className="flex flex-col truncate">
            <span className="text-sm font-semibold text-foreground truncate">
              {isGuest ? 'Guest Workspace' : `${currentUser?.name}'s Space`}
            </span>
            <span className="text-xs font-medium text-muted-foreground truncate">Personal workspace</span>
          </div>
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-y-0.5" />
      </div>

      <nav className="flex flex-col gap-1">
        <p className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Workspace</p>
        {items.map((item) => (
          <NavLink
            key={item.label}
            to={item.to}
            end={item.to === '/dashboard#overview'}
            className={() => {
              const [path, hash = ''] = item.to.split('#');
              const itemHash = hash ? `#${hash}` : '';
              const isOverview = itemHash === '#overview' && location.pathname === '/dashboard' && (!location.hash || location.hash === '#overview');
              const isHashMatch = itemHash && itemHash !== '#overview' && location.pathname === path && location.hash === itemHash;
              const isPathMatch = !itemHash && location.pathname === item.to;
              const isActive = isOverview || isHashMatch || isPathMatch;

              return `flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200 ${
                isActive
                  ? 'bg-foreground text-background shadow-sm'
                  : 'text-muted-foreground hover:bg-surface hover:text-foreground'
              }`;
            }}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="rounded-2xl border border-border/60 bg-surface/70 p-4 shadow-xs">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Sparkles className="h-4 w-4 text-primary" />
          Focus mode
        </div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Quick access to rooms, history, and activity without extra clutter.
        </p>
      </div>
      
      <div className="mt-auto">
         <NavLink
            to="/settings"
            className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted-foreground transition-all duration-200 hover:bg-surface hover:text-foreground"
          >
            <Settings className="h-4 w-4 shrink-0" />
            Settings
          </NavLink>
      </div>
    </aside>
  );
}

export default Sidebar;
