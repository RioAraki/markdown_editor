import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import {
  parseMarkdownWithFrontmatter,
  serializeMarkdownWithFrontmatter,
  sanitizeFilename,
  generateUniqueFilename,
  ArchiveFrontmatter,
} from '@/lib/archiveUtils';
import { ArchiveItem } from '../route';

const ARCHIVE_DIR = path.join('D:', 'diary', 'data', 'archive');

// GET - Get specific archive
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const filePath = path.join(ARCHIVE_DIR, `${id}.md`);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: 'Archive not found' },
        { status: 404 }
      );
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const parsed = parseMarkdownWithFrontmatter(fileContent);

    const archive: ArchiveItem = {
      id,
      title: parsed.frontmatter.title,
      content: parsed.content,
      createdAt: parsed.frontmatter.createdAt,
      ...(parsed.frontmatter.originalDate && { originalDate: parsed.frontmatter.originalDate }),
    };

    return NextResponse.json({ archive });
  } catch (error) {
    console.error('Error fetching archive:', error);
    return NextResponse.json(
      { error: 'Failed to fetch archive' },
      { status: 500 }
    );
  }
}

// PUT - Update archive
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { title, content } = await request.json();
    const currentFilePath = path.join(ARCHIVE_DIR, `${id}.md`);

    if (!fs.existsSync(currentFilePath)) {
      return NextResponse.json(
        { error: 'Archive not found' },
        { status: 404 }
      );
    }

    // Read current archive
    const fileContent = fs.readFileSync(currentFilePath, 'utf-8');
    const parsed = parseMarkdownWithFrontmatter(fileContent);

    // Update frontmatter
    const updatedFrontmatter: ArchiveFrontmatter = {
      ...parsed.frontmatter,
    };

    if (title !== undefined) {
      updatedFrontmatter.title = title;
    }

    // Update content
    const updatedContent = content !== undefined ? content : parsed.content;

    // Determine if we need to rename the file (title changed)
    let newId = id;
    let newFilePath = currentFilePath;

    if (title !== undefined && title !== parsed.frontmatter.title) {
      // Generate new filename from new title
      const baseFilename = sanitizeFilename(title);
      newId = generateUniqueFilename(ARCHIVE_DIR, baseFilename, `${id}.md`);
      newFilePath = path.join(ARCHIVE_DIR, `${newId}.md`);
    }

    // Serialize and save
    const mdContent = serializeMarkdownWithFrontmatter(updatedFrontmatter, updatedContent);
    fs.writeFileSync(newFilePath, mdContent, 'utf-8');

    // Delete old file if renamed
    if (newFilePath !== currentFilePath) {
      fs.unlinkSync(currentFilePath);
    }

    const archive: ArchiveItem = {
      id: newId,
      title: updatedFrontmatter.title,
      content: updatedContent,
      createdAt: updatedFrontmatter.createdAt,
      ...(updatedFrontmatter.originalDate && { originalDate: updatedFrontmatter.originalDate }),
    };

    return NextResponse.json({ success: true, archive });
  } catch (error) {
    console.error('Error updating archive:', error);
    return NextResponse.json(
      { error: 'Failed to update archive' },
      { status: 500 }
    );
  }
}

// DELETE - Delete archive
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const filePath = path.join(ARCHIVE_DIR, `${id}.md`);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: 'Archive not found' },
        { status: 404 }
      );
    }

    fs.unlinkSync(filePath);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting archive:', error);
    return NextResponse.json(
      { error: 'Failed to delete archive' },
      { status: 500 }
    );
  }
}
