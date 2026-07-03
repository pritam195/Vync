import React, { useState } from "react";
import { cn } from "../../lib/utils/cn";
import { motion as Motion, AnimatePresence } from "framer-motion";
import { variants } from "../../lib/utils/animations";
import { Eye, EyeOff } from "lucide-react";

export const Input = React.forwardRef(
  ({ className, error, label, labelClassName, type, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === "password";
    const inputType = isPassword ? (showPassword ? "text" : "password") : type;

    return (
      <div className="w-full">
        <div className="relative">
          <input
            className={cn(
              "ui-input peer",
              error && "ui-input-error animate-shake",
              className
            )}
            type={inputType}
            ref={ref}
            placeholder={label || " "}
            {...props}
          />
          {label && (
            <label className={cn("ui-label-floating", labelClassName)}>
              {label}
            </label>
          )}
          {isPassword && (
            <button
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-2.5 top-2.5 inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          )}
        </div>
        <AnimatePresence>
          {error && (
            <Motion.p
              variants={variants.slideUpFade}
              initial="initial"
              animate="animate"
              exit="exit"
              className="mt-1.5 text-xs text-error font-medium"
            >
              {error}
            </Motion.p>
          )}
        </AnimatePresence>
      </div>
    );
  }
);
Input.displayName = "Input";
