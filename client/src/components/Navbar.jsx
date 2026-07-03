import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { Button } from './ui/Button.jsx';
import { Navigation, NavigationBrand, NavigationLinks, NavigationLink, NavigationActions } from './ui/Navigation.jsx';
import { ArrowRight, LayoutDashboard, LogOut, Menu, Moon, Plus, Sparkles, Sun, User, Video, X } from 'lucide-react';

function Navbar({ variant = 'marketing' }) {
  const { currentUser, isAuthenticated, isGuest, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const location = useLocation();
  const isAppNav = variant === 'app';
  const activeHash = location.hash || '#overview';
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const closeMobileMenu = () => setIsMobileMenuOpen(false);
  const navItems = isAppNav
    ? []
    : [
        { label: 'Overview', href: '/', active: location.pathname === '/' && activeHash === '#overview' },
        { label: 'Features', href: '#features', active: activeHash === '#features' },
        { label: 'Workflow', href: '#how-it-works', active: activeHash === '#how-it-works' },
        { label: 'Pricing', href: '#pricing', active: activeHash === '#pricing' },
      ];

  if (!isAppNav && (isAuthenticated || isGuest)) {
    navItems.push({
      label: 'Dashboard',
      href: '/dashboard',
      active: location.pathname.startsWith('/dashboard'),
    });
  }

  // Show hamburger on mobile for both marketing (nav links) and app nav (actions)
  const showHamburger = navItems.length > 0 || isAppNav;

  return (
    <Navigation className="border-border/60 bg-background/80 shadow-sm backdrop-blur-chrome">
      <NavigationBrand>
        <NavLink
          to={isAppNav && (isAuthenticated || isGuest) ? '/dashboard' : '/'}
          className="group flex min-w-0 items-center gap-2.5 transition-opacity hover:opacity-90"
          onClick={closeMobileMenu}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-glow transition-transform group-hover:scale-105">
            <Video className="w-4 h-4" />
          </div>
          <span className="truncate text-lg font-semibold tracking-normal text-foreground">Vync</span>
        </NavLink>
      </NavigationBrand>
      
      {navItems.length > 0 ? (
        <NavigationLinks className="rounded-full border border-border/60 bg-card/75 px-2 py-1 shadow-sm backdrop-blur-glass lg:px-3 lg:py-1.5">
          {navItems.map((item) => (
            <NavigationLink href={item.href} active={item.active} key={item.label}>
              {item.label}
            </NavigationLink>
          ))}
        </NavigationLinks>
      ) : null}

      <NavigationActions>
        {/* Hamburger — shown on mobile for both marketing and app nav */}
        {showHamburger && (
          <button
            aria-expanded={isMobileMenuOpen}
            aria-label={isMobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border/60 bg-card/75 text-muted-foreground shadow-xs transition-all hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
            onClick={() => setIsMobileMenuOpen((value) => !value)}
            type="button"
          >
            {isMobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        )}

        <button
          onClick={toggleTheme}
          className="mr-0 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border/60 bg-card/75 text-muted-foreground shadow-xs transition-all duration-200 hover:bg-muted hover:text-foreground hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:mr-1"
          aria-label="Toggle theme"
          type="button"
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {isAuthenticated || isGuest ? (
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Button size="sm" onClick={() => window.location.href = '/'} className="hidden rounded-full shadow-sm lg:flex">
              <Plus className="w-4 h-4" /> New meeting
            </Button>
            <div className="mx-1 hidden h-8 w-px bg-border/50 lg:block" />
            <div className="hidden min-w-0 items-center gap-2 rounded-full border border-border/60 bg-card/80 py-1 pl-1 pr-2.5 shadow-xs transition-all duration-200 hover:bg-muted hover:shadow-sm sm:flex">
              <div className="rounded-full bg-primary/20 p-1.5 text-primary">
                <User className="w-3 h-3" />
              </div>
              <span className="text-sm font-medium text-foreground max-w-[100px] truncate">
                {isGuest ? 'Guest' : currentUser.name}
              </span>
              <button onClick={logout} className="ml-1 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-error/10 hover:text-error" title="Sign out">
                <LogOut className="w-3 h-3" />
              </button>
            </div>
            <button
              aria-label="Sign out"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border/60 bg-card/75 text-muted-foreground shadow-xs transition hover:bg-error/10 hover:text-error sm:hidden"
              onClick={logout}
              type="button"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <NavLink to="/login">
              <Button variant="ghost" size="sm" className="hidden rounded-full text-muted-foreground hover:text-foreground sm:inline-flex">Log in</Button>
            </NavLink>
            <NavLink to="/signup">
              <Button size="sm" className="rounded-full">
                <Sparkles className="h-3.5 w-3.5" />
                Sign up
                <ArrowRight className="hidden h-3.5 w-3.5 sm:block" />
              </Button>
            </NavLink>
          </div>
        )}
      </NavigationActions>

      {/* Mobile dropdown menu */}
      {isMobileMenuOpen && (
        <div className="absolute inset-x-3 top-16 z-50 rounded-2xl border border-border/70 bg-surface-raised/95 p-2 shadow-xl backdrop-blur-chrome md:hidden">
          <div className="grid gap-1">
            {/* Marketing nav links */}
            {navItems.map((item) => (
              <a
                className={`flex min-h-11 items-center justify-between rounded-xl px-3 text-sm font-semibold transition ${
                  item.active ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
                href={item.href}
                key={item.label}
                onClick={closeMobileMenu}
              >
                {item.label}
                {item.label === 'Dashboard' ? <LayoutDashboard className="h-4 w-4" /> : null}
              </a>
            ))}

            {/* App-nav specific mobile actions */}
            {isAppNav && (isAuthenticated || isGuest) && (
              <>
                <NavLink
                  to="/"
                  onClick={closeMobileMenu}
                  className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground"
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  New meeting
                </NavLink>
                <div className="mx-3 my-1 h-px bg-border/60" />
                <div className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted-foreground">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
                    <User className="h-3.5 w-3.5" />
                  </div>
                  <span className="min-w-0 flex-1 truncate">{isGuest ? 'Guest' : currentUser?.name}</span>
                </div>
                <button
                  onClick={() => { logout(); closeMobileMenu(); }}
                  className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-error transition hover:bg-error/10"
                  type="button"
                >
                  <LogOut className="h-4 w-4 shrink-0" />
                  Sign out
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </Navigation>
  );
}

export default Navbar;
