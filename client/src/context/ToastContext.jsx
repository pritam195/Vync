/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AnimatePresence, motion as Motion } from 'framer-motion';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { spring } from '../lib/utils/animations.js';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismissToast = useCallback((toastId) => {
    setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== toastId));
  }, []);

  const showToast = useCallback(
    ({ message, title = '', type = 'info', duration = 2800 }) => {
      const id = crypto.randomUUID();
      const toast = { id, message, title, type };

      setToasts((currentToasts) => [...currentToasts, toast].slice(-4));
      window.setTimeout(() => dismissToast(id), duration);
      return id;
    },
    [dismissToast],
  );

  const value = useMemo(() => ({ dismissToast, showToast }), [dismissToast, showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed right-4 top-20 z-[70] grid w-[calc(100vw-2rem)] max-w-sm gap-3 sm:right-6">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => {
            const Icon = toast.type === 'error' ? XCircle : toast.type === 'success' ? CheckCircle2 : Info;

            return (
              <Motion.div
                animate={{ opacity: 1, x: 0, scale: 1, filter: 'blur(0px)' }}
                className={`ui-toast ${
                  toast.type === 'error'
                    ? 'error-pulse border-error/30 bg-error/10 text-error'
                    : toast.type === 'success'
                      ? 'success-pulse border-success/30 bg-success/10 text-success'
                      : 'border-border/70 text-foreground'
                }`}
                exit={{ opacity: 0, x: 24, scale: 0.98, filter: 'blur(6px)', transition: { duration: 0.16 } }}
                initial={{ opacity: 0, x: 28, scale: 0.98, filter: 'blur(8px)' }}
                key={toast.id}
                layout
                transition={spring}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <Motion.div
                    animate={{ scale: 1, rotate: 0 }}
                    className="mt-0.5 shrink-0"
                    initial={{ scale: 0.6, rotate: -16 }}
                    transition={spring}
                  >
                    <Icon className="h-5 w-5" />
                  </Motion.div>
                  <div className="min-w-0">
                    {toast.title ? <p className="text-sm font-bold">{toast.title}</p> : null}
                    <p className="text-sm opacity-90">{toast.message}</p>
                  </div>
                </div>
                <Motion.button
                  aria-label="Dismiss notification"
                  className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground opacity-70 transition-colors hover:bg-muted hover:text-foreground hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => dismissToast(toast.id)}
                  type="button"
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.92 }}
                >
                  <X className="h-4 w-4" />
                </Motion.button>
              </Motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast must be used inside a ToastProvider');
  }

  return context;
}
