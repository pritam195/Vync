import React from "react";
import { cn } from "../../lib/utils/cn";

export const StatusIndicator = ({ status = "online", className, ping = false, ...props }) => {
  const colors = {
    online: "bg-success",
    offline: "bg-muted-foreground",
    busy: "bg-error",
    away: "bg-warning",
    idle: "bg-warning",
    focus: "bg-primary",
  };

  return (
    <div className={cn("relative flex h-3 w-3", className)} {...props}>
      {ping && status === "online" && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75"></span>
      )}
      <span className={cn("relative inline-flex h-3 w-3 rounded-full border-2 border-background shadow-xs", colors[status])}></span>
    </div>
  );
};
