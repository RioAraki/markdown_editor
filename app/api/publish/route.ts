import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const SHARE_TOKENS_PATH = path.join('D:', 'diary', 'data', 'share-tokens.json');
const DIARY_DIR = path.join('D:', 'diary', 'data', 'diary');

interface ShareToken {
  filename: string;
  description?: string;
}

interface ShareTokensData {
  tokens: Record<string, ShareToken>;
}

// Publish a diary entry
export async function POST(request: NextRequest) {
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

    const filename = `${date}_public.md`;
    const diaryFilePath = path.join(DIARY_DIR, filename);

    // Check if the diary file exists
    if (!fs.existsSync(diaryFilePath)) {
      return NextResponse.json(
        { error: `Diary file does not exist in D:\\diary\\data\\diary\\${filename}` },
        { status: 404 }
      );
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
    fs.writeFileSync(
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
    fs.writeFileSync(
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
