import { AnimatePresence, motion as Motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { variants } from '../lib/utils/animations.js';

function PageTransition({ children, className = '' }) {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <Motion.div
        animate="animate"
        className={className}
        exit="exit"
        initial="initial"
        key={location.pathname}
        variants={variants.page}
      >
        {children}
      </Motion.div>
    </AnimatePresence>
  );
}

export default PageTransition;
