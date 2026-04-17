import { parse } from "date-fns";

/** Parse schedule strings from CSV/sheets into a Date, or null if none match. */
export function parseDate(input: string): Date | null {
  const formats = [
    "yyyy-MM-dd HH:mm",
    "MM/dd/yyyy hh:mm a",
    "MMM dd yyyy hh:mm a",
    "MMM d yyyy hh:mm a",
    "dd MMM yyyy HH:mm",
  ];

  for (const format of formats) {
    try {
      return parse(input, format, new Date());
    } catch {
      // try next format
    }
  }
  return null;
}
