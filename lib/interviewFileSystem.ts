import fs from 'fs/promises';
import path from 'path';
import { InterviewDayListItem, InterviewDayMeta } from '@/types/interview';

const INTERVIEW_LOG_PATH =
  process.env.INTERVIEW_LOG_PATH || 'D:\\diary\\data\\interview\\log';

const DAY_FILENAME_RE = /^(\d{4}-\d{2}-\d{2})\.md$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validatePath(filePath: string): void {
  const resolved = path.resolve(filePath);
  const root = path.resolve(INTERVIEW_LOG_PATH);
  if (!resolved.startsWith(root)) {
    throw new Error('Invalid path: Access denied');
  }
}

function validateDate(dateStr: string): void {
  if (!DATE_RE.test(dateStr)) throw new Error('Invalid date format');
}

export async function listInterviewDays(): Promise<InterviewDayMeta[]> {
  try {
    const files = await fs.readdir(INTERVIEW_LOG_PATH);
    return files
      .map((filename) => {
        const m = DAY_FILENAME_RE.exec(filename);
        if (!m) return null;
        return { dateStr: m[1], filename } as InterviewDayMeta;
      })
      .filter((d): d is InterviewDayMeta => d !== null)
      .sort((a, b) => a.dateStr.localeCompare(b.dateStr)); // oldest first
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    console.error('Error listing interview days:', error);
    throw new Error('Failed to list interview days');
  }
}

export async function listInterviewDaysWithContent(): Promise<
  InterviewDayListItem[]
> {
  const metas = await listInterviewDays();
  return Promise.all(
    metas.map(async (meta) => ({
      ...meta,
      content: await readInterviewDay(meta.dateStr),
    })),
  );
}

export async function readInterviewDay(dateStr: string): Promise<string> {
  validateDate(dateStr);
  const filePath = path.join(INTERVIEW_LOG_PATH, `${dateStr}.md`);
  validatePath(filePath);
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('Interview day not found');
    }
    throw error;
  }
}

export async function writeInterviewDay(
  dateStr: string,
  content: string,
): Promise<void> {
  validateDate(dateStr);
  const filePath = path.join(INTERVIEW_LOG_PATH, `${dateStr}.md`);
  validatePath(filePath);
  // Only allow writes to existing files — creation goes through createInterviewDay
  try {
    await fs.access(filePath);
  } catch {
    throw new Error('Interview day not found');
  }
  await fs.writeFile(filePath, content, 'utf-8');
}

export async function createInterviewDay(
  dateStr: string,
  content: string,
): Promise<void> {
  validateDate(dateStr);
  const filePath = path.join(INTERVIEW_LOG_PATH, `${dateStr}.md`);
  validatePath(filePath);
  let exists = false;
  try {
    await fs.access(filePath);
    exists = true;
  } catch {
    exists = false;
  }
  if (exists) throw new Error('Interview day already exists');
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
}
