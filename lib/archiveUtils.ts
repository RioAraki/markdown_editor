import fs from 'fs';
import path from 'path';

export interface ArchiveFrontmatter {
  title: string;
  createdAt: string;
  originalDate?: string;
}

export interface ParsedArchive {
  frontmatter: ArchiveFrontmatter;
  content: string;
}

/**
 * Parse a markdown file with YAML frontmatter
 */
export function parseMarkdownWithFrontmatter(fileContent: string): ParsedArchive {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
  const match = fileContent.match(frontmatterRegex);

  if (!match) {
    // No frontmatter, treat entire content as markdown
    return {
      frontmatter: {
        title: 'Untitled',
        createdAt: new Date().toISOString(),
      },
      content: fileContent,
    };
  }

  const yamlContent = match[1];
  const markdownContent = match[2];

  // Simple YAML parsing for our known fields
  const frontmatter: ArchiveFrontmatter = {
    title: 'Untitled',
    createdAt: new Date().toISOString(),
  };

  const lines = yamlContent.split(/\r?\n/);
  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();

    // Remove quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (key === 'title') frontmatter.title = value;
    else if (key === 'createdAt') frontmatter.createdAt = value;
    else if (key === 'originalDate') frontmatter.originalDate = value;
  }

  return {
    frontmatter,
    content: markdownContent,
  };
}

/**
 * Serialize content with YAML frontmatter
 */
export function serializeMarkdownWithFrontmatter(
  frontmatter: ArchiveFrontmatter,
  content: string
): string {
  let yaml = '---\n';
  yaml += `title: "${frontmatter.title.replace(/"/g, '\\"')}"\n`;
  yaml += `createdAt: "${frontmatter.createdAt}"\n`;
  if (frontmatter.originalDate) {
    yaml += `originalDate: "${frontmatter.originalDate}"\n`;
  }
  yaml += '---\n';

  return yaml + content;
}

/**
 * Sanitize a title to create a valid filename
 * - Converts to lowercase
 * - Replaces spaces and special chars with dashes
 * - Removes consecutive dashes
 * - Trims dashes from start/end
 */
export function sanitizeFilename(title: string): string {
  return title
    .toLowerCase()
    .trim()
    // Replace common special characters with dashes
    .replace(/[^a-z0-9\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]+/gi, '-')
    // Remove consecutive dashes
    .replace(/-+/g, '-')
    // Trim dashes from start and end
    .replace(/^-|-$/g, '')
    // Fallback if empty
    || 'untitled';
}

/**
 * Generate a unique filename in the given directory
 * Appends -2, -3, etc. if the filename already exists
 */
export function generateUniqueFilename(
  directory: string,
  baseFilename: string,
  excludeFilename?: string
): string {
  const ext = '.md';
  let filename = baseFilename;
  let counter = 1;

  while (true) {
    const fullPath = path.join(directory, filename + ext);
    const exists = fs.existsSync(fullPath);

    // If file doesn't exist, or it's the file we're excluding (for rename scenarios)
    if (!exists || (excludeFilename && filename + ext === excludeFilename)) {
      return filename;
    }

    counter++;
    filename = `${baseFilename}-${counter}`;
  }
}

/**
 * Migrate a JSON archive file to markdown format
 */
export function migrateJsonToMarkdown(
  jsonFilePath: string,
  archiveDir: string
): { success: boolean; newFilename?: string; error?: string } {
  try {
    const jsonContent = fs.readFileSync(jsonFilePath, 'utf-8');
    const archive = JSON.parse(jsonContent);

    const frontmatter: ArchiveFrontmatter = {
      title: archive.title || 'Untitled',
      createdAt: archive.createdAt || new Date().toISOString(),
    };

    if (archive.originalDate) {
      frontmatter.originalDate = archive.originalDate;
    }

    const baseFilename = sanitizeFilename(frontmatter.title);
    const uniqueFilename = generateUniqueFilename(archiveDir, baseFilename);
    const mdContent = serializeMarkdownWithFrontmatter(frontmatter, archive.content || '');

    const newFilePath = path.join(archiveDir, uniqueFilename + '.md');
    fs.writeFileSync(newFilePath, mdContent, 'utf-8');

    // Delete the old JSON file
    fs.unlinkSync(jsonFilePath);

    return { success: true, newFilename: uniqueFilename };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Migrate all JSON archives in a directory to markdown format
 */
export function migrateAllJsonArchives(archiveDir: string): {
  migrated: number;
  errors: string[];
} {
  const result = { migrated: 0, errors: [] as string[] };

  if (!fs.existsSync(archiveDir)) {
    return result;
  }

  const files = fs.readdirSync(archiveDir);

  for (const file of files) {
    if (file.endsWith('.json')) {
      const jsonPath = path.join(archiveDir, file);
      const migrationResult = migrateJsonToMarkdown(jsonPath, archiveDir);

      if (migrationResult.success) {
        result.migrated++;
        console.log(`Migrated: ${file} -> ${migrationResult.newFilename}.md`);
      } else {
        result.errors.push(`Failed to migrate ${file}: ${migrationResult.error}`);
      }
    }
  }

  return result;
}
