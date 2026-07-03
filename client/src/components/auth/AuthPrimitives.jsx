import { motion as Motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Sparkles } from 'lucide-react';
import { variants } from '../../lib/utils/animations.js';
import { cn } from '../../lib/utils/cn.js';

export function AuthCard({ children, className = '' }) {
  return (
    <Motion.div
      variants={variants.scaleFade}
      initial="initial"
      animate="animate"
      className={cn(
        'relative w-full',
        className,
      )}
    >
      {children}
    </Motion.div>
  );
}

export function AuthHeader({ eyebrow, title, description, icon: Icon }) {
  return (
    <div className="mb-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary shadow-xs">
          {Icon ? <Icon className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
        </div>
        {eyebrow && <span className="type-label text-primary">{eyebrow}</span>}
      </div>
      <h1 className="text-2xl font-semibold leading-tight tracking-normal text-foreground sm:text-3xl">{title}</h1>
      {description && <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>}
    </div>
  );
}

export function AuthAlert({ children, type = 'error' }) {
  if (!children) return null;

  const Icon = type === 'success' ? CheckCircle2 : AlertCircle;

  return (
    <Motion.div
      variants={variants.slideUpFade}
      initial="initial"
      animate="animate"
      exit="exit"
      className={cn(
        'flex items-start gap-3 rounded-2xl border p-3.5 text-sm font-medium',
        type === 'success'
          ? 'border-success/25 bg-success/10 text-success'
          : 'border-error/25 bg-error/10 text-error animate-shake',
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </Motion.div>
  );
}

export function AuthFooter({ children }) {
  return <p className="auth-footer mt-6 border-t border-border/70 pt-4 text-center text-sm text-muted-foreground">{children}</p>;
}

export function PasswordStrength({ strength, labels, colors }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-secondary/30 p-3.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Password strength</span>
        <span className={cn('text-xs font-semibold', strength < 2 ? 'text-error' : strength < 3 ? 'text-warning' : 'text-success')}>
          {labels[strength]}
        </span>
      </div>
      <div className="flex gap-1.5">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className={cn('h-1.5 w-full rounded-full transition-colors duration-200', index < strength ? colors[strength] : 'bg-muted')} />
        ))}
      </div>
    </div>
  );
}
