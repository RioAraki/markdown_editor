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
 * Convert a date (YYYY-MM-DD) to the filename used for *new* entries
 * (YYYY-MM-DD_public.md). Existing entries may also be stored as a bare
 * YYYY-MM-DD.md — use resolveDiaryFilename() to find the real file on disk.
 */
export function getDiaryFilename(date: string): string {
  return `${date}_public.md`;
}

/**
 * Every filename a date may be stored under, in resolution order.
 * `_public.md` wins over the bare form when both exist, since that is the one
 * the public diary site is willing to serve.
 */
export function getDiaryFilenameCandidates(date: string): string[] {
  return [`${date}_public.md`, `${date}.md`];
}

/**
 * True when the filename is the shareable `_public` form. Entries stored as a
 * bare YYYY-MM-DD.md are private: the diary site refuses to serve them, so they
 * are editable here but not publishable.
 */
export function isPublicDiaryFilename(filename: string): boolean {
  return filename.endsWith('_public.md');
}

/**
 * Extract date (YYYY-MM-DD) from diary filename
 * Accepts both YYYY-MM-DD_public.md and YYYY-MM-DD.md
 * Returns null if filename doesn't match either pattern
 */
export function parseDiaryFilename(filename: string): string | null {
  const match = filename.match(/^(\d{4}-\d{2}-\d{2})(?:_public)?\.md$/);
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
