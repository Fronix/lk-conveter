/**
 * Post-process markdown output from prosemirrorToMd to produce
 * clean Obsidian-compatible markdown with no LK artifacts.
 */

const LK_TO_OBSIDIAN_CALLOUT: Record<string, string> = {
  info: 'NOTE',
  warning: 'WARNING',
  error: 'ERROR',
  success: 'SUCCESS',
  note: 'QUOTE',
};

let layoutIdCounter = 0;

export function postprocessForObsidian(
  markdown: string,
  globalLookup: Map<string, string>,
): string {
  // Protect code blocks from transformation
  const segments = splitCodeSegments(markdown);

  for (const segment of segments) {
    if (segment.isCode) continue;

    // Step 1: Strip block-level LK comments (full lines)
    segment.text = segment.text.replace(
      /^<!-- lk-(?:table|media|tasklist|ext|unknown|inline):.*-->\n/gm,
      '',
    );
    segment.text = segment.text.replace(/^<!-- empty -->\n/gm, '');
    segment.text = segment.text.replace(/^<!-- lk-ws:.*-->\n/gm, '');

    // Step 2: Strip inline/nested LK comments (inside blockquotes, lists, table cells)
    segment.text = segment.text.replace(
      /\s*<!-- lk-(?:task|tasklist|pm|mention|link|expand|inline):.*?-->/g,
      '',
    );
    segment.text = segment.text.replace(/\s*<!-- empty -->/g, '');

    // Step 3: Convert mentions to wiki-links or plain text
    segment.text = segment.text.replace(
      /@\[([^\]]+)\]\(lk:\/\/([^)]*)\)/g,
      (_match, display: string, id: string) => {
        const noteName = globalLookup.get(id);
        if (noteName) {
          return display === noteName
            ? `[[${noteName}]]`
            : `[[${noteName}|${display}]]`;
        }
        return display;
      },
    );
  }

  let result = segments.map((s) => s.text).join('');

  // Step 4: Convert directives to Obsidian equivalents
  result = convertDirectives(result);

  // Step 5: Convert internal .md links to wiki-links
  result = convertLinksToWikiLinks(result);

  // Step 6: Cleanup
  result = result.replace(/\n{3,}/g, '\n\n').trim();
  return `${result}\n`;
}

// --- Code segment protection ---

interface Segment {
  text: string;
  isCode: boolean;
}

function splitCodeSegments(markdown: string): Segment[] {
  const segments: Segment[] = [];
  const codePattern = /(```[\s\S]*?```|`[^`\n]+`)/g;
  let lastIndex = 0;

  for (const match of markdown.matchAll(codePattern)) {
    const start = match.index;
    if (start > lastIndex) {
      segments.push({ text: markdown.slice(lastIndex, start), isCode: false });
    }
    segments.push({ text: match[0], isCode: true });
    lastIndex = start + match[0].length;
  }

  if (lastIndex < markdown.length) {
    segments.push({ text: markdown.slice(lastIndex), isCode: false });
  }

  return segments;
}

// --- Directive conversion ---

function convertDirectives(markdown: string): string {
  const lines = markdown.split('\n');
  const result: string[] = [];
  let i = 0;
  let inCodeBlock = false;

  while (i < lines.length) {
    const line = lines[i];

    // Track fenced code blocks — skip directive conversion inside them
    if (line.match(/^```/)) {
      inCodeBlock = !inCodeBlock;
      result.push(line);
      i++;
      continue;
    }

    if (inCodeBlock) {
      result.push(line);
      i++;
      continue;
    }

    // :::panel-TYPE
    const panelMatch = line.match(/^:::panel-(\w+)\s*$/);
    if (panelMatch) {
      const [, lkType] = panelMatch;
      const calloutType = LK_TO_OBSIDIAN_CALLOUT[lkType] || 'NOTE';
      const { content, endIndex } = collectDirectiveContent(lines, i + 1);
      const processed = convertDirectives(content);
      result.push(`> [!${calloutType}]`);
      for (const cl of processed.split('\n')) {
        result.push(cl === '' ? '>' : `> ${cl}`);
      }
      result.push('');
      i = endIndex + 1;
      continue;
    }

    // :::secret [Title]
    const secretMatch = line.match(/^:::secret(?:\s+(.+))?\s*$/);
    if (secretMatch) {
      const title = secretMatch[1]?.trim();
      const titleSuffix =
        title && title !== 'Secret' ? ` ${title}` : '';
      const { content, endIndex } = collectDirectiveContent(lines, i + 1);
      const processed = convertDirectives(content);
      result.push(`> [!ABSTRACT]${titleSuffix}`);
      for (const cl of processed.split('\n')) {
        result.push(cl === '' ? '>' : `> ${cl}`);
      }
      result.push('');
      i = endIndex + 1;
      continue;
    }

    // :::expand Title
    const expandMatch = line.match(/^:::expand(?:\s+(.+))?\s*$/);
    if (expandMatch) {
      const title = expandMatch[1]?.trim() || '';
      const { content, endIndex } = collectDirectiveContent(lines, i + 1);
      const processed = convertDirectives(content);
      result.push(`> [!NOTE]- ${title}`.trimEnd());
      for (const cl of processed.split('\n')) {
        result.push(cl === '' ? '>' : `> ${cl}`);
      }
      result.push('');
      i = endIndex + 1;
      continue;
    }

    // :::layout — convert to multi-column-markdown plugin syntax
    if (line.match(/^:::layout\s*$/)) {
      const { columns, widths, endIndex } = collectLayoutColumns(lines, i + 1);
      const id = `ID_lk_${++layoutIdCounter}`;
      const colSizes = widths.map((w) => `${w}%`).join(', ');
      result.push(`--- start-multi-column: ${id}`);
      result.push('```column-settings');
      result.push(`Number of Columns: ${columns.length}`);
      result.push(`Column Size: [${colSizes}]`);
      result.push('Border: disabled');
      result.push('Shadow: off');
      result.push('```');
      result.push('');
      for (let c = 0; c < columns.length; c++) {
        const processed = convertDirectives(columns[c]);
        result.push(processed);
        if (c < columns.length - 1) {
          result.push('');
          result.push('--- end-column ---');
          result.push('');
        }
      }
      result.push('');
      result.push('--- end-multi-column');
      result.push('');
      i = endIndex + 1;
      continue;
    }

    // :::extension {...} — strip wrapper, keep content
    const extensionMatch = line.match(/^:::extension\s+/);
    if (extensionMatch) {
      const { content, endIndex } = collectDirectiveContent(lines, i + 1);
      const processed = convertDirectives(content);
      result.push(processed);
      result.push('');
      i = endIndex + 1;
      continue;
    }

    result.push(line);
    i++;
  }

  return result.join('\n');
}

/**
 * Collect content lines inside a directive until the matching closing `:::`.
 * Handles nested `:::` blocks by tracking depth.
 */
function collectDirectiveContent(
  lines: string[],
  startIndex: number,
): { content: string; endIndex: number } {
  const contentLines: string[] = [];
  let depth = 1;
  let i = startIndex;

  while (i < lines.length) {
    const line = lines[i];

    if (line.match(/^:::\s*$/)) {
      depth--;
      if (depth === 0) {
        return { content: contentLines.join('\n'), endIndex: i };
      }
      contentLines.push(line);
    } else if (line.match(/^:::\S/)) {
      // Opening directive (:::panel-*, :::secret, :::expand, :::layout, :::extension, :::col-*)
      depth++;
      contentLines.push(line);
    } else {
      contentLines.push(line);
    }
    i++;
  }

  // No closing ::: found — return everything
  return { content: contentLines.join('\n'), endIndex: i - 1 };
}

/**
 * Collect layout columns, returning each column's content and width separately.
 */
function collectLayoutColumns(
  lines: string[],
  startIndex: number,
): { columns: string[]; widths: number[]; endIndex: number } {
  const columns: string[] = [];
  const widths: number[] = [];
  let depth = 1;
  let currentCol: string[] | null = null;
  let i = startIndex;

  while (i < lines.length) {
    const line = lines[i];

    if (line.match(/^:::\s*$/)) {
      depth--;
      if (depth === 0) {
        if (currentCol) {
          columns.push(currentCol.join('\n').trim());
        }
        return { columns, widths, endIndex: i };
      }
      if (depth === 1) {
        if (currentCol) {
          columns.push(currentCol.join('\n').trim());
          currentCol = null;
        }
      } else if (currentCol) {
        currentCol.push(line);
      }
      i++;
      continue;
    }

    const colMatch = line.match(/^:::col-([\d.]+)\s*$/);
    if (colMatch && depth === 1) {
      depth++;
      widths.push(Number.parseFloat(colMatch[1]));
      currentCol = [];
      i++;
      continue;
    }

    if (line.match(/^:::\S/)) {
      depth++;
      if (currentCol) currentCol.push(line);
      i++;
      continue;
    }

    if (currentCol) currentCol.push(line);
    i++;
  }

  if (currentCol) {
    columns.push(currentCol.join('\n').trim());
  }

  return { columns, widths, endIndex: i - 1 };
}

// --- Link conversion ---

function convertLinksToWikiLinks(markdown: string): string {
  // Protect code blocks
  const segments = splitCodeSegments(markdown);

  for (const segment of segments) {
    if (segment.isCode) continue;

    // Convert markdown links to .md files into wiki-links
    // Match [text](path.md) but not ![alt](url) (images)
    segment.text = segment.text.replace(
      /(?<!!)\[([^\]]+)\]\(([^)]+\.md(?:%20[^)]*)?)\)/g,
      (_match, display: string, href: string) => {
        // Decode percent-encoded spaces
        const decoded = decodeURIComponent(href);
        // Extract just the filename without .md extension and path
        const filename = decoded
          .replace(/\\/g, '/')
          .split('/')
          .pop()!
          .replace(/\.md$/, '');

        if (display === filename) {
          return `[[${filename}]]`;
        }
        return `[[${filename}|${display}]]`;
      },
    );
  }

  return segments.map((s) => s.text).join('');
}
