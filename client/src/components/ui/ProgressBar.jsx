import React from "react";
import { cn } from "../../lib/utils/cn";
import { motion as Motion } from "framer-motion";
import { spring } from "../../lib/utils/animations";

export const ProgressBar = React.forwardRef(
  ({ className, value, max = 100, indeterminate = false, ...props }, ref) => {
    const percentage = indeterminate ? null : Math.min(Math.max((value / max) * 100, 0), 100);

    return (
      <div
        ref={ref}
        className={cn("ui-progress-track", className)}
        {...props}
      >
        {indeterminate ? (
          <Motion.div
            className="ui-progress-fill w-1/3"
            animate={{
              x: ["-100%", "300%"],
            }}
            transition={{
              repeat: Infinity,
              duration: 1.5,
              ease: "linear",
            }}
          />
        ) : (
          <Motion.div
            className="ui-progress-fill"
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={spring}
          />
        )}
      </div>
    );
  }
);
ProgressBar.displayName = "ProgressBar";
