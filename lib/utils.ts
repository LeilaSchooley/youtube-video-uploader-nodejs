import { parse } from "date-fns";

// Date parser utility
export function parseDate(input: string): Date | null {
  const formats = [
    "yyyy-MM-dd HH:mm", // 2023-12-25 14:30
    "MM/dd/yyyy hh:mm a", // 12/25/2023 02:30 PM
    "MMM dd yyyy hh:mm a", // Dec 25 2023 02:30 PM
    "MMM d yyyy hh:mm a", // Dec 25 2023 2:30 PM
    "dd MMM yyyy HH:mm", // 25 Dec 2023 14:30
  ];

  for (const format of formats) {
    try {
      return parse(input, format, new Date());
    } catch (e) {
      // Try next format
    }
  }
  return null;
}




