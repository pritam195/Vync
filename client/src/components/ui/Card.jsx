import React from "react";
import { cn } from "../../lib/utils/cn";
import { motion as Motion } from "framer-motion";
import { micro, variants } from "../../lib/utils/animations";

export const Card = React.forwardRef(({ className, interactive = false, children, ...props }, ref) => {
  const Component = interactive ? Motion.div : "div";
  const interactionProps = interactive
    ? {
        layout: true,
        whileHover: micro.hover,
        whileTap: micro.tap,
        transition: micro.transition,
        cursor: "pointer",
      }
    : {};

  return (
    <Component
      ref={ref}
      initial={interactive ? "initial" : undefined}
      animate={interactive ? "animate" : undefined}
      variants={interactive ? variants.listItem : undefined}
      className={cn(
        "ui-card",
        interactive && "ui-card-interactive",
        className
      )}
      {...interactionProps}
      {...props}
    >
      {children}
    </Component>
  );
});
Card.displayName = "Card";

export const CardHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

export const CardTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("type-h4", className)}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

export const CardDescription = React.forwardRef(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("type-body-sm text-muted-foreground", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

export const CardContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

export const CardFooter = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"
