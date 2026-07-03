import { AnimatePresence, motion as Motion } from 'framer-motion';
import { X } from 'lucide-react';
import { variants } from '../lib/utils/animations.js';

function Modal({ children, isOpen, onClose, title }) {
  return (
    <AnimatePresence>
      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
          <Motion.div
            animate="animate"
            className="absolute inset-0 bg-background/72 backdrop-blur-md"
            exit="exit"
            initial="initial"
            onClick={onClose}
            variants={variants.fade}
          />
          <Motion.div
            animate="animate"
            className="ui-dialog-panel"
            exit="exit"
            initial="initial"
            variants={variants.scaleFade}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-xl font-bold text-foreground">{title}</h2>
              <button
                aria-label="Close dialog"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={onClose}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-1">{children}</div>
          </Motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

export default Modal;
