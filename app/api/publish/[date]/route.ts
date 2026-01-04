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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ date: string }> }
) {
  try {
    const { date } = await params;
    const filename = `${date}_public.md`;

    // Check if the diary file exists in D:\diary\data\diary
    const diaryFilePath = path.join(DIARY_DIR, filename);
    const diaryFileExists = fs.existsSync(diaryFilePath);

    // Read share-tokens.json
    if (!fs.existsSync(SHARE_TOKENS_PATH)) {
      return NextResponse.json({
        isPublished: false,
        fileExists: diaryFileExists,
      });
    }

    const shareTokensData: ShareTokensData = JSON.parse(
      fs.readFileSync(SHARE_TOKENS_PATH, 'utf-8')
    );

    // Find if this filename is published
    const publishedEntry = Object.entries(shareTokensData.tokens).find(
      ([_, token]) => token.filename === filename
    );

    if (publishedEntry) {
      const [tokenId, tokenData] = publishedEntry;
      return NextResponse.json({
        isPublished: true,
        tokenId,
        description: tokenData.description,
        url: `/special/${tokenId}`,
        fileExists: diaryFileExists,
      });
    }

    return NextResponse.json({
      isPublished: false,
      fileExists: diaryFileExists,
    });
  } catch (error) {
    console.error('Error checking publish status:', error);
    return NextResponse.json(
      { error: 'Failed to check publish status' },
      { status: 500 }
    );
  }
}
