import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils/cn";
import { motion as Motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { variants } from "../../lib/utils/animations";

export const Dialog = ({ isOpen, onClose, children, className }) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (typeof window === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
          <Motion.div
            variants={variants.fade}
            initial="initial"
            animate="animate"
            exit="exit"
            className="fixed inset-0 bg-background/72 backdrop-blur-md"
            onClick={onClose}
          />
          <Motion.div
            variants={variants.scaleFade}
            initial="initial"
            animate="animate"
            exit="exit"
            className={cn(
              "ui-dialog-panel max-h-[calc(100dvh-2rem)] overflow-y-auto",
              className
            )}
          >
            <Motion.button
              whileHover={{ scale: 1.08, rotate: 90 }}
              whileTap={{ scale: 0.92 }}
              onClick={onClose}
              className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground opacity-80 transition-colors hover:bg-muted hover:text-foreground hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              type="button"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </Motion.button>
            {children}
          </Motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export const DialogHeader = ({ className, ...props }) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
);

export const DialogTitle = ({ className, ...props }) => (
  <h2 className={cn("type-h4", className)} {...props} />
);

export const DialogDescription = ({ className, ...props }) => (
  <p className={cn("text-sm text-muted-foreground", className)} {...props} />
);

export const DialogFooter = ({ className, ...props }) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
);
