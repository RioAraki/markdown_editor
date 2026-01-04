export interface AuditChange {
  line: number;
  original: string;
  fixed: string;
  rule: string;
  description: string;
}

export interface AuditResult {
  changes: AuditChange[];
  originalText: string;
  fixedText: string;
}

export interface AuditRule {
  name: string;
  description: string;
  apply: (text: string) => { text: string; changes: AuditChange[] };
}

/**
 * Rule: Add space between Chinese and English/numbers
 */
export const chineseEnglishSpacingRule: AuditRule = {
  name: 'Chinese-English Spacing',
  description: 'Add spaces between Chinese characters and English letters or numbers',
  apply: (text: string) => {
    const lines = text.split('\n');
    const changes: AuditChange[] = [];
    const fixedLines: string[] = [];

    lines.forEach((line, index) => {
      let fixedLine = line;
      let hasChanges = false;

      // Add space between Chinese and English/number
      // Chinese followed by English/number
      fixedLine = fixedLine.replace(
        /([\u4e00-\u9fa5])([a-zA-Z0-9])/g,
        (match, chinese, alphanumeric) => {
          hasChanges = true;
          return `${chinese} ${alphanumeric}`;
        }
      );

      // English/number followed by Chinese
      fixedLine = fixedLine.replace(
        /([a-zA-Z0-9])([\u4e00-\u9fa5])/g,
        (match, alphanumeric, chinese) => {
          hasChanges = true;
          return `${alphanumeric} ${chinese}`;
        }
      );

      if (hasChanges) {
        changes.push({
          line: index + 1,
          original: line,
          fixed: fixedLine,
          rule: 'Chinese-English Spacing',
          description: 'Added spaces between Chinese and English/numbers',
        });
      }

      fixedLines.push(fixedLine);
    });

    return {
      text: fixedLines.join('\n'),
      changes,
    };
  },
};

/**
 * All audit rules registry
 * Add new rules here to enable them
 */
export const AUDIT_RULES: AuditRule[] = [
  chineseEnglishSpacingRule,
  // Add more rules here in the future
];

/**
 * Run all audit rules on text
 */
export function runAudit(text: string): AuditResult {
  let currentText = text;
  const allChanges: AuditChange[] = [];

  // Apply each rule sequentially
  AUDIT_RULES.forEach(rule => {
    const result = rule.apply(currentText);
    currentText = result.text;
    allChanges.push(...result.changes);
  });

  return {
    changes: allChanges,
    originalText: text,
    fixedText: currentText,
  };
}
