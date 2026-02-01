import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import {
  parseMarkdownWithFrontmatter,
  serializeMarkdownWithFrontmatter,
  sanitizeFilename,
  generateUniqueFilename,
  migrateAllJsonArchives,
  ArchiveFrontmatter,
} from '@/lib/archiveUtils';

const ARCHIVE_DIR = path.join('D:', 'diary', 'data', 'archive');

export interface ArchiveItem {
  id: string; // filename without .md extension
  title: string;
  content: string;
  createdAt: string;
  originalDate?: string;
}

// Flag to track if migration has run this session
let migrationComplete = false;

// GET - List all archived items
export async function GET(request: NextRequest) {
  try {
    // Ensure archive directory exists
    if (!fs.existsSync(ARCHIVE_DIR)) {
      fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
      return NextResponse.json({ archives: [] });
    }

    // Run migration on first load (converts .json to .md)
    if (!migrationComplete) {
      const migrationResult = migrateAllJsonArchives(ARCHIVE_DIR);
      if (migrationResult.migrated > 0) {
        console.log(`Auto-migrated ${migrationResult.migrated} archive(s) to markdown format`);
      }
      if (migrationResult.errors.length > 0) {
        console.error('Migration errors:', migrationResult.errors);
      }
      migrationComplete = true;
    }

    // Read all markdown archive files
    const files = fs.readdirSync(ARCHIVE_DIR);
    const archives: ArchiveItem[] = [];

    for (const file of files) {
      if (file.endsWith('.md')) {
        const filePath = path.join(ARCHIVE_DIR, file);
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const parsed = parseMarkdownWithFrontmatter(fileContent);

        const id = file.replace(/\.md$/, '');
        archives.push({
          id,
          title: parsed.frontmatter.title,
          content: parsed.content,
          createdAt: parsed.frontmatter.createdAt,
          ...(parsed.frontmatter.originalDate && { originalDate: parsed.frontmatter.originalDate }),
        });
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

    // Generate filename from title
    const baseFilename = sanitizeFilename(title);
    const uniqueFilename = generateUniqueFilename(ARCHIVE_DIR, baseFilename);

    // Create frontmatter
    const frontmatter: ArchiveFrontmatter = {
      title,
      createdAt: new Date().toISOString(),
    };

    if (originalDate) {
      frontmatter.originalDate = originalDate;
    }

    // Serialize and save
    const mdContent = serializeMarkdownWithFrontmatter(frontmatter, content || '');
    const filePath = path.join(ARCHIVE_DIR, uniqueFilename + '.md');
    fs.writeFileSync(filePath, mdContent, 'utf-8');

    const archive: ArchiveItem = {
      id: uniqueFilename,
      title,
      content: content || '',
      createdAt: frontmatter.createdAt,
      ...(originalDate && { originalDate }),
    };

    return NextResponse.json({ success: true, archive });
  } catch (error) {
    console.error('Error creating archive:', error);
    return NextResponse.json(
      { error: 'Failed to create archive' },
      { status: 500 }
    );
  }
}
