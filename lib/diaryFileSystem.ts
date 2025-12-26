import fs from 'fs/promises';
import path from 'path';
import { DiaryEntry } from '@/types/diary';
import { parseDiaryFilename, getDiaryFilename } from './dateUtils';

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
 * List all diary files and return metadata (without content)
 * Returns entries sorted by date (newest first)
 */
export async function listDiaryFiles(): Promise<DiaryEntry[]> {
  try {
    const files = await fs.readdir(DIARY_PATH);

    const diaryEntries: DiaryEntry[] = files
      .filter(file => file.endsWith('_public.md'))
      .map(filename => {
        const date = parseDiaryFilename(filename);
        if (!date) return null;

        return {
          date,
          filename,
          exists: true,
        };
      })
      .filter((entry): entry is DiaryEntry => entry !== null)
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
  const filename = getDiaryFilename(date);
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
 * Creates the file if it doesn't exist
 */
export async function writeDiaryFile(date: string, content: string): Promise<void> {
  const filename = getDiaryFilename(date);
  const filePath = path.join(DIARY_PATH, filename);

  validatePath(filePath);

  try {
    // Ensure the directory exists
    await fs.mkdir(DIARY_PATH, { recursive: true });

    // Write the file with UTF-8 encoding
    await fs.writeFile(filePath, content, 'utf-8');
  } catch (error) {
    console.error('Error writing diary file:', error);
    throw new Error('Failed to write diary file');
  }
}

/**
 * Create a new empty diary file
 * Throws an error if the file already exists
 */
export async function createDiaryFile(date: string): Promise<void> {
  const filename = getDiaryFilename(date);
  const filePath = path.join(DIARY_PATH, filename);

  validatePath(filePath);

  try {
    // Check if file already exists
    await fs.access(filePath);
    throw new Error('Diary entry already exists');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // File doesn't exist, create it
      await writeDiaryFile(date, '');
      return;
    }
    throw error;
  }
}

/**
 * Check if a diary file exists for a specific date
 */
export async function diaryFileExists(date: string): Promise<boolean> {
  const filename = getDiaryFilename(date);
  const filePath = path.join(DIARY_PATH, filename);

  validatePath(filePath);

  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete a diary file
 */
export async function deleteDiaryFile(date: string): Promise<void> {
  const filename = getDiaryFilename(date);
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
