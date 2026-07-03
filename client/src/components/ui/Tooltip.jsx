import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils/cn";
import { motion as Motion, AnimatePresence } from "framer-motion";
import { variants } from "../../lib/utils/animations";

export const Tooltip = ({ children, content, position = "top", className }) => {
  const [isVisible, setIsVisible] = useState(false);
  const triggerRef = useRef(null);
  const [coords, setCoords] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (isVisible && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const offset = 8;
      
      let x = rect.left + rect.width / 2;
      let y = rect.top;

      if (position === "top") y = rect.top - offset;
      if (position === "bottom") y = rect.bottom + offset;
      if (position === "left") {
        x = rect.left - offset;
        y = rect.top + rect.height / 2;
      }
      if (position === "right") {
        x = rect.right + offset;
        y = rect.top + rect.height / 2;
      }

      setCoords({ x, y });
    }
  }, [isVisible, position]);

  const handleMouseEnter = () => setIsVisible(true);
  const handleMouseLeave = () => setIsVisible(false);

  return (
    <>
      <div
        ref={triggerRef}
        onFocus={() => setIsVisible(true)}
        onBlur={() => setIsVisible(false)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="inline-block"
      >
        {children}
      </div>
      {createPortal(
        <AnimatePresence>
          {isVisible && (
            <div
              style={{
                position: "fixed",
                left: coords.x,
                top: coords.y,
                pointerEvents: "none",
                zIndex: 50,
              }}
              className="flex items-center justify-center -translate-x-1/2 -translate-y-full"
            >
              <Motion.div
                variants={variants.scaleFade}
                initial="initial"
                animate="animate"
                exit="exit"
                role="tooltip"
                className={cn(
                  "ui-tooltip whitespace-nowrap",
                  className
                )}
                style={{
                  transform:
                    position === "top" ? "translate(0, 0)" :
                    position === "bottom" ? "translate(0, calc(100% + 16px))" :
                    position === "left" ? "translate(calc(-50% - 16px), 50%)" :
                    "translate(calc(50% + 16px), 50%)"
                }}
              >
                {content}
              </Motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
};
