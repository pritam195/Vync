import { motion as Motion } from 'framer-motion';
import { AlertCircle, Minus, Sparkles } from 'lucide-react';
import { variants } from '../lib/utils/animations.js';

function StateBlock({ action, message, title, tone = 'neutral' }) {
  const toneClass =
    tone === 'error'
      ? 'border-error/25 bg-error/10 text-error'
      : 'border-border/70 bg-card/90 text-card-foreground';
  const Icon = tone === 'error' ? AlertCircle : Sparkles;

  return (
    <Motion.div
      animate="animate"
      className={`ui-card mx-auto max-w-xl p-6 text-center shadow-md sm:p-8 ${toneClass}`}
      exit="exit"
      initial="initial"
      variants={variants.scaleFade}
    >
      <Motion.div
        animate={{ scale: 1, rotate: 0 }}
        className={`mx-auto grid h-12 w-12 place-items-center rounded-2xl shadow-sm ${
          tone === 'error'
            ? 'border border-error/25 bg-error/10 text-error'
            : 'border border-primary/20 bg-primary/10 text-primary'
        }`}
        initial={{ scale: 0.72, rotate: -10 }}
        transition={{ type: 'spring', stiffness: 420, damping: 28 }}
      >
        {tone === 'neutral' ? <Minus className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
      </Motion.div>
      <h2 className="mt-4 text-xl font-semibold tracking-normal text-foreground">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{message}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </Motion.div>
  );
}

export function LoadingState({ message = 'Loading...' }) {
  return (
    <Motion.div
      animate="animate"
      className="ui-card mx-auto grid min-h-64 w-full max-w-xl place-items-center p-6 shadow-md"
      initial="initial"
      variants={variants.scaleFade}
    >
      <div className="text-center">
        <div className="premium-spinner mx-auto" />
        <Motion.p
          animate={{ opacity: [0.55, 1, 0.55] }}
          className="mt-5 text-sm font-semibold text-muted-foreground"
          transition={{ duration: 1.6, ease: 'easeInOut', repeat: Infinity }}
        >
          {message}
        </Motion.p>
      </div>
    </Motion.div>
  );
}

export default StateBlock;
