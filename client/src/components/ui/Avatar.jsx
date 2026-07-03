import React from "react";
import { cn } from "../../lib/utils/cn";

export const Avatar = React.forwardRef(
  ({ className, src, alt, fallback, size = "md", ...props }, ref) => {
    const [error, setError] = React.useState(false);

    const sizes = {
      sm: "h-8 w-8 text-xs",
      md: "h-10 w-10 text-sm",
      lg: "h-12 w-12 text-base",
      xl: "h-16 w-16 text-lg",
    };

    return (
      <div
        ref={ref}
        className={cn(
          "relative flex shrink-0 overflow-hidden rounded-full border border-border/60 bg-secondary shadow-xs",
          sizes[size],
          className
        )}
        {...props}
      >
        {!error && src ? (
          <img
            src={src}
            alt={alt}
            className="aspect-square h-full w-full object-cover"
            onError={() => setError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-semibold text-secondary-foreground">
            {fallback || (alt ? alt.charAt(0).toUpperCase() : "?")}
          </div>
        )}
      </div>
    );
  }
);
Avatar.displayName = "Avatar";
