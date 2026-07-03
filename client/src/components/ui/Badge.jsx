import React from "react";
import { cn } from "../../lib/utils/cn";
import { motion as Motion } from "framer-motion";

export const Badge = ({ className, variant = "default", children, ...props }) => {
  const variants = {
    default: "border-primary/20 bg-primary/10 text-primary hover:bg-primary/20",
    secondary: "border-border bg-secondary text-secondary-foreground hover:bg-secondary/80",
    outline: "border-input bg-transparent text-foreground",
    success: "border-success/20 bg-success/10 text-success hover:bg-success/20",
    warning: "border-warning/20 bg-warning/10 text-warning hover:bg-warning/20",
    error: "border-error/20 bg-error/10 text-error hover:bg-error/20",
  };

  return (
    <Motion.div
      className={cn(
        "ui-badge",
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </Motion.div>
  );
};
