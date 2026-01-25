import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

const STEAM_IMG_DIR = 'D:\\diary\\steam_img';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  // Sanitize filename to prevent path traversal
  const sanitizedFilename = path.basename(filename);
  const filepath = path.join(STEAM_IMG_DIR, sanitizedFilename);

  // Check if file exists
  if (!fs.existsSync(filepath)) {
    return new NextResponse('Not found', { status: 404 });
  }

  try {
    const fileBuffer = fs.readFileSync(filepath);
    const ext = path.extname(sanitizedFilename).toLowerCase();

    let contentType = 'application/octet-stream';
    if (ext === '.jpg' || ext === '.jpeg') {
      contentType = 'image/jpeg';
    } else if (ext === '.png') {
      contentType = 'image/png';
    } else if (ext === '.gif') {
      contentType = 'image/gif';
    } else if (ext === '.webp') {
      contentType = 'image/webp';
    }

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('Error serving steam image:', error);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
