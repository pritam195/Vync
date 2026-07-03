import React, { useState, useRef, useEffect, createContext, useContext } from "react";
import { cn } from "../../lib/utils/cn";
import { motion as Motion, AnimatePresence } from "framer-motion";
import { variants } from "../../lib/utils/animations";

const DropdownContext = createContext(null);

export const Dropdown = ({ children, align = "end" }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <DropdownContext.Provider value={{ isOpen, setIsOpen, align }}>
      <div ref={dropdownRef} className="relative inline-block text-left">
        {children}
      </div>
    </DropdownContext.Provider>
  );
};

export const DropdownTrigger = ({ children, asChild = false }) => {
  const { isOpen, setIsOpen } = useContext(DropdownContext);
  
  const child = asChild ? React.Children.only(children) : <button>{children}</button>;
  
  return React.cloneElement(child, {
    onClick: (e) => {
      if (child.props.onClick) child.props.onClick(e);
      setIsOpen(!isOpen);
    },
    onKeyDown: (e) => {
      if (child.props.onKeyDown) child.props.onKeyDown(e);
      if (e.key === "Escape") setIsOpen(false);
      if (e.key === "Enter" || e.key === " ") setIsOpen(!isOpen);
    },
    "aria-expanded": isOpen,
    "aria-haspopup": "true",
  });
};

export const DropdownContent = ({ children, className }) => {
  const { isOpen, align, setIsOpen } = useContext(DropdownContext);

  const alignmentClasses = {
    start: "left-0 origin-top-left",
    end: "right-0 origin-top-right",
    center: "left-1/2 -translate-x-1/2 origin-top",
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <Motion.div
          variants={variants.scaleFade}
          initial="initial"
          animate="animate"
          exit="exit"
          role="menu"
          className={cn(
            "ui-menu absolute z-50 mt-2 w-56 py-1 focus:outline-none",
            alignmentClasses[align],
            className
          )}
          onClick={() => setIsOpen(false)}
        >
          {children}
        </Motion.div>
      )}
    </AnimatePresence>
  );
};

export const DropdownItem = ({ children, className, ...props }) => {
  return (
    <Motion.div
      role="menuitem"
      whileHover={{ x: 2 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "ui-menu-item",
        className
      )}
      {...props}
    >
      {children}
    </Motion.div>
  );
};
