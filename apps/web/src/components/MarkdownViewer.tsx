import React, { useMemo, useState } from 'react';

interface MarkdownViewerProps {
  content: string;
  className?: string;
}

function sanitizeHref(url: string): string {
  const trimmed = url.trim();
  if (/^(https?:|mailto:|#|\/)/i.test(trimmed)) {
    return trimmed;
  }
  return '#unsafe-link';
}

function renderInline(text: string): React.ReactNode[] {
  // Regex tokens: inline code, bold, italic, strikethrough, link
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let keyIndex = 0;

  while (remaining.length > 0) {
    // Inline code `code`
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      parts.push(
        <code key={keyIndex++} className="md-inline-code">
          {codeMatch[1]}
        </code>
      );
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // Bold **text**
    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
    if (boldMatch) {
      parts.push(<strong key={keyIndex++}>{renderInline(boldMatch[1])}</strong>);
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Italic *text* or _text_
    const italicMatch = remaining.match(/^(\*|_)([^*_]+)\1/);
    if (italicMatch) {
      parts.push(<em key={keyIndex++}>{renderInline(italicMatch[2])}</em>);
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // Strikethrough ~~text~~
    const strikeMatch = remaining.match(/^~~([^~]+)~~/);
    if (strikeMatch) {
      parts.push(<del key={keyIndex++}>{renderInline(strikeMatch[1])}</del>);
      remaining = remaining.slice(strikeMatch[0].length);
      continue;
    }

    // Link [text](url)
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      const safeUrl = sanitizeHref(linkMatch[2]);
      parts.push(
        <a
          key={keyIndex++}
          href={safeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="md-link"
        >
          {linkMatch[1]}
        </a>
      );
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    // Normal text chunk up to next delimiter
    const nextSpecial = remaining.search(/[`*_~[]/);
    if (nextSpecial === -1) {
      parts.push(remaining);
      break;
    } else if (nextSpecial === 0) {
      // Just plain character if not matched above
      parts.push(remaining[0]);
      remaining = remaining.slice(1);
    } else {
      parts.push(remaining.slice(0, nextSpecial));
      remaining = remaining.slice(nextSpecial);
    }
  }

  return parts;
}

export const MarkdownViewer: React.FC<MarkdownViewerProps> = ({ content, className = '' }) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopyCode = (code: string, index: number) => {
    void navigator.clipboard.writeText(code);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const blocks = useMemo(() => {
    const lines = content.split(/\r?\n/);
    const elements: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeLanguage = '';
    let codeBuffer: string[] = [];
    let blockIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Code block start / end
      if (line.trim().startsWith('```')) {
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeLanguage = line.trim().slice(3).trim();
          codeBuffer = [];
        } else {
          inCodeBlock = false;
          const currentCode = codeBuffer.join('\n');
          const codeIdx = blockIndex++;
          elements.push(
            <div key={codeIdx} className="md-code-block-wrap">
              <div className="md-code-header">
                <span>{codeLanguage || 'code'}</span>
                <button
                  type="button"
                  className="md-code-copy-btn"
                  onClick={() => handleCopyCode(currentCode, codeIdx)}
                >
                  {copiedIndex === codeIdx ? '✓ คัดลอกแล้ว' : '📋 คัดลอก'}
                </button>
              </div>
              <pre className="md-code-block">
                <code>{currentCode}</code>
              </pre>
            </div>
          );
        }
        continue;
      }

      if (inCodeBlock) {
        codeBuffer.push(line);
        continue;
      }

      const trimmed = line.trim();

      // Empty line
      if (!trimmed) {
        continue;
      }

      // Horizontal Rule
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        elements.push(<hr key={blockIndex++} className="md-hr" />);
        continue;
      }

      // Headers
      if (trimmed.startsWith('# ')) {
        elements.push(<h1 key={blockIndex++} className="md-h1">{renderInline(trimmed.slice(2))}</h1>);
        continue;
      }
      if (trimmed.startsWith('## ')) {
        elements.push(<h2 key={blockIndex++} className="md-h2">{renderInline(trimmed.slice(3))}</h2>);
        continue;
      }
      if (trimmed.startsWith('### ')) {
        elements.push(<h3 key={blockIndex++} className="md-h3">{renderInline(trimmed.slice(4))}</h3>);
        continue;
      }
      if (trimmed.startsWith('#### ')) {
        elements.push(<h4 key={blockIndex++} className="md-h4">{renderInline(trimmed.slice(5))}</h4>);
        continue;
      }

      // Blockquotes
      if (trimmed.startsWith('> ')) {
        elements.push(
          <blockquote key={blockIndex++} className="md-quote">
            {renderInline(trimmed.slice(2))}
          </blockquote>
        );
        continue;
      }

      // Task List items (- [ ] or - [x])
      const taskMatch = trimmed.match(/^-\s*\[([ xX])\]\s*(.*)$/);
      if (taskMatch) {
        const isChecked = taskMatch[1].toLowerCase() === 'x';
        elements.push(
          <div key={blockIndex++} className="md-task-item">
            <input type="checkbox" checked={isChecked} readOnly className="md-task-checkbox" />
            <span className={isChecked ? 'md-task-done' : ''}>{renderInline(taskMatch[2])}</span>
          </div>
        );
        continue;
      }

      // Bullet list items
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        elements.push(
          <li key={blockIndex++} className="md-list-item">
            {renderInline(trimmed.slice(2))}
          </li>
        );
        continue;
      }

      // Numbered list items
      const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
      if (numMatch) {
        elements.push(
          <li key={blockIndex++} className="md-num-item">
            <strong>{numMatch[1]}.</strong> {renderInline(numMatch[2])}
          </li>
        );
        continue;
      }

      // Normal paragraph
      elements.push(
        <p key={blockIndex++} className="md-paragraph">
          {renderInline(trimmed)}
        </p>
      );
    }

    if (inCodeBlock && codeBuffer.length > 0) {
      const currentCode = codeBuffer.join('\n');
      elements.push(
        <pre key="trailing-code" className="md-code-block">
          <code>{currentCode}</code>
        </pre>
      );
    }

    return elements;
  }, [content, copiedIndex]);

  return <div className={`md-container ${className}`}>{blocks}</div>;
};
