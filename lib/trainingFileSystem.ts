import fs from 'fs/promises';
import path from 'path';
import { TrainingDayListItem, TrainingDayMeta } from '@/types/training';

const TRAINING_LOG_PATH =
  process.env.TRAINING_LOG_PATH || 'D:\\diary\\data\\training\\log';

const DAY_FILENAME_RE = /^(\d{4}-\d{2}-\d{2})\.md$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validatePath(filePath: string): void {
  const resolved = path.resolve(filePath);
  const root = path.resolve(TRAINING_LOG_PATH);
  if (!resolved.startsWith(root)) {
    throw new Error('Invalid path: Access denied');
  }
}

function validateDate(dateStr: string): void {
  if (!DATE_RE.test(dateStr)) throw new Error('Invalid date format');
}

export async function listTrainingDays(): Promise<TrainingDayMeta[]> {
  try {
    const files = await fs.readdir(TRAINING_LOG_PATH);
    return files
      .map((filename) => {
        const m = DAY_FILENAME_RE.exec(filename);
        if (!m) return null;
        return { dateStr: m[1], filename } as TrainingDayMeta;
      })
      .filter((d): d is TrainingDayMeta => d !== null)
      .sort((a, b) => a.dateStr.localeCompare(b.dateStr)); // oldest first
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    console.error('Error listing training days:', error);
    throw new Error('Failed to list training days');
  }
}

export async function listTrainingDaysWithContent(): Promise<TrainingDayListItem[]> {
  const metas = await listTrainingDays();
  const results = await Promise.all(
    metas.map(async (meta) => {
      const content = await readTrainingDay(meta.dateStr);
      return { ...meta, content };
    }),
  );
  return results;
}

export async function readTrainingDay(dateStr: string): Promise<string> {
  validateDate(dateStr);
  const filePath = path.join(TRAINING_LOG_PATH, `${dateStr}.md`);
  validatePath(filePath);
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('Training day not found');
    }
    throw error;
  }
}

export async function writeTrainingDay(
  dateStr: string,
  content: string,
): Promise<void> {
  validateDate(dateStr);
  const filePath = path.join(TRAINING_LOG_PATH, `${dateStr}.md`);
  validatePath(filePath);
  // Only allow writes to existing files — editor is read-only for missing days
  try {
    await fs.access(filePath);
  } catch {
    throw new Error('Training day not found');
  }
  await fs.writeFile(filePath, content, 'utf-8');
}
