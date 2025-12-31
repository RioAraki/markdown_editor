import { Label } from '@/types/label';

/**
 * Parse label IDs from markdown content
 * Labels are stored at the end of markdown in the format:
 * <!-- label-ids: id1,id2,id3 -->
 */
export function parseLabelsFromMarkdown(content: string): string[] {
  // Look for the label metadata at the end
  const match = content.match(/<!--\s*label-ids:\s*([^-]*?)\s*-->/);
  if (!match || !match[1]) {
    return [];
  }

  return match[1]
    .split(',')
    .map(id => id.trim())
    .filter(id => id.length > 0);
}

/**
 * Update label metadata in markdown content
 * Displays labels visibly at the end, similar to weather data
 */
export function updateLabelsInMarkdown(
  content: string,
  labelIds: string[],
  allLabels: Label[]
): string {
  // Remove existing label metadata (both hidden and visible)
  let withoutLabels = content.replace(/<!--\s*label-ids:.*?-->\n/g, '');
  withoutLabels = withoutLabels.replace(/\*\*Labels:\*\*[^\n]*\n?/g, '');

  // Also remove trailing metadata separator if it exists and no other metadata follows
  withoutLabels = withoutLabels.replace(/\n---\n\n$/s, '');
  withoutLabels = withoutLabels.trimEnd();

  // If no labels, return content without metadata
  if (labelIds.length === 0) {
    return withoutLabels;
  }

  // Get label names
  const selectedLabels = allLabels.filter(label => labelIds.includes(label.id));
  const labelNames = selectedLabels.map(label => label.name).join(', ');

  // Check if there's already a metadata section (from weather)
  const hasMetadataSection = withoutLabels.includes('\n---\n');

  let labelMetadata = '';
  if (hasMetadataSection) {
    // Append to existing metadata section
    labelMetadata = `<!-- label-ids: ${labelIds.join(',')} -->\n- **Labels:** ${labelNames}\n`;
  } else {
    // Create new metadata section
    labelMetadata = `\n\n---\n\n<!-- label-ids: ${labelIds.join(',')} -->\n- **Labels:** ${labelNames}\n`;
  }

  return withoutLabels + labelMetadata;
}
