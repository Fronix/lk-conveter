import { isImageFile } from './vault-scanner.js';

const CALLOUT_MAP: Record<string, string> = {
  note: 'info',
  info: 'info',
  abstract: 'info',
  summary: 'info',
  tldr: 'info',
  tip: 'info',
  hint: 'info',
  important: 'info',
  warning: 'warning',
  caution: 'warning',
  attention: 'warning',
  danger: 'error',
  error: 'error',
  bug: 'error',
  failure: 'error',
  fail: 'error',
  missing: 'error',
  success: 'success',
  check: 'success',
  done: 'success',
  question: 'note',
  help: 'note',
  faq: 'note',
  quote: 'note',
  cite: 'note',
  example: 'info',
};

export function preprocessObsidian(
  markdown: string,
  noteLookup: Map<string, string>,
): { markdown: string; inlineTags: string[] } {
  // Split into code-protected segments to avoid transforming inside code
  const segments = splitCodeSegments(markdown);
  const inlineTags: string[] = [];

  for (const segment of segments) {
    if (segment.isCode) continue;

    // Strip Obsidian comments %%...%%
    segment.text = segment.text.replace(/%%[\s\S]*?%%/g, '');

    // Strip highlight markers ==text== -> text
    segment.text = segment.text.replace(/==([\s\S]*?)==/g, '$1');

    // Convert image embeds ![[file.png]] and ![[file.png|alt]]
    segment.text = segment.text.replace(
      /!\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]/g,
      (_match, target: string, alt: string | undefined) => {
        const trimmed = target.trim();
        if (isImageFile(trimmed)) {
          const altText = alt?.trim() || trimmed;
          return `![${altText}](${encodePathForMd(trimmed)})`;
        }
        // Non-image embed: convert to link
        const display = alt?.trim() || trimmed;
        const resolved = resolveNote(trimmed, noteLookup);
        return `[${display}](${encodePathForMd(resolved)})`;
      },
    );

    // Convert wiki-links [[Note]] and [[Note|Display]]
    segment.text = segment.text.replace(
      /\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]/g,
      (_match, target: string, display: string | undefined) => {
        const trimmed = target.trim();
        const text = display?.trim() || trimmed;
        const resolved = resolveNote(trimmed, noteLookup);
        return `[${text}](${encodePathForMd(resolved)})`;
      },
    );

    // Extract inline tags #tag (not inside headings or at line start after #)
    segment.text = segment.text.replace(
      /(?<=\s|^)#([\w/-]+)/gm,
      (_match, tag: string) => {
        // Don't match heading markers (handled by being after whitespace or start)
        // Heading lines start with # followed by space, but our regex requires
        // the char after # to be a word char, so "# Heading" won't match
        inlineTags.push(tag);
        return '';
      },
    );
  }

  // Rejoin segments
  let result = segments.map((s) => s.text).join('');

  // Convert callouts (block-level transformation)
  result = convertCallouts(result);

  return { markdown: result, inlineTags: dedupe(inlineTags) };
}

interface Segment {
  text: string;
  isCode: boolean;
}

function splitCodeSegments(markdown: string): Segment[] {
  const segments: Segment[] = [];
  // Match fenced code blocks and inline code
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

function resolveNote(name: string, lookup: Map<string, string>): string {
  // Try exact match (case-insensitive)
  const resolved = lookup.get(name.toLowerCase());
  if (resolved) return resolved;
  // Fallback: treat as-is with .md extension
  return name.endsWith('.md') ? name : `${name}.md`;
}

function encodePathForMd(path: string): string {
  // Encode spaces and special chars for markdown link URLs
  return path.replace(/ /g, '%20');
}

function convertCallouts(markdown: string): string {
  const lines = markdown.split('\n');
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const calloutMatch = lines[i].match(
      /^>\s*\[!(\w+)\]\s*(.*?)$/i,
    );

    if (calloutMatch) {
      const [, type, title] = calloutMatch;
      const panelType = CALLOUT_MAP[type.toLowerCase()] || 'info';
      const contentLines: string[] = [];

      if (title.trim()) {
        contentLines.push(`**${title.trim()}**`);
        contentLines.push('');
      }

      // Collect subsequent blockquote lines
      i++;
      while (i < lines.length && /^>\s?(.*)$/.test(lines[i])) {
        const lineContent = lines[i].replace(/^>\s?/, '');
        contentLines.push(lineContent);
        i++;
      }

      // Remove trailing empty lines inside the panel
      while (
        contentLines.length > 0 &&
        contentLines[contentLines.length - 1].trim() === ''
      ) {
        contentLines.pop();
      }

      result.push(`:::panel-${panelType}`);
      result.push(...contentLines);
      result.push(':::');
      result.push('');
    } else {
      result.push(lines[i]);
      i++;
    }
  }

  return result.join('\n');
}

function dedupe(arr: string[]): string[] {
  return [...new Set(arr)];
}
