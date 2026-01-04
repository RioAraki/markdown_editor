'use client';

import React, { useRef } from 'react';
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Link,
  Image,
  Minus,
  Code2,
  Cloud,
  FileCheck,
  Globe,
  Loader2,
} from 'lucide-react';

interface MarkdownToolbarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  onContentChange: (newContent: string) => void;
  content: string;
  // Action buttons
  onWeatherClick?: () => void;
  isLoadingWeather?: boolean;
  onAuditClick?: () => void;
  onPublishClick?: () => void;
  isPublished?: boolean;
  publishDisabled?: boolean;
}

export function MarkdownToolbar({
  textareaRef,
  onContentChange,
  content,
  onWeatherClick,
  isLoadingWeather,
  onAuditClick,
  onPublishClick,
  isPublished,
  publishDisabled,
}: MarkdownToolbarProps) {
  // Get current selection
  const getSelection = () => {
    const textarea = textareaRef.current;
    if (!textarea) return null;

    return {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
      text: content.substring(textarea.selectionStart, textarea.selectionEnd),
    };
  };

  // Replace selection with new text
  const replaceSelection = (newText: string, selectAfter: boolean = false) => {
    const textarea = textareaRef.current;
    const selection = getSelection();
    if (!textarea || !selection) return;

    const before = content.substring(0, selection.start);
    const after = content.substring(selection.end);
    const newContent = before + newText + after;

    onContentChange(newContent);

    // Restore focus and set cursor position
    setTimeout(() => {
      textarea.focus();
      if (selectAfter) {
        // Select the newly inserted text (minus the markdown syntax)
        const newStart = selection.start;
        const newEnd = selection.start + newText.length;
        textarea.setSelectionRange(newStart, newEnd);
      } else {
        // Place cursor at the end of the inserted text
        const newPos = selection.start + newText.length;
        textarea.setSelectionRange(newPos, newPos);
      }
    }, 0);
  };

  // Wrap selection with markdown syntax
  const wrapSelection = (prefix: string, suffix: string = prefix) => {
    const selection = getSelection();
    if (!selection) return;

    if (selection.text) {
      // Wrap selected text
      replaceSelection(`${prefix}${selection.text}${suffix}`);
    } else {
      // No selection, insert placeholder
      const placeholder = 'text';
      replaceSelection(`${prefix}${placeholder}${suffix}`, true);
    }
  };

  // Insert at start of line(s)
  const insertLinePrefix = (prefix: string) => {
    const selection = getSelection();
    if (!selection) return;

    const textarea = textareaRef.current;
    if (!textarea) return;

    // Get the start of the line
    const lineStart = content.lastIndexOf('\n', selection.start - 1) + 1;
    const lineEnd = content.indexOf('\n', selection.end);
    const actualLineEnd = lineEnd === -1 ? content.length : lineEnd;

    // Get all lines in selection
    const selectedLines = content.substring(lineStart, actualLineEnd);
    const lines = selectedLines.split('\n');

    // Add prefix to each line
    const newLines = lines.map(line => {
      // Toggle: if line already has prefix, remove it
      if (line.trimStart().startsWith(prefix.trim())) {
        return line.replace(prefix.trim(), '').trimStart();
      }
      return prefix + line;
    });

    const newText = newLines.join('\n');
    const before = content.substring(0, lineStart);
    const after = content.substring(actualLineEnd);
    const newContent = before + newText + after;

    onContentChange(newContent);

    setTimeout(() => {
      textarea.focus();
      const newPos = lineStart + newText.length;
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  };

  // Format handlers
  const handleBold = () => wrapSelection('**');
  const handleItalic = () => wrapSelection('*');
  const handleStrikethrough = () => wrapSelection('~~');
  const handleInlineCode = () => wrapSelection('`');
  const handleH1 = () => insertLinePrefix('# ');
  const handleH2 = () => insertLinePrefix('## ');
  const handleH3 = () => insertLinePrefix('### ');
  const handleBulletList = () => insertLinePrefix('- ');
  const handleNumberedList = () => insertLinePrefix('1. ');
  const handleBlockquote = () => insertLinePrefix('> ');

  const handleLink = () => {
    const selection = getSelection();
    if (!selection) return;

    if (selection.text) {
      replaceSelection(`[${selection.text}](url)`);
    } else {
      replaceSelection('[link text](url)', true);
    }
  };

  const handleImage = () => {
    const selection = getSelection();
    if (!selection) return;

    if (selection.text) {
      replaceSelection(`![${selection.text}](url)`);
    } else {
      replaceSelection('![alt text](url)', true);
    }
  };

  const handleCodeBlock = () => {
    const selection = getSelection();
    if (!selection) return;

    if (selection.text) {
      replaceSelection(`\`\`\`\n${selection.text}\n\`\`\``);
    } else {
      replaceSelection('```\ncode here\n```', true);
    }
  };

  const handleHorizontalRule = () => {
    replaceSelection('\n\n---\n\n');
  };

  const ToolbarButton = ({
    onClick,
    icon: Icon,
    title,
  }: {
    onClick: () => void;
    icon: any;
    title: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
      title={title}
    >
      <Icon className="w-4 h-4" />
    </button>
  );

  const Divider = () => <div className="w-px h-6 bg-gray-300 mx-1" />;

  return (
    <div className="border-b border-gray-200 bg-gray-50 px-3 py-2 flex items-center gap-1 flex-wrap">
      {/* Text formatting */}
      <ToolbarButton onClick={handleBold} icon={Bold} title="Bold (Ctrl+B)" />
      <ToolbarButton onClick={handleItalic} icon={Italic} title="Italic (Ctrl+I)" />
      <ToolbarButton onClick={handleStrikethrough} icon={Strikethrough} title="Strikethrough" />
      <ToolbarButton onClick={handleInlineCode} icon={Code} title="Inline Code" />

      <Divider />

      {/* Headers */}
      <ToolbarButton onClick={handleH1} icon={Heading1} title="Heading 1" />
      <ToolbarButton onClick={handleH2} icon={Heading2} title="Heading 2" />
      <ToolbarButton onClick={handleH3} icon={Heading3} title="Heading 3" />

      <Divider />

      {/* Lists */}
      <ToolbarButton onClick={handleBulletList} icon={List} title="Bullet List" />
      <ToolbarButton onClick={handleNumberedList} icon={ListOrdered} title="Numbered List" />
      <ToolbarButton onClick={handleBlockquote} icon={Quote} title="Blockquote" />

      <Divider />

      {/* Links and images */}
      <ToolbarButton onClick={handleLink} icon={Link} title="Insert Link" />
      <ToolbarButton onClick={handleImage} icon={Image} title="Insert Image" />

      <Divider />

      {/* Code and dividers */}
      <ToolbarButton onClick={handleCodeBlock} icon={Code2} title="Code Block" />
      <ToolbarButton onClick={handleHorizontalRule} icon={Minus} title="Horizontal Rule" />

      {/* Spacer to push action buttons to the right */}
      <div className="flex-1" />

      {/* Action buttons */}
      {onWeatherClick && (
        <button
          type="button"
          onClick={onWeatherClick}
          disabled={isLoadingWeather}
          className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Add weather data"
        >
          {isLoadingWeather ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Cloud className="w-4 h-4" />
          )}
        </button>
      )}

      {onAuditClick && (
        <button
          type="button"
          onClick={onAuditClick}
          className="p-2 text-purple-600 hover:text-purple-800 hover:bg-purple-50 rounded-md transition-colors"
          title="Audit formatting"
        >
          <FileCheck className="w-4 h-4" />
        </button>
      )}

      {onPublishClick && (
        <button
          type="button"
          onClick={onPublishClick}
          disabled={publishDisabled}
          className={`p-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            isPublished
              ? 'text-green-700 hover:text-green-900 hover:bg-green-50'
              : 'text-green-600 hover:text-green-800 hover:bg-green-50'
          }`}
          title={isPublished ? 'Published - click to view options' : 'Publish this entry'}
        >
          <Globe className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
