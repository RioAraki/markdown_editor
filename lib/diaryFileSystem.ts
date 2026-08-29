import fs from 'fs/promises';
import path from 'path';
import { DiaryEntry } from '@/types/diary';
import {
  parseDiaryFilename,
  getDiaryFilename,
  getDiaryFilenameCandidates,
  isPublicDiaryFilename,
} from './dateUtils';

const DIARY_PATH = process.env.DIARY_DATA_PATH || 'D:\\diary\\data\\diary';

/**
 * Validate that a path is within the allowed diary directory
 * Prevents directory traversal attacks
 */
function validatePath(filePath: string): void {
  const resolved = path.resolve(filePath);
  const diaryPath = path.resolve(DIARY_PATH);

  if (!resolved.startsWith(diaryPath)) {
    throw new Error('Invalid path: Access denied');
  }
}

/**
 * Resolve the file actually backing a date on disk.
 * Entries live either as YYYY-MM-DD_public.md (the shareable form, and the
 * default for new entries) or as a bare YYYY-MM-DD.md. When both exist the
 * `_public` one wins, matching what the public diary site would serve.
 * Returns null when the date has no file at all.
 */
export async function resolveDiaryFilename(date: string): Promise<string | null> {
  for (const filename of getDiaryFilenameCandidates(date)) {
    const filePath = path.join(DIARY_PATH, filename);
    validatePath(filePath);

    try {
      await fs.access(filePath);
      return filename;
    } catch {
      // Not this one — fall through to the next candidate.
    }
  }

  return null;
}

/**
 * List all diary files and return metadata (without content)
 * Returns entries sorted by date (newest first)
 */
export async function listDiaryFiles(): Promise<DiaryEntry[]> {
  try {
    const files = await fs.readdir(DIARY_PATH);

    // A date can be on disk under both filenames; collapse to one entry each,
    // preferring `_public` so the list agrees with resolveDiaryFilename().
    const filenameByDate = new Map<string, string>();
    for (const filename of files) {
      const date = parseDiaryFilename(filename);
      if (!date) continue;

      const current = filenameByDate.get(date);
      if (current && isPublicDiaryFilename(current)) continue;

      filenameByDate.set(date, filename);
    }

    const diaryEntries: DiaryEntry[] = Array.from(filenameByDate.entries())
      .map(([date, filename]) => ({
        date,
        filename,
        exists: true,
      }))
      .sort((a, b) => b.date.localeCompare(a.date)); // Sort newest first

    return diaryEntries;
  } catch (error) {
    console.error('Error listing diary files:', error);
    throw new Error('Failed to list diary files');
  }
}

/**
 * Read the content of a specific diary file
 * Returns the file content as a UTF-8 string
 */
export async function readDiaryFile(date: string): Promise<string> {
  const filename = await resolveDiaryFilename(date);
  if (!filename) {
    throw new Error('Diary entry not found');
  }

  const filePath = path.join(DIARY_PATH, filename);

  validatePath(filePath);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('Diary entry not found');
    }
    console.error('Error reading diary file:', error);
    throw new Error('Failed to read diary file');
  }
}

/**
 * Write content to a diary file
 * Saves back to whichever filename the date already uses, so editing a bare
 * YYYY-MM-DD.md never silently forks it into a second `_public` copy.
 * Creates the file (in the `_public` form) if it doesn't exist.
 * Returns the filename actually written.
 */
export async function writeDiaryFile(date: string, content: string): Promise<string> {
  const filename = (await resolveDiaryFilename(date)) ?? getDiaryFilename(date);
  const filePath = path.join(DIARY_PATH, filename);

  validatePath(filePath);

  try {
    // Ensure the directory exists
    await fs.mkdir(DIARY_PATH, { recursive: true });

    // Write the file with UTF-8 encoding
    await fs.writeFile(filePath, content, 'utf-8');

    return filename;
  } catch (error) {
    console.error('Error writing diary file:', error);
    throw new Error('Failed to write diary file');
  }
}

/**
 * Create a new empty diary file
 * Throws an error if the file already exists
 */
export async function createDiaryFile(date: string): Promise<string> {
  // Either filename counts as existing — creating a `_public` twin for a date
  // that already has a bare entry would split one day across two files.
  if (await resolveDiaryFilename(date)) {
    throw new Error('Diary entry already exists');
  }

  return writeDiaryFile(date, '');
}

/**
 * Check if a diary file exists for a specific date
 */
export async function diaryFileExists(date: string): Promise<boolean> {
  return (await resolveDiaryFilename(date)) !== null;
}

/**
 * Delete a diary file
 */
export async function deleteDiaryFile(date: string): Promise<void> {
  const filename = await resolveDiaryFilename(date);
  if (!filename) {
    throw new Error('Diary entry not found');
  }

  const filePath = path.join(DIARY_PATH, filename);

  validatePath(filePath);

  try {
    await fs.unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('Diary entry not found');
    }
    console.error('Error deleting diary file:', error);
    throw new Error('Failed to delete diary file');
  }
}
