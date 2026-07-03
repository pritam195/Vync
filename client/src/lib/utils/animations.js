/**
 * Framer Motion Design Language for Vync.
 * Smooth spring physics with sub-300ms perceived transitions.
 */

export const spring = {
  type: "spring",
  stiffness: 430,
  damping: 34,
  mass: 0.72,
};

export const smooth = {
  type: "tween",
  ease: [0.16, 1, 0.3, 1],
  duration: 0.22,
};

export const luxe = {
  type: "spring",
  stiffness: 300,
  damping: 30,
  mass: 0.9,
};

export const micro = {
  hover: { scale: 1.018, y: -1.5 },
  tap: { scale: 0.982, y: 0 },
  transition: spring,
};

export const motionTokens = {
  duration: {
    fast: 0.12,
    base: 0.18,
    slow: 0.26,
  },
  ease: [0.16, 1, 0.3, 1],
  spring,
  luxe,
};

export const variants = {
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: smooth },
    exit: { opacity: 0, transition: { ...smooth, duration: 0.12 } },
  },
  slideUpFade: {
    initial: { opacity: 0, y: 10, filter: "blur(6px)" },
    animate: { opacity: 1, y: 0, filter: "blur(0px)", transition: spring },
    exit: { opacity: 0, y: -6, filter: "blur(4px)", transition: smooth },
  },
  scaleFade: {
    initial: { opacity: 0, scale: 0.965, filter: "blur(8px)" },
    animate: { opacity: 1, scale: 1, filter: "blur(0px)", transition: luxe },
    exit: { opacity: 0, scale: 0.975, filter: "blur(5px)", transition: smooth },
  },
  slideDownFade: {
    initial: { opacity: 0, y: -8 },
    animate: { opacity: 1, y: 0, transition: spring },
    exit: { opacity: 0, y: -6, transition: smooth },
  },
  page: {
    initial: { opacity: 0, y: 14, filter: "blur(8px)" },
    animate: { opacity: 1, y: 0, filter: "blur(0px)", transition: luxe },
    exit: { opacity: 0, y: -10, filter: "blur(6px)", transition: { ...smooth, duration: 0.16 } },
  },
  list: {
    animate: {
      transition: {
        staggerChildren: 0.045,
        delayChildren: 0.03,
      },
    },
  },
  listItem: {
    initial: { opacity: 0, y: 10, scale: 0.985 },
    animate: { opacity: 1, y: 0, scale: 1, transition: spring },
    exit: { opacity: 0, y: -6, scale: 0.99, transition: smooth },
  },
};
