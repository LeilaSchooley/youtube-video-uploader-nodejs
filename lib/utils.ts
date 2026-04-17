import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export { parseDate } from "./parse-date";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
