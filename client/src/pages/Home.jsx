import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion as Motion, useInView } from 'framer-motion';
import {
  ArrowRight,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Cloud,
  Command,
  Globe2,
  LockKeyhole,
  MessageSquareText,
  Mic2,
  MonitorUp,
  Play,
  Sparkles,
  Video,
  WandSparkles,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import {
  createMeeting as createMeetingRequest,
  generateMeetingId,
  joinMeeting as joinMeetingRequest,
  normalizeMeetingId,
} from '../services/meetings.js';
import { spring, variants } from '../lib/utils/animations.js';
import { Badge } from '../components/ui/Badge.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Card, CardContent } from '../components/ui/Card.jsx';
import { Dialog, DialogHeader, DialogTitle } from '../components/ui/Dialog.jsx';
import { Input } from '../components/ui/Input.jsx';

const settingOptions = [
  ['waitingRoom', 'Waiting room'],
  ['allowChat', 'Chat'],
  ['allowScreenShare', 'Screen share'],
  ['allowWhiteboard', 'Whiteboard'],
  ['allowFileShare', 'File share'],
  ['allowRecording', 'Recording'],
];

function newMeetingForm(isScheduled = false) {
  return {
    meetingId: generateMeetingId(),
    title: isScheduled ? 'Scheduled meeting' : 'New meeting',
    isScheduled,
    scheduledAt: '',
    settings: {
      waitingRoom: true,
      allowChat: true,
      allowScreenShare: true,
      allowWhiteboard: true,
      allowFileShare: true,
      allowRecording: false,
    },
  };
}

const heroStats = [
  { value: 99.99, suffix: '%', label: 'call reliability', decimals: 2 },
  { value: 38, suffix: 'ms', label: 'median join path' },
  { value: 4, suffix: 'K', label: 'adaptive streams' },
];

const featureCards = [
  {
    icon: Video,
    title: 'Studio-grade meetings',
    copy: 'Adaptive video, spatial audio cues, live presence, and calm controls that stay out of the way until they matter.',
    className: 'lg:col-span-2',
  },
  {
    icon: LockKeyhole,
    title: 'Private by design',
    copy: 'Granular waiting rooms, host permissions, encrypted transport, and confident defaults for every room.',
  },
  {
    icon: MessageSquareText,
    title: 'Context beside the call',
    copy: 'Chat, notes, files, and whiteboard moments stay aligned with the conversation instead of scattered across tabs.',
  },
  {
    icon: MonitorUp,
    title: 'Presentation flow',
    copy: 'Screen share, code review, recordings, and participant controls are tuned for teams who move fast.',
    className: 'lg:col-span-2',
  },
];

const workflow = [
  {
    icon: CalendarClock,
    title: 'Create the room',
    copy: 'Start instantly or schedule ahead with waiting room, chat, recording, files, and whiteboard controls already set.',
  },
  {
    icon: Globe2,
    title: 'Share one link',
    copy: 'Guests join from the browser with a clean preflight experience and no install cliff.',
  },
  {
    icon: WandSparkles,
    title: 'Meet with focus',
    copy: 'The interface adapts to speaking, sharing, recording, and collaborating so attention stays on the work.',
  },
];

const testimonials = [
  {
    quote: 'Vync feels like the meeting room our product team always wanted: fast, quiet, and considered in every tiny interaction.',
    person: 'Maya Chen',
    role: 'VP Product, Northstar Labs',
  },
  {
    quote: 'The difference is restraint. Nothing shouts, everything is exactly where you need it, and our clients notice.',
    person: 'Elliot Graves',
    role: 'Founder, Pixel Harbor',
  },
  {
    quote: 'We moved design reviews, hiring loops, and customer calls into Vync because it feels premium without feeling heavy.',
    person: 'Nadia Ramos',
    role: 'Design Director, Studio Vale',
  },
];

const pricingPlans = [
  {
    name: 'Starter',
    price: '$0',
    description: 'For small teams that want a beautiful meeting room today.',
    features: ['Up to 10 participants', 'Browser-based meetings', 'Chat and screen share', 'Core room controls'],
    variant: 'outline',
  },
  {
    name: 'Pro',
    price: '$12',
    description: 'For teams that run reviews, standups, interviews, and customer calls.',
    features: ['Up to 100 participants', 'Unlimited duration', 'HD recording', 'Advanced host controls'],
    featured: true,
    variant: 'primary',
  },
];

const faqs = [
  {
    q: 'Is Vync free to use?',
    a: 'Yes. The Starter plan includes the core meeting experience for smaller teams, with Pro available when your workflow grows.',
  },
  {
    q: 'Do guests need to install anything?',
    a: 'No. Guests can join from a modern browser with a meeting code or link.',
  },
  {
    q: 'Can I control what participants can do?',
    a: 'Yes. When creating a room you can enable waiting room, chat, screen share, whiteboard, file sharing, and recording.',
  },
  {
    q: 'Is this connected to the actual meeting flow?',
    a: 'Yes. The landing page calls the existing create and join meeting services without changing backend behavior.',
  },
];

function AnimatedStat({ value, suffix, label, decimals = 0 }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    if (!isInView) return undefined;

    let frameId;
    const duration = 900;
    const startedAt = performance.now();

    const tick = (now) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(value * eased);

      if (progress < 1) {
        frameId = requestAnimationFrame(tick);
      }
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [decimals, isInView, value]);

  return (
    <div ref={ref} className="rounded-xl border border-white/50 bg-white/60 p-3.5 text-left shadow-glass backdrop-blur-glass dark:border-white/10 dark:bg-white/10">
      <div className="text-2xl font-semibold tracking-normal text-foreground">
        {displayValue.toFixed(decimals)}
        {suffix}
      </div>
      <p className="mt-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

function Home() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const [joinCode, setJoinCode] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [createForm, setCreateForm] = useState(() => newMeetingForm());
  const [activeFaq, setActiveFaq] = useState(null);

  useEffect(() => {
    if (!location.hash) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const section = document.querySelector(location.hash);
    if (!section) return;

    requestAnimationFrame(() => {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [location.hash]);

  const openCreateModal = (isScheduled = false) => {
    setFormError('');
    setCreateForm(newMeetingForm(isScheduled));
    setIsCreateOpen(true);
  };

  const updateSetting = (setting) => {
    setCreateForm((current) => ({
      ...current,
      settings: { ...current.settings, [setting]: !current.settings[setting] },
    }));
  };

  const submitCreateMeeting = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setFormError('');
    try {
      const meeting = await createMeetingRequest({
        ...createForm,
        hostName: currentUser?.name || 'Guest host',
        scheduledAt: createForm.isScheduled ? createForm.scheduledAt : null,
      });
      showToast({ message: `${meeting.title} is ready.`, title: 'Meeting created', type: 'success' });
      setIsCreateOpen(false);
      navigate(`/meeting/${meeting.meetingId}`);
    } catch (error) {
      setFormError(error.response?.data?.message || 'Could not create the meeting');
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitJoinMeeting = async (event) => {
    event.preventDefault();
    const meetingId = normalizeMeetingId(joinCode);
    if (!meetingId) return;
    setIsSubmitting(true);
    setFormError('');
    try {
      const meeting = await joinMeetingRequest({ meetingId, name: currentUser?.name || 'Guest' });
      navigate(`/meeting/${meeting.meetingId}`);
    } catch (error) {
      setFormError(error.response?.data?.message || 'Could not join the meeting');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative w-full overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-0 h-[44rem] bg-[radial-gradient(ellipse_at_50%_0%,rgb(var(--primary)_/_0.12),transparent_62%)]" />
        <div className="absolute inset-x-0 top-[38rem] h-[64rem] bg-[linear-gradient(180deg,transparent,rgb(var(--accent)_/_0.055),transparent)]" />
      </div>

      <section id="overview" className="content-rail relative grid min-h-[calc(100svh-3.5rem)] scroll-mt-20 items-center gap-8 px-4 pb-12 pt-14 sm:px-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:px-8 lg:pb-16 lg:pt-18 2xl:gap-14">
        <Motion.div
          initial="initial"
          animate="animate"
          variants={{
            initial: { opacity: 1 },
            animate: { opacity: 1, transition: { staggerChildren: 0.08 } },
          }}
          className="max-w-2xl"
        >
          <Motion.div variants={variants.slideUpFade}>
            <Badge className="border-primary/20 bg-primary/10 px-3 py-1 text-primary">
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              Premium meetings for teams that care about taste
            </Badge>
          </Motion.div>

          <Motion.h1 variants={variants.slideUpFade} className="mt-6 text-4xl font-semibold leading-[1.04] tracking-normal text-foreground sm:text-5xl xl:text-6xl 2xl:text-7xl">
            Meetings that feel engineered, not assembled.
          </Motion.h1>

          <Motion.p variants={variants.slideUpFade} className="mt-5 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
            Vync turns video calls into a calm, high-performance workspace with instant rooms, polished collaboration tools, and controls that disappear until you need them.
          </Motion.p>

          <Motion.div variants={variants.slideUpFade} className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Button data-testid="start-meeting-button" className="rounded-full px-5" onClick={() => openCreateModal(false)} size="lg">
              Start a meeting
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" className="rounded-full px-5" onClick={() => openCreateModal(true)} size="lg">
              Schedule for later
              <CalendarClock className="h-4 w-4" />
            </Button>
          </Motion.div>

          <Motion.form
            variants={variants.slideUpFade}
            onSubmit={submitJoinMeeting}
            className="mt-5 flex w-full max-w-xl flex-col gap-2 rounded-xl border border-border/70 bg-card/70 p-2 shadow-glass backdrop-blur-glass sm:flex-row sm:items-center"
          >
            <div className="flex min-h-10 flex-1 items-center gap-3 px-3">
              <Command className="h-4 w-4 text-muted-foreground" />
              <input
                data-testid="join-code-input"
                type="text"
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value)}
                placeholder="Paste a meeting code"
                className="min-h-10 w-full bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Button data-testid="join-room-submit" type="submit" variant="secondary" disabled={isSubmitting} className="rounded-xl">
              {isSubmitting ? 'Joining' : 'Join room'}
            </Button>
          </Motion.form>

          <AnimatePresence>
            {formError && (
              <Motion.p variants={variants.fade} initial="initial" animate="animate" exit="exit" className="mt-4 text-sm font-medium text-error">
                {formError}
              </Motion.p>
            )}
          </AnimatePresence>

          <Motion.div variants={variants.slideUpFade} className="mt-7 grid max-w-xl gap-3 sm:grid-cols-3">
            {heroStats.map((stat) => (
              <AnimatedStat key={stat.label} {...stat} />
            ))}
          </Motion.div>
        </Motion.div>

        <Motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={spring}
          className="relative lg:min-w-0 overflow-hidden"
        >
          <div className="absolute -left-4 top-8 z-10 hidden rounded-xl border border-white/60 bg-white/70 p-3 shadow-glass backdrop-blur-glass dark:border-white/10 dark:bg-white/10 lg:block">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-success/20 text-success">
                <Mic2 className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold">Audio is crisp</p>
                <p className="text-xs text-muted-foreground">Noise shaping active</p>
              </div>
            </div>
          </div>

          <div className="absolute -right-3 bottom-12 z-10 hidden rounded-xl border border-white/60 bg-white/70 p-3 shadow-glass backdrop-blur-glass dark:border-white/10 dark:bg-white/10 md:block">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <CircleDot className="h-3.5 w-3.5 text-error" />
              Live recording
            </div>
            <div className="flex items-end gap-1">
              {[18, 28, 14, 34, 22, 40, 25, 31].map((height, index) => (
                <span key={index} className="w-1.5 rounded-full bg-primary/70" style={{ height }} />
              ))}
            </div>
          </div>

          <div className="relative mx-auto max-w-3xl overflow-hidden rounded-[1.5rem] border border-white/60 bg-white/50 p-2 shadow-xl backdrop-blur-glass dark:border-white/10 dark:bg-white/10">
            <img
              src="/images/landing-hero-meeting.png"
              alt="Premium Vync meeting interface with floating collaboration panels"
              className="aspect-[16/10] w-full rounded-[1rem] object-cover"
            />
            <div className="pointer-events-none absolute inset-2 rounded-[1rem] ring-1 ring-white/45 dark:ring-white/10" />
          </div>
        </Motion.div>
      </section>

      <section id="features" className="scroll-mt-20 px-4 py-14 sm:px-6 sm:py-18 lg:px-8">
        <div className="content-rail">
          <div className="max-w-3xl">
            <Badge variant="secondary">Features</Badge>
            <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-normal sm:text-5xl">
              Every surface is tuned for focus.
            </h2>
            <p className="mt-4 text-base leading-7 text-muted-foreground sm:text-lg">
              Vync combines the immediacy of a browser call with the craft of a native product. No clutter, no visual panic, no disposable-feeling rooms.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {featureCards.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <Motion.div
                  key={feature.title}
                  className={feature.className}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-80px' }}
                  transition={{ ...spring, delay: index * 0.04 }}
                >
                  <Card interactive className="group h-full overflow-hidden border-border/70 bg-card/75 shadow-glass backdrop-blur-glass">
                    <CardContent className="relative flex min-h-60 flex-col justify-between p-6">
                      <div className="absolute right-6 top-6 h-20 w-20 rounded-full bg-primary/10 blur-2xl transition-opacity group-hover:opacity-80" />
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/70 bg-secondary/70 text-primary shadow-xs">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-xl font-semibold tracking-normal">{feature.title}</h3>
                        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">{feature.copy}</p>
                      </div>
                    </CardContent>
                  </Card>
                </Motion.div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-20 px-4 py-14 sm:px-6 sm:py-18 lg:px-8">
        <div className="content-rail rounded-[1.5rem] border border-border/70 bg-surface-raised/70 p-5 shadow-glass backdrop-blur-glass sm:p-8 lg:p-10">
          <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
            <div>
              <Badge variant="outline">How it works</Badge>
              <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-normal sm:text-5xl">
                From idea to room in seconds.
              </h2>
              <p className="mt-4 text-base leading-7 text-muted-foreground sm:text-lg">
                Create a meeting, share the code, and let the product handle the rituals around joining, presenting, and collaborating.
              </p>
              <Button className="mt-6 rounded-full" onClick={() => openCreateModal(false)}>
                Open a room
                <Play className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid gap-4">
              {workflow.map((step, index) => {
                const Icon = step.icon;
                return (
                  <Motion.div
                    key={step.title}
                    initial={{ opacity: 0, x: 18 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ ...spring, delay: index * 0.06 }}
                    className="grid gap-4 rounded-xl border border-border/70 bg-background/60 p-4 shadow-xs sm:grid-cols-[auto_1fr]"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-glow">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Step {index + 1}</div>
                      <h3 className="mt-1 text-xl font-semibold tracking-normal">{step.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.copy}</p>
                    </div>
                  </Motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-14 sm:px-6 sm:py-18 lg:px-8">
        <div className="content-rail">
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <div className="max-w-3xl">
              <Badge variant="secondary">Teams notice the craft</Badge>
              <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-normal sm:text-5xl">
                Built for calls people actually want to join.
              </h2>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-border/70 bg-card/70 px-4 py-2 text-sm font-medium text-muted-foreground shadow-xs">
              <Cloud className="h-4 w-4 text-primary" />
              Browser native
            </div>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {testimonials.map((testimonial, index) => (
              <Motion.figure
                key={testimonial.person}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ ...spring, delay: index * 0.05 }}
                className="rounded-[1.25rem] border border-border/70 bg-card/75 p-6 shadow-glass backdrop-blur-glass"
              >
                <div className="mb-6 flex gap-1 text-primary">
                  {[0, 1, 2, 3, 4].map((star) => (
                    <Sparkles key={star} className="h-4 w-4 fill-current" />
                  ))}
                </div>
                <blockquote className="text-base font-medium leading-7 tracking-normal">"{testimonial.quote}"</blockquote>
                <figcaption className="mt-6 border-t border-border/70 pt-5">
                  <div className="font-semibold">{testimonial.person}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{testimonial.role}</div>
                </figcaption>
              </Motion.figure>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="scroll-mt-20 px-4 py-14 sm:px-6 sm:py-18 lg:px-8">
        <div className="content-rail">
          <div className="mx-auto max-w-3xl text-center">
            <Badge className="px-3 py-1">Pricing</Badge>
            <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-normal sm:text-5xl">
              Premium feel. Simple plans.
            </h2>
            <p className="mt-4 text-base leading-7 text-muted-foreground sm:text-lg">
              Start with the essentials, then unlock longer rooms and richer host controls as your meeting culture matures.
            </p>
          </div>

          <div className="mx-auto mt-10 grid max-w-5xl gap-5 md:grid-cols-2">
            {pricingPlans.map((plan) => (
              <Card key={plan.name} interactive className={`relative overflow-hidden p-2 ${plan.featured ? 'border-primary/40 bg-primary/5 shadow-glow' : 'bg-card/75 shadow-glass'}`}>
                {plan.featured && (
                  <div className="absolute right-6 top-6 rounded-full bg-primary px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary-foreground">
                    Most popular
                  </div>
                )}
                <CardContent className="p-6 sm:p-8">
                  <h3 className="text-2xl font-semibold">{plan.name}</h3>
                  <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">{plan.description}</p>
                  <div className="mt-7 flex items-end gap-2">
                    <span className="text-4xl font-semibold tracking-normal">{plan.price}</span>
                    <span className="pb-2 text-muted-foreground">/ month</span>
                  </div>
                  <ul className="mt-7 grid gap-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-3 text-sm font-medium">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success/10 text-success">
                          <Check className="h-4 w-4" />
                        </span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Button variant={plan.variant} className="mt-8 w-full rounded-full" onClick={() => openCreateModal(false)}>
                    {plan.featured ? 'Start Pro room' : 'Get started'}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="scroll-mt-20 px-4 py-14 sm:px-6 sm:py-18 lg:px-8">
        <div className="content-rail grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <Badge variant="outline">FAQ</Badge>
            <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-normal sm:text-5xl">
              Questions before the first call?
            </h2>
            <p className="mt-4 text-base leading-7 text-muted-foreground sm:text-lg">
              The short version: it is fast, browser-based, and connected to your existing Vync room flow.
            </p>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, index) => (
              <div key={faq.q} className="rounded-2xl border border-border/70 bg-card/70 shadow-xs backdrop-blur-glass">
                <button
                  onClick={() => setActiveFaq(activeFaq === index ? null : index)}
                  className="flex w-full items-center justify-between gap-6 px-5 py-5 text-left text-base font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-6"
                  type="button"
                >
                  {faq.q}
                  <ChevronDown className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 ${activeFaq === index ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {activeFaq === index && (
                    <Motion.div variants={variants.slideDownFade} initial="initial" animate="animate" exit="exit" className="overflow-hidden">
                      <p className="px-5 pb-5 text-sm leading-6 text-muted-foreground sm:px-6">{faq.a}</p>
                    </Motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-border/70 px-4 py-10 sm:px-6 lg:px-8">
        <div className="content-rail flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-glow">
                <Video className="h-5 w-5" />
              </div>
              <span className="text-lg font-semibold">Vync</span>
            </div>
            <p className="mt-3 max-w-md text-sm text-muted-foreground">
              A premium meeting platform for teams who want the room to feel as good as the work.
            </p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm font-medium text-muted-foreground">
            <a className="inline-flex min-h-10 items-center transition hover:text-foreground" href="#features">Features</a>
            <a className="inline-flex min-h-10 items-center transition hover:text-foreground" href="#how-it-works">How it works</a>
            <a className="inline-flex min-h-10 items-center transition hover:text-foreground" href="#pricing">Pricing</a>
            <a className="inline-flex min-h-10 items-center transition hover:text-foreground" href="#faq">FAQ</a>
          </div>
        </div>
      </footer>

      <Dialog isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)}>
        <DialogHeader>
          <DialogTitle>Create a new meeting</DialogTitle>
        </DialogHeader>
        <form className="mt-6 space-y-5" onSubmit={submitCreateMeeting}>
          <div className="space-y-2">
            <label className="type-label">Meeting title</label>
            <Input
              data-testid="create-meeting-title"
              label="Meeting title"
              value={createForm.title}
              onChange={(event) => setCreateForm((current) => ({ ...current, title: event.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <label className="type-label">Meeting code</label>
            <Input
              data-testid="create-meeting-code"
              label="Meeting code"
              value={createForm.meetingId}
              onChange={(event) => setCreateForm((current) => ({ ...current, meetingId: normalizeMeetingId(event.target.value) }))}
              className="font-mono"
            />
          </div>

          <label className="flex items-center justify-between rounded-2xl border border-border bg-secondary/30 p-4 text-sm font-semibold">
            Schedule for later
            <input
              type="checkbox"
              checked={createForm.isScheduled}
              onChange={() => setCreateForm((current) => ({ ...current, isScheduled: !current.isScheduled }))}
              className="h-4 w-4 accent-primary"
            />
          </label>

          <AnimatePresence>
            {createForm.isScheduled && (
              <Motion.div variants={variants.slideDownFade} initial="initial" animate="animate" exit="exit" className="overflow-hidden">
                <div className="pt-1">
                  <Input
                    type="datetime-local"
                    label="Date and time"
                    value={createForm.scheduledAt}
                    onChange={(event) => setCreateForm((current) => ({ ...current, scheduledAt: event.target.value }))}
                  />
                </div>
              </Motion.div>
            )}
          </AnimatePresence>

          <div className="grid gap-2 sm:grid-cols-2">
            {settingOptions.map(([key, label]) => (
              <label key={key} className="flex items-center justify-between rounded-xl border border-border bg-secondary/20 px-3 py-2.5 text-sm font-medium text-muted-foreground">
                {label}
                <input
                  data-testid={`create-setting-${key}`}
                  type="checkbox"
                  checked={createForm.settings[key]}
                  onChange={() => updateSetting(key)}
                  className="h-3.5 w-3.5 accent-primary"
                />
              </label>
            ))}
          </div>

          {formError && <p className="text-sm font-medium text-error">{formError}</p>}

          <Button data-testid="create-meeting-submit" type="submit" className="w-full rounded-full" disabled={isSubmitting}>
            {isSubmitting ? 'Creating...' : 'Create meeting'}
            <CheckCircle2 className="h-4 w-4" />
          </Button>
        </form>
      </Dialog>
    </div>
  );
}

export default Home;
