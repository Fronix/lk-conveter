import type { ProseMirrorMark, ProseMirrorNode } from '../shared/types.js';

/**
 * Convert a markdown string back to a ProseMirror document node.
 * This is a custom parser that handles our directive syntax (:::) and
 * HTML comments for metadata preservation.
 */
export function mdToProsemirror(markdown: string): ProseMirrorNode {
  const lines = markdown.split('\n');
  const parser = new MarkdownParser(lines);
  const content = parser.parseBlocks();
  return { type: 'doc', content };
}

class MarkdownParser {
  private lines: string[];
  private pos: number;

  constructor(lines: string[]) {
    this.lines = lines;
    this.pos = 0;
  }

  private peek(): string | undefined {
    return this.lines[this.pos];
  }

  private peekLine(): string {
    const line = this.lines[this.pos];
    if (line === undefined) {
      throw new Error('Unexpected end of input');
    }
    return line;
  }

  private advance(): string {
    return this.lines[this.pos++];
  }

  private atEnd(): boolean {
    return this.pos >= this.lines.length;
  }

  parseBlocks(): ProseMirrorNode[] {
    const nodes: ProseMirrorNode[] = [];
    while (!this.atEnd()) {
      const line = this.peekLine();

      // Skip blank lines
      if (line.trim() === '') {
        this.advance();
        continue;
      }

      const node = this.parseBlock();
      if (node) {
        if (Array.isArray(node)) {
          nodes.push(...node);
        } else {
          nodes.push(node);
        }
      }
    }
    return nodes;
  }

  private parseBlock(): ProseMirrorNode | ProseMirrorNode[] | null {
    const line = this.peekLine();

    // Empty paragraph marker
    if (line === '<!-- empty -->') {
      this.advance();
      return { type: 'paragraph', content: [] };
    }

    // Whitespace-only paragraph marker
    const wsMatch = line.match(/^<!-- lk-ws: (.+) -->$/);
    if (wsMatch) {
      this.advance();
      try {
        const ws = JSON.parse(wsMatch[1]);
        return { type: 'paragraph', content: [{ type: 'text', text: ws }] };
      } catch {
        return { type: 'paragraph', content: [] };
      }
    }

    // Directive blocks (:::)
    if (line.startsWith(':::')) {
      return this.parseDirective();
    }

    // HTML comments (block-level metadata only)
    if (
      line.startsWith('<!-- lk-') &&
      !line.startsWith('<!-- lk-inline:') &&
      !line.startsWith('<!-- lk-link:') &&
      !line.startsWith('<!-- lk-mention:') &&
      !line.startsWith('<!-- lk-pm:')
    ) {
      return this.parseHtmlComment();
    }

    // Heading
    if (line.match(/^#{1,6}\s/)) {
      return this.parseHeading();
    }

    // Heading with empty content (just ##)
    if (line.match(/^#{1,6}$/)) {
      return this.parseHeading();
    }

    // Horizontal rule
    if (
      line.match(/^---\s*$/) ||
      line.match(/^\*\*\*\s*$/) ||
      line.match(/^___\s*$/)
    ) {
      this.advance();
      return { type: 'rule' };
    }

    // Blockquote
    if (line.startsWith('> ') || line === '>') {
      return this.parseBlockquote();
    }

    // Bullet list
    if (line.match(/^[-*]\s/)) {
      return this.parseBulletList();
    }

    // Ordered list
    if (line.match(/^\d+\.\s/)) {
      return this.parseOrderedList();
    }

    // Task list
    if (line.match(/^- \[[ xX]\]\s/)) {
      return this.parseTaskList();
    }

    // Code block
    if (line.startsWith('```')) {
      return this.parseCodeBlock();
    }

    // Table
    if (line.startsWith('|')) {
      return this.parseTable();
    }

    // Image with preceding lk-media comment
    if (line.startsWith('![')) {
      return this.parseImage();
    }

    // Default: paragraph
    return this.parseParagraph();
  }

  // Directive parsing (:::panel-*, :::secret, :::layout, :::col-*, :::expand, :::extension)
  private parseDirective(): ProseMirrorNode | null {
    const openLine = this.advance();
    const match = openLine.match(/^:::([\w-]+)\s*(.*)?$/);
    if (!match) return null;

    const directive = match[1];
    const arg = (match[2] || '').trim();

    // Closing ::: for a parent directive (col or layout end)
    // This should not happen at top level, but just in case
    if (directive === '' || openLine.trim() === ':::') {
      return null;
    }

    // Panel
    if (directive.startsWith('panel-')) {
      const panelType = directive.slice('panel-'.length);
      const content = this.parseUntilClose();
      return {
        type: 'panel',
        attrs: { panelType },
        content,
      };
    }

    // Secret
    if (directive === 'secret') {
      const content = this.parseUntilClose();
      const params: Record<string, string> = {
        extensionTitle: arg || 'Secret',
      };
      return {
        type: 'bodiedExtension',
        attrs: {
          extensionType: 'com.algorific.legendkeeper.extensions',
          extensionKey: 'block-secret',
          parameters: params,
          layout: 'default',
        },
        content,
      };
    }

    // Extension (generic bodied)
    if (directive === 'extension') {
      const content = this.parseUntilClose();
      let attrs: Record<string, unknown> = {
        extensionType: '',
        extensionKey: '',
        parameters: {},
        layout: 'default',
      };
      if (arg) {
        try {
          attrs = JSON.parse(arg);
        } catch {}
      }
      return { type: 'bodiedExtension', attrs, content };
    }

    // Expand
    if (directive === 'expand') {
      // Parse expand attrs from inline comment if present
      let expandTitle = arg;
      const expandAttrs: Record<string, unknown> = {};
      const expandMetaMatch = arg.match(/^(.*?)\s*<!-- lk-expand: (.+) -->$/);
      if (expandMetaMatch) {
        expandTitle = expandMetaMatch[1].trim();
        try {
          Object.assign(expandAttrs, JSON.parse(expandMetaMatch[2]));
        } catch {}
      }
      const content = this.parseUntilClose();
      return {
        type: 'expand',
        attrs: { title: expandTitle, ...expandAttrs },
        content,
      };
    }

    // Layout section
    if (directive === 'layout') {
      return this.parseLayoutSection();
    }

    // Column (shouldn't appear at top level, but handle gracefully)
    if (directive.startsWith('col-')) {
      const width = parseFloat(directive.slice('col-'.length)) || 50;
      const content = this.parseUntilClose();
      return {
        type: 'layoutColumn',
        attrs: { width },
        content,
      };
    }

    // Unknown directive
    const content = this.parseUntilClose();
    return {
      type: 'bodiedExtension',
      attrs: {
        extensionType: directive,
        extensionKey: '',
        parameters: {},
        layout: 'default',
      },
      content,
    };
  }

  private parseLayoutSection(): ProseMirrorNode {
    const columns: ProseMirrorNode[] = [];

    while (!this.atEnd()) {
      const line = this.peekLine();

      // End of layout section
      if (line.trim() === ':::') {
        this.advance();
        break;
      }

      // Skip blank lines
      if (line.trim() === '') {
        this.advance();
        continue;
      }

      // Column
      const colMatch = line.match(/^:::col-([\d.]+)/);
      if (colMatch) {
        this.advance();
        const width = parseFloat(colMatch[1]);
        const content = this.parseUntilClose();
        columns.push({
          type: 'layoutColumn',
          attrs: { width },
          content,
        });
      } else {
        // Unexpected content inside layout — just skip
        this.advance();
      }
    }

    return {
      type: 'layoutSection',
      content: columns,
    };
  }

  private parseUntilClose(): ProseMirrorNode[] {
    const subLines: string[] = [];
    let depth = 0;

    while (!this.atEnd()) {
      const line = this.peekLine();
      // Strip whitespace AND list prefixes to detect nested directives
      const stripped = line.replace(/^[\s\-*]*/, '');

      // Track nested directives (at any indentation/prefix level)
      if (stripped.match(/^:::\w/)) {
        depth++;
        subLines.push(this.advance());
      } else if (stripped === ':::') {
        if (depth === 0) {
          this.advance(); // consume closing :::
          break;
        }
        depth--;
        subLines.push(this.advance());
      } else {
        subLines.push(this.advance());
      }
    }

    // Parse the collected lines as blocks
    const subParser = new MarkdownParser(subLines);
    return subParser.parseBlocks();
  }

  // HTML comment metadata
  private parseHtmlComment(): ProseMirrorNode | ProseMirrorNode[] | null {
    const line = this.advance();

    // lk-media comment followed by image
    const mediaMatch = line.match(/^<!-- lk-media: (.+) -->$/);
    if (mediaMatch) {
      const nextLine = this.peek();
      if (nextLine?.startsWith('![')) {
        return this.parseImageWithMeta(mediaMatch[1]);
      }
      // Orphan media comment — preserve
      return null;
    }

    // lk-table comment followed by table
    const tableMatch = line.match(/^<!-- lk-table: (.+) -->$/);
    if (tableMatch) {
      return this.parseTable(tableMatch[1]);
    }

    // lk-ext (non-bodied extension)
    const extMatch = line.match(/^<!-- lk-ext: (.+) -->$/);
    if (extMatch) {
      try {
        const attrs = JSON.parse(extMatch[1]);
        return { type: 'extension', attrs };
      } catch {}
    }

    // lk-tasklist
    const tasklistMatch = line.match(/^<!-- lk-tasklist: (.+) -->$/);
    if (tasklistMatch) {
      // Next should be task items
      return this.parseTaskList(tasklistMatch[1]);
    }

    // lk-unknown — restore original node
    const unknownMatch = line.match(/^<!-- lk-unknown: (.+) -->$/);
    if (unknownMatch) {
      try {
        return JSON.parse(unknownMatch[1]) as ProseMirrorNode;
      } catch {}
    }

    return null;
  }

  // Heading
  private parseHeading(): ProseMirrorNode {
    const line = this.advance();
    const match = line.match(/^(#{1,6})\s(.*?)(?:\s*\{#(.+)\})?$/);
    if (!match) {
      // Bare heading (e.g., "##" with no content)
      const bareMatch = line.match(/^(#{1,6})$/);
      if (bareMatch) {
        return {
          type: 'heading',
          attrs: { level: bareMatch[1].length },
          content: [],
        };
      }
      return { type: 'heading', attrs: { level: 2 }, content: [] };
    }
    const level = match[1].length;
    const text = match[2];
    const id = match[3];

    const attrs: Record<string, unknown> = { level };
    if (id) attrs.id = id;

    // Check if next line is a raw PM content marker
    const nextLine = this.peek();
    const pmMatch = nextLine?.match(/^<!-- lk-pm: (.+) -->$/);
    if (pmMatch) {
      this.advance();
      try {
        const content = JSON.parse(pmMatch[1]);
        return { type: 'heading', attrs, content };
      } catch {}
    }

    const content = text ? parseInline(text) : [];
    return { type: 'heading', attrs, content };
  }

  // Blockquote
  private parseBlockquote(): ProseMirrorNode {
    const lines: string[] = [];
    while (!this.atEnd()) {
      const line = this.peekLine();
      if (line.startsWith('> ')) {
        lines.push(this.advance().slice(2));
      } else if (line === '>') {
        lines.push(this.advance().slice(1));
      } else {
        break;
      }
    }

    const subParser = new MarkdownParser(lines);
    const content = subParser.parseBlocks();
    return { type: 'blockquote', content };
  }

  // Bullet list
  private parseBulletList(): ProseMirrorNode {
    const items: ProseMirrorNode[] = [];

    while (!this.atEnd()) {
      const line = this.peekLine();
      const match = line.match(/^[-*]\s(.*)$/);
      if (!match) break;

      this.advance();
      const itemLines = [match[1]];

      // Collect continuation lines (indented by 2+)
      while (!this.atEnd()) {
        const next = this.peekLine();
        if (next.match(/^ {2}/)) {
          itemLines.push(this.advance().slice(2));
        } else if (next.trim() === '') {
          // Check if next non-blank line is still a continuation
          const lookahead = this.lines[this.pos + 1];
          if (lookahead?.match(/^ {2}/)) {
            itemLines.push(this.advance()); // blank line
          } else {
            break;
          }
        } else {
          break;
        }
      }

      const subParser = new MarkdownParser(itemLines);
      const content = subParser.parseBlocks();
      items.push({ type: 'listItem', content });
    }

    return { type: 'bulletList', content: items };
  }

  // Ordered list
  private parseOrderedList(): ProseMirrorNode {
    const items: ProseMirrorNode[] = [];

    while (!this.atEnd()) {
      const line = this.peekLine();
      const match = line.match(/^(\d+)\.\s(.*)$/);
      if (!match) break;

      this.advance();
      const numLen = match[1].length + 2; // "1. " = 3 chars
      const itemLines = [match[2]];

      while (!this.atEnd()) {
        const next = this.peekLine();
        if (next.match(new RegExp(`^${' '.repeat(numLen)}`))) {
          itemLines.push(this.advance().slice(numLen));
        } else if (next.trim() === '') {
          const lookahead = this.lines[this.pos + 1];
          if (lookahead?.match(new RegExp(`^${' '.repeat(numLen)}`))) {
            itemLines.push(this.advance());
          } else {
            break;
          }
        } else {
          break;
        }
      }

      const subParser = new MarkdownParser(itemLines);
      const content = subParser.parseBlocks();
      items.push({ type: 'listItem', content });
    }

    return { type: 'orderedList', content: items };
  }

  // Task list
  private parseTaskList(metaJson?: string): ProseMirrorNode {
    const items: ProseMirrorNode[] = [];
    let listAttrs: Record<string, unknown> = {};

    if (metaJson) {
      try {
        listAttrs = JSON.parse(metaJson);
      } catch {}
    }

    while (!this.atEnd()) {
      const line = this.peekLine();
      const match = line.match(
        /^- \[([ xX])\]\s(.*?)(?:\s*<!-- lk-task: (.+) -->)?$/,
      );
      if (!match) break;

      this.advance();
      const state = match[1] === ' ' ? 'TODO' : 'DONE';
      const text = match[2];
      let taskAttrs: Record<string, unknown> = { state };

      if (match[3]) {
        try {
          const meta = JSON.parse(match[3]);
          taskAttrs = { ...taskAttrs, ...meta };
        } catch {}
      }

      const content = parseInline(text);
      items.push({
        type: 'taskItem',
        attrs: taskAttrs,
        content: [{ type: 'paragraph', content }],
      });
    }

    return {
      type: 'taskList',
      attrs: listAttrs,
      content: items,
    };
  }

  // Code block
  private parseCodeBlock(): ProseMirrorNode {
    const openLine = this.advance();
    const lang = openLine.slice(3).trim();
    const lines: string[] = [];

    while (!this.atEnd()) {
      const line = this.peekLine();
      if (line.startsWith('```')) {
        this.advance();
        break;
      }
      lines.push(this.advance());
    }

    const text = lines.join('\n');
    const attrs: Record<string, unknown> = {};
    if (lang) attrs.language = lang;

    return {
      type: 'codeBlock',
      attrs,
      content: text ? [{ type: 'text', text }] : [],
    };
  }

  // Table
  private parseTable(tableMetaJson?: string): ProseMirrorNode | null {
    const rows: string[][] = [];

    while (!this.atEnd()) {
      const line = this.peekLine();
      if (!line.startsWith('|')) break;
      this.advance();

      // Skip separator row (must contain at least one dash)
      if (line.match(/^\|[\s-:|]+\|$/) && line.includes('-')) continue;

      const cells = line
        .slice(1, -1) // remove leading/trailing |
        .split('|')
        .map((c) => c.trim().replace(/\\\|/g, '|'));
      rows.push(cells);
    }

    if (rows.length === 0) return null;

    // Parse table metadata
    if (tableMetaJson) {
      try {
        const meta = JSON.parse(tableMetaJson);
        const { __rows, __syntheticHeader, ...tableAttrs } = meta;
        // If raw rows are stored, use them directly for lossless round-trip
        if (__rows) {
          return { type: 'table', attrs: tableAttrs, content: __rows };
        }
      } catch {}
    }

    // Fallback: parse from markdown table (no metadata available)
    const tableContent: ProseMirrorNode[] = [];
    for (let i = 0; i < rows.length; i++) {
      const rowCells = rows[i].map((cellText) => ({
        type: (i === 0 ? 'tableHeader' : 'tableCell') as string,
        attrs: {},
        content: [
          { type: 'paragraph' as const, content: parseInline(cellText) },
        ],
      }));
      tableContent.push({ type: 'tableRow', content: rowCells });
    }

    return {
      type: 'table',
      attrs: { isNumberColumnEnabled: false, layout: 'default' },
      content: tableContent,
    };
  }

  // Image (standalone, without preceding media comment)
  private parseImage(): ProseMirrorNode | null {
    return this.parseImageWithMeta(undefined);
  }

  // Image with optional media metadata
  private parseImageWithMeta(
    metaJson: string | undefined,
  ): ProseMirrorNode | null {
    const line = this.advance();
    const match = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (!match) return null;

    const alt = match[1];
    const url = match[2];

    let mediaAttrs: Record<string, unknown> = {
      id: '',
      type: 'external',
      collection: '',
      url,
      __external: false,
    };
    let singleAttrs: Record<string, unknown> = { layout: 'center' };

    if (metaJson) {
      try {
        const meta = JSON.parse(metaJson);
        if (meta.media) {
          mediaAttrs = { ...mediaAttrs, ...meta.media, url };
        }
        if (meta.single) {
          singleAttrs = { ...singleAttrs, ...meta.single };
        }
      } catch {}
    }

    if (alt && alt !== 'image') mediaAttrs.alt = alt;

    return {
      type: 'mediaSingle',
      attrs: singleAttrs,
      content: [
        {
          type: 'media',
          attrs: mediaAttrs,
        },
      ],
    };
  }

  // Paragraph
  private parseParagraph(): ProseMirrorNode {
    const lines: string[] = [];

    while (!this.atEnd()) {
      const line = this.peekLine();
      if (line.trim() === '') break;
      // Stop at block-level elements
      if (
        line.startsWith('#') ||
        line.startsWith(':::') ||
        line.startsWith('```') ||
        line.startsWith('|') ||
        line.startsWith('> ') ||
        line === '>' ||
        line.startsWith('- ') ||
        line.startsWith('* ') ||
        line.match(/^\d+\.\s/) ||
        line.startsWith('---') ||
        line.startsWith('![') ||
        (line.startsWith('<!-- lk-') &&
          !line.startsWith('<!-- lk-inline:') &&
          !line.startsWith('<!-- lk-link:') &&
          !line.startsWith('<!-- lk-mention:') &&
          !line.startsWith('<!-- lk-pm:'))
      ) {
        break;
      }
      lines.push(this.advance());
    }

    // Check if last line is a raw ProseMirror content marker
    const lastLine = lines[lines.length - 1];
    const pmMatch = lastLine?.match(/^<!-- lk-pm: (.+) -->$/);
    if (pmMatch) {
      try {
        const content = JSON.parse(pmMatch[1]);
        return { type: 'paragraph', content };
      } catch {}
    }

    const text = lines.join('\n');
    const content = parseInline(text);
    return { type: 'paragraph', content };
  }
}

// ============= Inline parsing =============

function parseInline(text: string): ProseMirrorNode[] {
  if (!text) return [];

  const nodes: ProseMirrorNode[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    // Mention: @[text](lk://id) <!-- lk-mention: {...} -->
    const mentionMatch = remaining.match(
      /^@\[([^\]]+)\]\(lk:\/\/([^)]*)\)(?:\s*<!-- lk-mention: (.+?) -->)?/,
    );
    if (mentionMatch) {
      let attrs: Record<string, unknown> = {
        id: mentionMatch[2],
        text: mentionMatch[1],
        alias: '',
        accessLevel: '',
        userType: '',
        documentId: '',
      };
      if (mentionMatch[3]) {
        try {
          const meta = JSON.parse(mentionMatch[3]);
          attrs = { ...attrs, ...meta, text: mentionMatch[1] };
        } catch {}
      }
      nodes.push({ type: 'mention', attrs });
      remaining = remaining.slice(mentionMatch[0].length);
      continue;
    }

    // Inline HTML comment (lk-inline, lk-link — skip as standalone)
    const inlineCommentMatch = remaining.match(/^<!-- lk-inline: (.+?) -->/);
    if (inlineCommentMatch) {
      try {
        const attrs = JSON.parse(inlineCommentMatch[1]);
        nodes.push({ type: 'inlineExtension', attrs });
      } catch {}
      remaining = remaining.slice(inlineCommentMatch[0].length);
      continue;
    }

    // Skip lk-link comments (these are attached to the preceding link, already handled)
    const linkCommentMatch = remaining.match(/^\s*<!-- lk-link: .+? -->/);
    if (linkCommentMatch) {
      remaining = remaining.slice(linkCommentMatch[0].length);
      continue;
    }

    // Hard break: <br> or <br/>
    const brMatch = remaining.match(/^<br\s*\/?>/);
    if (brMatch) {
      nodes.push({ type: 'hardBreak' });
      remaining = remaining.slice(brMatch[0].length);
      continue;
    }

    // Bold+Italic: ***text***
    const boldItalicMatch = remaining.match(/^\*\*\*(.+?)\*\*\*/);
    if (boldItalicMatch) {
      const innerNodes = parseInline(boldItalicMatch[1]);
      for (const n of innerNodes) {
        addMark(n, { type: 'strong', attrs: {} });
        addMark(n, { type: 'em', attrs: {} });
      }
      nodes.push(...innerNodes);
      remaining = remaining.slice(boldItalicMatch[0].length);
      continue;
    }

    // Bold: **text**
    const boldMatch = remaining.match(/^\*\*(.+?)\*\*/);
    if (boldMatch) {
      const innerNodes = parseInline(boldMatch[1]);
      for (const n of innerNodes) {
        addMark(n, { type: 'strong', attrs: {} });
      }
      nodes.push(...innerNodes);
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Italic: *text*
    const italicMatch = remaining.match(/^\*([^*]+?)\*/);
    if (italicMatch) {
      const innerNodes = parseInline(italicMatch[1]);
      for (const n of innerNodes) {
        addMark(n, { type: 'em', attrs: {} });
      }
      nodes.push(...innerNodes);
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // Strikethrough: ~~text~~
    const strikeMatch = remaining.match(/^~~(.+?)~~/);
    if (strikeMatch) {
      const innerNodes = parseInline(strikeMatch[1]);
      for (const n of innerNodes) {
        addMark(n, { type: 'strike', attrs: {} });
      }
      nodes.push(...innerNodes);
      remaining = remaining.slice(strikeMatch[0].length);
      continue;
    }

    // Underline: <u>text</u>
    const underlineMatch = remaining.match(/^<u>(.+?)<\/u>/);
    if (underlineMatch) {
      const innerNodes = parseInline(underlineMatch[1]);
      for (const n of innerNodes) {
        addMark(n, { type: 'underline', attrs: {} });
      }
      nodes.push(...innerNodes);
      remaining = remaining.slice(underlineMatch[0].length);
      continue;
    }

    // Inline code: `text`
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      nodes.push({
        type: 'text',
        text: codeMatch[1],
        marks: [{ type: 'code', attrs: {} }],
      });
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // Link: [text](url) possibly followed by <!-- lk-link: {...} -->
    const linkMatch = remaining.match(
      /^\[([^\]]*)\]\(([^)]+)\)(?:\s*<!-- lk-link: (.+?) -->)?/,
    );
    if (linkMatch) {
      const linkText = linkMatch[1];
      const href = linkMatch[2];
      const mark: ProseMirrorMark = { type: 'link', attrs: { href } };

      if (linkMatch[3]) {
        try {
          const meta = JSON.parse(linkMatch[3]);
          if ('__confluenceMetadata' in meta) {
            mark.attrs = {
              ...mark.attrs,
              __confluenceMetadata: meta.__confluenceMetadata,
            };
          }
        } catch {}
      }

      const innerNodes = parseInline(linkText);
      for (const n of innerNodes) {
        addMark(n, mark);
      }
      nodes.push(...innerNodes);
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    // Plain text — consume until next special character
    const plainMatch = remaining.match(/^[^*~`[<@]+/);
    if (plainMatch) {
      nodes.push({ type: 'text', text: plainMatch[0] });
      remaining = remaining.slice(plainMatch[0].length);
      continue;
    }

    // Single special char that didn't match any pattern — consume it
    nodes.push({ type: 'text', text: remaining[0] });
    remaining = remaining.slice(1);
  }

  // Merge adjacent text nodes with same marks
  return mergeTextNodes(nodes);
}

const markOrder: Record<string, number> = {
  link: 0,
  strong: 1,
  em: 2,
  strike: 3,
  underline: 4,
  code: 5,
};

function addMark(node: ProseMirrorNode, mark: ProseMirrorMark): void {
  if (node.type === 'text') {
    node.marks = node.marks || [];
    node.marks.push(mark);
    // Sort marks to match ProseMirror canonical order
    node.marks.sort(
      (a, b) => (markOrder[a.type] ?? 99) - (markOrder[b.type] ?? 99),
    );
  }
  // For non-text nodes (hardBreak, mention, etc.), marks don't apply
}

function mergeTextNodes(nodes: ProseMirrorNode[]): ProseMirrorNode[] {
  const result: ProseMirrorNode[] = [];
  for (const node of nodes) {
    const prev = result[result.length - 1];
    if (
      prev &&
      prev.type === 'text' &&
      node.type === 'text' &&
      marksEqual(prev.marks, node.marks)
    ) {
      prev.text = (prev.text || '') + (node.text || '');
    } else {
      result.push(node);
    }
  }
  return result;
}

function marksEqual(
  a: ProseMirrorMark[] | undefined,
  b: ProseMirrorMark[] | undefined,
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].type !== b[i].type) return false;
    if (JSON.stringify(a[i].attrs) !== JSON.stringify(b[i].attrs)) return false;
  }
  return true;
}
