import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Utility function to merge tailwind classes safely.
 * Solves the problem of conflicting tailwind classes.
 * @param {...(string|undefined|null|false|{[key: string]: boolean})} inputs
 * @returns {string}
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
