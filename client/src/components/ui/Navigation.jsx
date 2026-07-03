import React from "react";
import { cn } from "../../lib/utils/cn";
import { motion as Motion } from "framer-motion";
import { spring } from "../../lib/utils/animations";

export const Navigation = ({ className, children, ...props }) => {
  return (
    <Motion.header
      initial={{ y: -18, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={spring}
      className={cn(
        "fixed left-0 top-0 z-40 w-full border-b bg-background/78 backdrop-blur-glass",
        className
      )}
      {...props}
    >
      <div className="relative mx-auto flex h-14 w-full max-w-[112rem] items-center px-4 sm:px-5 md:px-6 2xl:px-8">
        {children}
      </div>
    </Motion.header>
  );
};

export const NavigationBrand = ({ children, className }) => (
  <div className={cn("mr-3 flex min-w-0 items-center gap-2 text-lg font-semibold tracking-normal sm:mr-5", className)}>
    {children}
  </div>
);

export const NavigationLinks = ({ children, className }) => (
  <nav className={cn("hidden min-w-0 items-center gap-3 text-sm font-medium md:flex xl:gap-5", className)}>
    {children}
  </nav>
);

export const NavigationLink = ({ children, href, active, className, ...props }) => (
  <Motion.a
    href={href}
    whileHover={{ y: -1 }}
    whileTap={{ y: 0, scale: 0.98 }}
    transition={spring}
    className={cn(
      "relative inline-flex min-h-9 items-center rounded-md px-1.5 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      active ? "text-foreground" : "text-muted-foreground",
      className
    )}
    {...props}
  >
    {children}
    {active && (
      <Motion.div
        layoutId="nav-active-indicator"
        className="absolute -bottom-[18px] left-0 right-0 h-0.5 rounded-full bg-primary shadow-glow"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={spring}
      />
    )}
  </Motion.a>
);

export const NavigationActions = ({ children, className }) => (
  <div className={cn("ml-auto flex min-w-0 items-center gap-2 sm:gap-3", className)}>
    {children}
  </div>
);
