import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const LABELS_CONFIG_PATH = path.join(process.cwd(), 'config', 'labels.json');

export interface Label {
  id: string;
  name: string;
  color: string;
}

// GET - Read labels from config file
export async function GET(request: NextRequest) {
  try {
    // Check if config file exists
    if (!fs.existsSync(LABELS_CONFIG_PATH)) {
      // Return default labels if file doesn't exist
      const defaultLabels: Label[] = [
        { id: '1', name: 'Work', color: '#3b82f6' },
        { id: '2', name: 'Personal', color: '#10b981' },
        { id: '3', name: 'Ideas', color: '#f59e0b' },
        { id: '4', name: 'Goals', color: '#8b5cf6' },
        { id: '5', name: 'Reflection', color: '#ec4899' },
        { id: '6', name: 'Travel', color: '#06b6d4' },
      ];
      return NextResponse.json({ labels: defaultLabels });
    }

    // Read labels from file
    const fileContent = fs.readFileSync(LABELS_CONFIG_PATH, 'utf-8');
    const labels: Label[] = JSON.parse(fileContent);

    return NextResponse.json({ labels });
  } catch (error) {
    console.error('Error reading labels:', error);
    return NextResponse.json(
      { error: 'Failed to read labels' },
      { status: 500 }
    );
  }
}

// POST - Save labels to config file
export async function POST(request: NextRequest) {
  try {
    const { labels } = await request.json();

    if (!Array.isArray(labels)) {
      return NextResponse.json(
        { error: 'Labels must be an array' },
        { status: 400 }
      );
    }

    // Validate each label
    for (const label of labels) {
      if (!label.id || !label.name || !label.color) {
        return NextResponse.json(
          { error: 'Each label must have id, name, and color' },
          { status: 400 }
        );
      }
    }

    // Ensure config directory exists
    const configDir = path.dirname(LABELS_CONFIG_PATH);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Write labels to file
    fs.writeFileSync(
      LABELS_CONFIG_PATH,
      JSON.stringify(labels, null, 2),
      'utf-8'
    );

    return NextResponse.json({ success: true, labels });
  } catch (error) {
    console.error('Error saving labels:', error);
    return NextResponse.json(
      { error: 'Failed to save labels' },
      { status: 500 }
    );
  }
}
