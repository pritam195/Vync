import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { CalendarPlus, History, LayoutDashboard } from 'lucide-react';
import Navbar from './Navbar.jsx';
import PageTransition from './PageTransition.jsx';

const bottomItems = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
  { label: 'New', to: '/', icon: CalendarPlus },
  { label: 'History', to: '/meetings/history', icon: History },
];

function AppLayout() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-300">
      <Navbar variant="app" />
      <main className="page-shell pb-28 pt-18 sm:pb-10 sm:pt-22 lg:pt-26">
        <PageTransition>
          <Outlet />
        </PageTransition>
      </main>
      <nav className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 px-3 pt-2 shadow-lg backdrop-blur-chrome lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-3 gap-1.5 sm:gap-2">
          {bottomItems.map((item) => {
            const Icon = item.icon;
            const active =
              item.to === '/'
                ? location.pathname === '/'
                : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);

            return (
              <NavLink
                className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-2 text-center text-xs font-semibold leading-4 transition-all ${
                  active
                    ? 'bg-foreground text-background shadow-sm'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
                key={item.label}
                to={item.to}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export default AppLayout;
