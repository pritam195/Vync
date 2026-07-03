import React, { createContext, useContext, useState } from "react";
import { cn } from "../../lib/utils/cn";
import { motion as Motion } from "framer-motion";
import { spring, smooth } from "../../lib/utils/animations";

const TabsContext = createContext(null);

export const Tabs = ({ defaultValue, className, children, ...props }) => {
  const [activeTab, setActiveTab] = useState(defaultValue);

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div className={cn("w-full", className)} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
};

export const TabsList = ({ className, children, ...props }) => {
  return (
    <div
      className={cn(
        "ui-tab-list",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export const TabsTrigger = ({ value, className, children, ...props }) => {
  const { activeTab, setActiveTab } = useContext(TabsContext);
  const isActive = activeTab === value;

  return (
    <button
      type="button"
      onClick={() => setActiveTab(value)}
      className={cn(
        "ui-tab-trigger",
        isActive ? "text-foreground" : "hover:text-foreground/80",
        className
      )}
      {...props}
    >
      {isActive && (
        <Motion.div
          layoutId="active-tab"
          className="absolute inset-0 rounded-md bg-background shadow-xs"
          transition={spring}
        />
      )}
      <span className="relative z-10">{children}</span>
    </button>
  );
};

export const TabsContent = ({ value, className, children, ...props }) => {
  const { activeTab } = useContext(TabsContext);

  if (activeTab !== value) return null;

  return (
    <Motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 5 }}
      transition={smooth}
      className={cn(
        "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className
      )}
      {...props}
    >
      {children}
    </Motion.div>
  );
};
