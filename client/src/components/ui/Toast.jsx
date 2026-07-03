import React, { createContext, useContext, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils/cn";
import { motion as Motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { spring } from "../../lib/utils/animations";

const ToastContext = createContext(null);

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((toast) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { ...toast, id }]);
    if (toast.duration !== Infinity) {
      setTimeout(() => removeToast(id), toast.duration || 3000);
    }
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      {typeof window !== "undefined" &&
        createPortal(
          <div className="fixed bottom-0 right-0 z-50 flex w-full max-w-sm flex-col gap-2 p-4 sm:p-6">
            <AnimatePresence>
              {toasts.map((toast) => (
                <Motion.div
                  key={toast.id}
                  layout
                  initial={{ opacity: 0, y: 18, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.16 } }}
                  transition={spring}
                  className={cn(
                    "ui-toast",
                    toast.variant === "error" && "border-error/30 bg-error/10 text-error",
                    toast.variant === "success" && "border-success/30 bg-success/10 text-success",
                    toast.variant === "warning" && "border-warning/30 bg-warning/10 text-warning"
                  )}
                >
                  <div className="grid gap-1">
                    {toast.title && <div className="text-sm font-semibold">{toast.title}</div>}
                    {toast.description && <div className="text-sm opacity-90">{toast.description}</div>}
                  </div>
                  <button
                    onClick={() => removeToast(toast.id)}
                    aria-label="Dismiss notification"
                    className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground opacity-70 transition-colors hover:bg-muted hover:text-foreground hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    type="button"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </Motion.div>
              ))}
            </AnimatePresence>
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
};
