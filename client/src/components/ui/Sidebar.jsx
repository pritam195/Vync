import React from "react";
import { cn } from "../../lib/utils/cn";

export const Sidebar = ({ className, children, ...props }) => {
  return (
    <aside
      className={cn(
        "ui-sidebar sticky top-0",
        className
      )}
      {...props}
    >
      <div className="flex h-full flex-col overflow-y-auto py-4">
        {children}
      </div>
    </aside>
  );
};

export const SidebarSection = ({ title, children, className }) => (
  <div className={cn("px-4 py-2", className)}>
    {title && (
      <h4 className="type-label mb-2 px-2">
        {title}
      </h4>
    )}
    <nav className="flex flex-col space-y-1">{children}</nav>
  </div>
);

export const SidebarItem = ({ icon: Icon, children, active, className, ...props }) => (
  <a
    className={cn(
      "group flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 hover:bg-accent/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      active ? "bg-accent/10 text-foreground" : "text-muted-foreground",
      className
    )}
    {...props}
  >
    {Icon && (
      <Icon
        className={cn(
          "mr-3 h-4 w-4 flex-shrink-0 transition-colors",
          active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
        )}
      />
    )}
    {children}
  </a>
);
