import { Outlet, NavLink } from 'react-router-dom';
import { motion as Motion } from 'framer-motion';
import { CalendarClock, ShieldCheck, Sparkles, Video } from 'lucide-react';
import { spring, variants } from '../lib/utils/animations.js';

const previewParticipants = [
  { initials: 'MC', name: 'Maya' },
  { initials: 'AR', name: 'Arjun' },
  { initials: 'JT', name: 'June' },
];

const highlights = [
  { icon: ShieldCheck, title: 'Secure rooms', copy: 'Host controls and waiting room access.' },
  { icon: CalendarClock, title: 'Meeting history', copy: 'Recordings and past rooms stay organized.' },
  { icon: Sparkles, title: 'Fast setup', copy: 'Start or join meetings without visual noise.' },
];

export default function AuthLayout() {
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-background text-foreground selection:bg-primary/20 selection:text-primary">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(47,125,246,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(47,125,246,0.045)_1px,transparent_1px)] bg-[size:52px_52px]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-surface-raised to-transparent" />

      <div className="relative z-10 grid min-h-screen w-full grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(24rem,0.95fr)] 2xl:grid-cols-[minmax(0,1.15fr)_minmax(28rem,0.85fr)]">
        <section className="hidden min-h-screen border-r border-border/60 px-8 py-8 lg:flex xl:px-12 xl:py-10 2xl:px-16 2xl:py-14">
          <Motion.div
            initial="initial"
            animate="animate"
            variants={{
              initial: { opacity: 1 },
              animate: { opacity: 1, transition: { staggerChildren: 0.08 } },
            }}
            className="flex h-full w-full max-w-4xl flex-col justify-center rounded-[1.5rem] p-4 xl:p-6"
          >
            <Motion.div variants={variants.slideUpFade}>
              <NavLink to="/" className="inline-flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-glow">
                  <Video className="h-5 w-5" />
                </div>
                <span className="text-xl font-semibold tracking-normal">Vync</span>
              </NavLink>
            </Motion.div>

            <Motion.div variants={variants.slideUpFade} className="mt-7">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                Meeting workspace
              </div>
              <h2 className="max-w-2xl text-3xl font-semibold leading-tight tracking-normal xl:text-4xl 2xl:text-5xl">
                Sign in and get back to your room.
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
                A calm entry point for meetings, recordings, shared files, and collaboration history.
              </p>
            </Motion.div>

            <Motion.div variants={variants.slideUpFade} className="mt-7">
              <div className="flex items-center justify-between border-b border-border/70 pb-4">
                <div>
                  <p className="text-sm font-semibold">Product sync</p>
                  <p className="text-xs text-muted-foreground">Ready to join</p>
                </div>
                <div className="flex items-center gap-2 rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success">
                  <span className="h-2 w-2 rounded-full bg-success" />
                  Secure
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3">
                {previewParticipants.map((participant) => (
                  <div key={participant.initials} className="rounded-xl border border-border/70 bg-card/70 p-4 shadow-xs backdrop-blur">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                      {participant.initials}
                    </div>
                    <p className="mt-5 text-sm font-semibold">{participant.name}</p>
                    <p className="text-xs text-muted-foreground">Online</p>
                  </div>
                ))}
              </div>
            </Motion.div>

            <Motion.div variants={variants.slideUpFade} className="mt-5 grid grid-cols-3 gap-3">
              {highlights.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="rounded-xl border border-border/70 bg-card/60 p-3.5 backdrop-blur">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <p className="mt-3 text-sm font-semibold">{item.title}</p>
                    <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{item.copy}</p>
                  </div>
                );
              })}
            </Motion.div>
          </Motion.div>
        </section>

        <section className="flex min-h-screen w-full items-center px-4 py-8 sm:px-8 lg:px-10 xl:px-14 2xl:px-16">
          <div className="mx-auto w-full max-w-[42rem] lg:mx-0">
            <div className="mb-5 lg:hidden">
              <NavLink to="/" className="inline-flex min-h-11 items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-glow">
                  <Video className="h-4 w-4" />
                </div>
                <span className="font-semibold">Vync</span>
              </NavLink>
            </div>

            <Motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
              <Outlet />
            </Motion.div>
          </div>
        </section>
      </div>
    </main>
  );
}
