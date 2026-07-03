import React from "react";
import { motion as Motion } from "framer-motion";
import { cn } from "../../lib/utils/cn";
import { micro } from "../../lib/utils/animations";
import { Loader2 } from "lucide-react";

export const Button = React.forwardRef(
  ({ className, variant = "primary", size = "md", isLoading = false, children, ...props }, ref) => {
    const baseStyles =
      "ui-button";

    const variants = {
      primary: "ui-button-primary",
      secondary: "ui-button-secondary",
      outline: "ui-button-outline",
      ghost: "ui-button-ghost",
      destructive: "ui-button-destructive",
      social: "border border-border bg-card text-card-foreground shadow-xs hover:bg-muted",
    };

    const sizes = {
      sm: "min-h-9 px-3 text-xs",
      md: "min-h-10 px-4",
      lg: "min-h-12 px-6 text-base",
      icon: "h-10 w-10 min-h-10 px-0",
    };

    return (
      <Motion.button
        ref={ref}
        whileHover={!isLoading && !props.disabled ? micro.hover : {}}
        whileTap={!isLoading && !props.disabled ? micro.tap : {}}
        transition={micro.transition}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        disabled={isLoading || props.disabled}
        {...props}
      >
        {isLoading && (
          <Motion.span
            animate={{ opacity: 1, rotate: 360 }}
            className="inline-flex"
            initial={{ opacity: 0, scale: 0.8 }}
            transition={{ opacity: { duration: 0.16 }, rotate: { duration: 0.8, ease: "linear", repeat: Infinity } }}
          >
            <Loader2 className="h-4 w-4" />
          </Motion.span>
        )}
        <span className={cn("inline-flex items-center gap-2", isLoading && "opacity-90")}>
          {children}
        </span>
      </Motion.button>
    );
  }
);

Button.displayName = "Button";
