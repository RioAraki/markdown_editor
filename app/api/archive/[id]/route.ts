import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { ArchiveItem } from '../route';

const ARCHIVE_DIR = path.join('D:', 'diary', 'data', 'archive');

// GET - Get specific archive
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const filePath = path.join(ARCHIVE_DIR, `${id}.json`);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: 'Archive not found' },
        { status: 404 }
      );
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const archive: ArchiveItem = JSON.parse(content);

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
    const filePath = path.join(ARCHIVE_DIR, `${id}.json`);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: 'Archive not found' },
        { status: 404 }
      );
    }

    // Read current archive
    const currentContent = fs.readFileSync(filePath, 'utf-8');
    const archive: ArchiveItem = JSON.parse(currentContent);

    // Update fields
    if (title !== undefined) archive.title = title;
    if (content !== undefined) archive.content = content;

    // Save updated archive
    fs.writeFileSync(filePath, JSON.stringify(archive, null, 2), 'utf-8');

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
    const filePath = path.join(ARCHIVE_DIR, `${id}.json`);

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
