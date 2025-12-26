import { format, parseISO } from 'date-fns';

/**
 * Format a date as YYYY-MM-DD
 */
export function formatDiaryDate(date: Date | string): string {
  if (typeof date === 'string') {
    return format(parseISO(date), 'yyyy-MM-dd');
  }
  return format(date, 'yyyy-MM-dd');
}

/**
 * Format a date for display (e.g., "December 25, 2025")
 */
export function formatDisplayDate(date: string): string {
  try {
    return format(parseISO(date), 'MMMM d, yyyy');
  } catch {
    return date;
  }
}

/**
 * Convert a date (YYYY-MM-DD) to diary filename (YYYY-MM-DD_public.md)
 */
export function getDiaryFilename(date: string): string {
  return `${date}_public.md`;
}

/**
 * Extract date (YYYY-MM-DD) from diary filename
 * Returns null if filename doesn't match the pattern
 */
export function parseDiaryFilename(filename: string): string | null {
  const match = filename.match(/^(\d{4}-\d{2}-\d{2})_public\.md$/);
  return match ? match[1] : null;
}

/**
 * Validate if a string is a valid date in YYYY-MM-DD format
 */
export function isValidDateFormat(date: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(date)) {
    return false;
  }

  try {
    const parsedDate = parseISO(date);
    return !isNaN(parsedDate.getTime());
  } catch {
    return false;
  }
}

/**
 * Get today's date in YYYY-MM-DD format
 */
export function getTodayDate(): string {
  return format(new Date(), 'yyyy-MM-dd');
}
