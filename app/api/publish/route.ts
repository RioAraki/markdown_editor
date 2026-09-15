import { atomicWriteFileSync } from '@/lib/atomicFile';
import { allowExternalWrites, resolveServerPaths } from '@/lib/serverPaths';
import { NextRequest, NextResponse } from 'next/server';
import { guardedFs as fs } from '@/lib/guardedFs';
import path from 'path';

const SHARE_TOKENS_PATH = resolveServerPaths().shareTokens;
const DIARY_DIR = resolveServerPaths().diary;

function publicationDisabled() {
  const isolated = process.env.EDITOR_PROFILE === 'development' || process.env.EDITOR_PROFILE === 'candidate';
  return !isolated && !allowExternalWrites();
}

interface ShareToken {
  filename: string;
  description?: string;
}

interface ShareTokensData {
  tokens: Record<string, ShareToken>;
}

// Publish a diary entry
export async function POST(request: NextRequest) {
  if (publicationDisabled()) {
    return NextResponse.json({ error: 'Publication is disabled for this instance.' }, { status: 403 });
  }
  try {
    const { date, tokenId, description } = await request.json();

    if (!date || !tokenId) {
      return NextResponse.json(
        { error: 'Date and tokenId are required' },
        { status: 400 }
      );
    }

    // Validate tokenId format (only lowercase, numbers, and hyphens)
    if (!/^[a-z0-9-]+$/.test(tokenId)) {
      return NextResponse.json(
        { error: 'Token ID must only contain lowercase letters, numbers, and hyphens' },
        { status: 400 }
      );
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: 'Date must be in YYYY-MM-DD format' },
        { status: 400 }
      );
    }

    const filename = `${date}_public.md`;
    const diaryFilePath = path.join(DIARY_DIR, filename);

    // Check if the diary file exists. Only `_public` files are publishable —
    // the diary site refuses to serve a bare YYYY-MM-DD.md even via a guessed
    // URL — so an entry stored in that form has to be renamed first.
    if (!fs.existsSync(diaryFilePath)) {
      const privateFilename = `${date}.md`;
      const error = fs.existsSync(path.join(DIARY_DIR, privateFilename))
        ? `${privateFilename} is a private entry and cannot be published. Rename it to ${filename} first.`
        : `Diary file does not exist: ${filename}`;

      return NextResponse.json({ error }, { status: 404 });
    }

    // Read existing share-tokens.json or create new structure
    let shareTokensData: ShareTokensData = { tokens: {} };
    if (fs.existsSync(SHARE_TOKENS_PATH)) {
      shareTokensData = JSON.parse(fs.readFileSync(SHARE_TOKENS_PATH, 'utf-8'));
    }

    // Check if tokenId already exists
    if (shareTokensData.tokens[tokenId]) {
      return NextResponse.json(
        { error: 'Token ID already exists. Please choose a different URL slug.' },
        { status: 409 }
      );
    }

    // Add new token
    shareTokensData.tokens[tokenId] = {
      filename,
      ...(description && { description }),
    };

    // Write back to file
    atomicWriteFileSync(
      SHARE_TOKENS_PATH,
      JSON.stringify(shareTokensData, null, 2),
      'utf-8'
    );

    return NextResponse.json({
      success: true,
      tokenId,
      url: `/special/${tokenId}`,
    });
  } catch (error) {
    console.error('Error publishing diary:', error);
    return NextResponse.json(
      { error: 'Failed to publish diary' },
      { status: 500 }
    );
  }
}

// Unpublish a diary entry
export async function DELETE(request: NextRequest) {
  if (publicationDisabled()) {
    return NextResponse.json({ error: 'Publication is disabled for this instance.' }, { status: 403 });
  }
  try {
    const { date } = await request.json();

    if (!date) {
      return NextResponse.json(
        { error: 'Date is required' },
        { status: 400 }
      );
    }

    const filename = `${date}_public.md`;

    // Read share-tokens.json
    if (!fs.existsSync(SHARE_TOKENS_PATH)) {
      return NextResponse.json(
        { error: 'No published entries found' },
        { status: 404 }
      );
    }

    const shareTokensData: ShareTokensData = JSON.parse(
      fs.readFileSync(SHARE_TOKENS_PATH, 'utf-8')
    );

    // Find and remove the token with this filename
    const tokenToRemove = Object.keys(shareTokensData.tokens).find(
      (tokenId) => shareTokensData.tokens[tokenId].filename === filename
    );

    if (!tokenToRemove) {
      return NextResponse.json(
        { error: 'Entry is not published' },
        { status: 404 }
      );
    }

    delete shareTokensData.tokens[tokenToRemove];

    // Write back to file
    atomicWriteFileSync(
      SHARE_TOKENS_PATH,
      JSON.stringify(shareTokensData, null, 2),
      'utf-8'
    );

    return NextResponse.json({
      success: true,
      removedTokenId: tokenToRemove,
    });
  } catch (error) {
    console.error('Error unpublishing diary:', error);
    return NextResponse.json(
      { error: 'Failed to unpublish diary' },
      { status: 500 }
    );
  }
}
