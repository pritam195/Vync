import React from "react";
import { cn } from "../../lib/utils/cn";
import { motion as Motion } from "framer-motion";

export const Skeleton = ({ className, ...props }) => {
  return (
    <Motion.div
      animate={{ opacity: 1 }}
      className={cn("ui-skeleton", className)}
      initial={{ opacity: 0.65 }}
      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      {...props}
    />
  );
};
