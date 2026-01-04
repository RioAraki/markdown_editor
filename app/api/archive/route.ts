import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const ARCHIVE_DIR = path.join('D:', 'diary', 'data', 'archive');

export interface ArchiveItem {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  originalDate?: string; // If archived from a diary entry
}

// GET - List all archived items
export async function GET(request: NextRequest) {
  try {
    // Ensure archive directory exists
    if (!fs.existsSync(ARCHIVE_DIR)) {
      fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
      return NextResponse.json({ archives: [] });
    }

    // Read all archive files
    const files = fs.readdirSync(ARCHIVE_DIR);
    const archives: ArchiveItem[] = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(ARCHIVE_DIR, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const archive = JSON.parse(content);
        archives.push(archive);
      }
    }

    // Sort by creation date (newest first)
    archives.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({ archives });
  } catch (error) {
    console.error('Error fetching archives:', error);
    return NextResponse.json(
      { error: 'Failed to fetch archives' },
      { status: 500 }
    );
  }
}

// POST - Create new archive
export async function POST(request: NextRequest) {
  try {
    const { title, content, originalDate } = await request.json();

    if (!title) {
      return NextResponse.json(
        { error: 'Title is required' },
        { status: 400 }
      );
    }

    // Ensure archive directory exists
    if (!fs.existsSync(ARCHIVE_DIR)) {
      fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
    }

    // Create archive item
    const id = Date.now().toString();
    const archive: ArchiveItem = {
      id,
      title,
      content,
      createdAt: new Date().toISOString(),
      ...(originalDate && { originalDate }),
    };

    // Save to file
    const filename = `${id}.json`;
    const filePath = path.join(ARCHIVE_DIR, filename);
    fs.writeFileSync(filePath, JSON.stringify(archive, null, 2), 'utf-8');

    return NextResponse.json({ success: true, archive });
  } catch (error) {
    console.error('Error creating archive:', error);
    return NextResponse.json(
      { error: 'Failed to create archive' },
      { status: 500 }
    );
  }
}
