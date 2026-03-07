import type { ProseMirrorMark, ProseMirrorNode } from '../shared/types.js';

interface ConvertContext {
  indent: string;
  insideBlockquote: boolean;
  insideList: boolean;
  insideTable: boolean;
}

const defaultContext: ConvertContext = {
  indent: '',
  insideBlockquote: false,
  insideList: false,
  insideTable: false,
};

export function prosemirrorToMd(node: ProseMirrorNode): string {
  const result = convertNode(node, defaultContext);
  // Clean up excessive blank lines
  return `${result.replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

function convertNode(node: ProseMirrorNode, ctx: ConvertContext): string {
  switch (node.type) {
    case 'doc':
      return convertChildren(node, ctx);
    case 'paragraph':
      return convertParagraph(node, ctx);
    case 'heading':
      return convertHeading(node, ctx);
    case 'blockquote':
      return convertBlockquote(node, ctx);
    case 'bulletList':
      return convertBulletList(node, ctx);
    case 'orderedList':
      return convertOrderedList(node, ctx);
    case 'listItem':
      return convertListItem(node, ctx);
    case 'taskList':
      return convertTaskList(node, ctx);
    case 'taskItem':
      return convertTaskItem(node, ctx);
    case 'rule':
      return '---\n\n';
    case 'hardBreak':
      return '<br>';
    case 'codeBlock':
      return convertCodeBlock(node, ctx);
    case 'table':
      return convertTable(node, ctx);
    case 'tableRow':
      return ''; // handled by table
    case 'tableHeader':
    case 'tableCell':
      return ''; // handled by table
    case 'panel':
      return convertPanel(node, ctx);
    case 'mediaSingle':
      return convertMediaSingle(node, ctx);
    case 'media':
      return ''; // handled by mediaSingle
    case 'layoutSection':
      return convertLayoutSection(node, ctx);
    case 'layoutColumn':
      return ''; // handled by layoutSection
    case 'expand':
      return convertExpand(node, ctx);
    case 'bodiedExtension':
      return convertBodiedExtension(node, ctx);
    case 'extension':
      return convertExtension(node, ctx);
    case 'text':
      return convertText(node);
    case 'mention':
      return convertMention(node);
    case 'inlineExtension':
      return convertInlineExtension(node);
    default:
      // Unknown node type — preserve as HTML comment with JSON
      return `<!-- lk-unknown: ${JSON.stringify(node)} -->\n\n`;
  }
}

function convertChildren(node: ProseMirrorNode, ctx: ConvertContext): string {
  if (!node.content) return '';
  return node.content.map((child) => convertNode(child, ctx)).join('');
}

function convertInlineChildren(
  node: ProseMirrorNode,
  ctx: ConvertContext,
): string {
  if (!node.content) return '';
  return node.content.map((child) => convertNode(child, ctx)).join('');
}

// Block nodes

function convertParagraph(node: ProseMirrorNode, ctx: ConvertContext): string {
  const text = convertInlineChildren(node, ctx);
  if (ctx.insideTable) return text;
  // Empty paragraphs need a marker for round-tripping
  if (!text) return '<!-- empty -->\n\n';
  // Whitespace-only paragraphs need a marker to avoid being treated as blank lines
  if (!text.trim()) return `<!-- lk-ws: ${JSON.stringify(text)} -->\n\n`;
  // For paragraphs with interleaved em/strong marks, store raw content
  // to avoid ambiguous * sequences in markdown
  if (hasComplexEmStrongMarks(node)) {
    return `${text}\n<!-- lk-pm: ${JSON.stringify(node.content)} -->\n\n`;
  }
  return `${text}\n\n`;
}

function hasComplexEmStrongMarks(node: ProseMirrorNode): boolean {
  if (!node.content) return false;
  const textNodes = node.content.filter((n) => n.type === 'text');
  if (textNodes.length < 2) return false;

  // Check if any text node has both em+strong
  const hasBothEmStrong = textNodes.some((n) => {
    const marks = n.marks || [];
    return (
      marks.some((m) => m.type === 'em') &&
      marks.some((m) => m.type === 'strong')
    );
  });
  if (!hasBothEmStrong) return false;

  // Check if mark sets differ among text nodes (interleaved)
  const markSigs = textNodes.map((n) => {
    const marks = (n.marks || []).filter(
      (m) => m.type === 'em' || m.type === 'strong',
    );
    return marks
      .map((m) => m.type)
      .sort()
      .join(',');
  });
  return new Set(markSigs).size > 1;
}

function convertHeading(node: ProseMirrorNode, ctx: ConvertContext): string {
  const level = (node.attrs?.level as number) || 1;
  const prefix = '#'.repeat(level);
  const text = convertInlineChildren(node, ctx);
  // Preserve heading ID if present
  const id = node.attrs?.id as string | undefined;
  const idSuffix = id ? ` {#${id}}` : '';
  // Empty headings: just output the hashes (parser handles this)
  if (!text && !id) return `${prefix}\n\n`;
  // For headings with interleaved em/strong marks, store raw content
  if (hasComplexEmStrongMarks(node)) {
    return `${prefix} ${text}${idSuffix}\n<!-- lk-pm: ${JSON.stringify(node.content)} -->\n\n`;
  }
  return `${prefix} ${text}${idSuffix}\n\n`;
}

function convertBlockquote(node: ProseMirrorNode, ctx: ConvertContext): string {
  const innerCtx: ConvertContext = { ...ctx, insideBlockquote: true };
  const content = convertChildren(node, innerCtx);
  // Prefix each line with >
  const lines = content.trimEnd().split('\n');
  const quoted = lines
    .map((line) => (line === '' ? '>' : `> ${line}`))
    .join('\n');
  return `${quoted}\n\n`;
}

function convertBulletList(node: ProseMirrorNode, ctx: ConvertContext): string {
  if (!node.content) return '';
  const items = node.content.map((item) => {
    const innerCtx: ConvertContext = { ...ctx, insideList: true };
    const content = convertChildren(item, innerCtx).replace(/\n+$/, '');
    const lines = content.split('\n');
    const first = `- ${lines[0]}`;
    const rest = lines.slice(1).map((l) => `  ${l}`);
    return [first, ...rest].join('\n');
  });
  return `${items.join('\n')}\n\n`;
}

function convertOrderedList(
  node: ProseMirrorNode,
  ctx: ConvertContext,
): string {
  if (!node.content) return '';
  const items = node.content.map((item, i) => {
    const innerCtx: ConvertContext = { ...ctx, insideList: true };
    const content = convertChildren(item, innerCtx).replace(/\n+$/, '');
    const lines = content.split('\n');
    const num = `${i + 1}.`;
    const first = `${num} ${lines[0]}`;
    const pad = ' '.repeat(num.length + 1);
    const rest = lines.slice(1).map((l) => `${pad}${l}`);
    return [first, ...rest].join('\n');
  });
  return `${items.join('\n')}\n\n`;
}

function convertListItem(node: ProseMirrorNode, ctx: ConvertContext): string {
  // Usually handled by bulletList/orderedList, but just in case
  return convertChildren(node, ctx);
}

function convertTaskList(node: ProseMirrorNode, ctx: ConvertContext): string {
  if (!node.content) return '';
  const localId = node.attrs?.localId as string | undefined;
  let result = '';
  if (localId) {
    result += `<!-- lk-tasklist: ${JSON.stringify({ localId })} -->\n`;
  }
  const items = node.content.map((item) => {
    const state = (item.attrs?.state as string) || 'TODO';
    const checked = state === 'DONE' ? 'x' : ' ';
    const itemLocalId = item.attrs?.localId as string | undefined;
    const innerCtx: ConvertContext = { ...ctx, insideList: true };
    const content = convertChildren(item, innerCtx).trimEnd();
    const lines = content.split('\n');
    let first = `- [${checked}] ${lines[0]}`;
    if (itemLocalId) {
      first += ` <!-- lk-task: ${JSON.stringify({ localId: itemLocalId })} -->`;
    }
    const rest = lines.slice(1).map((l) => `  ${l}`);
    return [first, ...rest].join('\n');
  });
  result += `${items.join('\n')}\n\n`;
  return result;
}

function convertTaskItem(node: ProseMirrorNode, ctx: ConvertContext): string {
  return convertChildren(node, ctx);
}

function convertCodeBlock(node: ProseMirrorNode, _ctx: ConvertContext): string {
  const lang = (node.attrs?.language as string) || '';
  const text = node.content?.map((c) => c.text || '').join('') || '';
  return `\`\`\`${lang}\n${text}\n\`\`\`\n\n`;
}

function convertTable(node: ProseMirrorNode, ctx: ConvertContext): string {
  if (!node.content) return '';

  const tableCtx: ConvertContext = { ...ctx, insideTable: true };
  const rows: string[][] = [];
  let headerRowCount = 0;

  for (const row of node.content) {
    if (row.type !== 'tableRow' || !row.content) continue;
    const cells: string[] = [];
    let isHeaderRow = true;
    for (const cell of row.content) {
      if (cell.type !== 'tableHeader') isHeaderRow = false;
      const text = convertChildren(cell, tableCtx)
        .trim()
        .replace(/\n/g, ' ')
        .replace(/\|/g, '\\|');
      cells.push(text);
    }
    if (isHeaderRow) headerRowCount++;
    rows.push(cells);
  }

  if (rows.length === 0) return '';

  // Determine column count from the widest row
  const colCount = Math.max(...rows.map((r) => r.length));

  // Pad rows to have equal columns
  for (const row of rows) {
    while (row.length < colCount) row.push('');
  }

  const lines: string[] = [];

  if (headerRowCount > 0) {
    lines.push(`| ${rows[0].map((c) => c || ' ').join(' | ')} |`);
    lines.push(`| ${rows[0].map(() => '---').join(' | ')} |`);
    for (let i = 1; i < rows.length; i++) {
      lines.push(`| ${rows[i].map((c) => c || ' ').join(' | ')} |`);
    }
  } else {
    // No header row — create empty header for valid markdown table
    lines.push(`| ${Array(colCount).fill(' ').join(' | ')} |`);
    lines.push(`| ${Array(colCount).fill('---').join(' | ')} |`);
    for (const row of rows) {
      lines.push(`| ${row.map((c) => c || ' ').join(' | ')} |`);
    }
  }

  // Store original table structure for lossless round-tripping
  const tableData: Record<string, unknown> = { ...(node.attrs || {}) };
  // Store the raw rows for exact reconstruction
  tableData.__rows = node.content;
  if (headerRowCount === 0) tableData.__syntheticHeader = true;

  const attrComment = `<!-- lk-table: ${JSON.stringify(tableData)} -->\n`;

  return `${attrComment + lines.join('\n')}\n\n`;
}

// Rich block types (directives)

function convertPanel(node: ProseMirrorNode, ctx: ConvertContext): string {
  const panelType = (node.attrs?.panelType as string) || 'info';
  const content = convertChildren(node, ctx).replace(/\n+$/, '');
  return `:::panel-${panelType}\n${content}\n:::\n\n`;
}

function convertExpand(node: ProseMirrorNode, ctx: ConvertContext): string {
  const title = (node.attrs?.title as string) || '';
  const content = convertChildren(node, ctx).replace(/\n+$/, '');
  // Preserve non-default attrs
  const extraAttrs: Record<string, unknown> = {};
  if (node.attrs?.__expanded !== undefined)
    extraAttrs.__expanded = node.attrs.__expanded;
  const attrComment =
    Object.keys(extraAttrs).length > 0
      ? ` <!-- lk-expand: ${JSON.stringify(extraAttrs)} -->`
      : '';
  return `:::expand ${title}${attrComment}\n${content}\n:::\n\n`;
}

function convertBodiedExtension(
  node: ProseMirrorNode,
  ctx: ConvertContext,
): string {
  const extensionKey = (node.attrs?.extensionKey as string) || '';
  const content = convertChildren(node, ctx).replace(/\n+$/, '');

  if (extensionKey === 'block-secret') {
    const title =
      (node.attrs?.parameters as Record<string, string>)?.extensionTitle || '';
    const titleSuffix = title && title !== 'Secret' ? ` ${title}` : '';
    return `:::secret${titleSuffix}\n${content}\n:::\n\n`;
  }

  // Generic bodied extension — preserve all attrs
  const attrs = { ...node.attrs };
  return `:::extension ${JSON.stringify(attrs)}\n${content}\n:::\n\n`;
}

function convertExtension(node: ProseMirrorNode, _ctx: ConvertContext): string {
  // Non-bodied extension — preserve as HTML comment
  return `<!-- lk-ext: ${JSON.stringify(node.attrs)} -->\n\n`;
}

function convertLayoutSection(
  node: ProseMirrorNode,
  ctx: ConvertContext,
): string {
  if (!node.content) return '';

  const columns = node.content.filter((c) => c.type === 'layoutColumn');
  if (columns.length === 0) return convertChildren(node, ctx);

  let result = ':::layout\n';
  for (const col of columns) {
    const width = (col.attrs?.width as number) || 50;
    const content = convertChildren(col, ctx).replace(/\n+$/, '');
    result += `:::col-${width}\n${content}\n:::\n\n`;
  }
  result += ':::\n\n';
  return result;
}

function convertMediaSingle(
  node: ProseMirrorNode,
  _ctx: ConvertContext,
): string {
  const media = node.content?.find((c) => c.type === 'media');
  if (!media) return '';

  const url = (media.attrs?.url as string) || '';
  const alt = (media.attrs?.alt as string) || 'image';

  // Collect attrs that need preserving for round-trip
  const preserveAttrs: Record<string, unknown> = {};
  const mediaAttrs = media.attrs || {};
  if (mediaAttrs.id) preserveAttrs.id = mediaAttrs.id;
  if (mediaAttrs.type) preserveAttrs.type = mediaAttrs.type;
  if (mediaAttrs.collection !== undefined)
    preserveAttrs.collection = mediaAttrs.collection;
  if (mediaAttrs.__external !== undefined)
    preserveAttrs.__external = mediaAttrs.__external;
  if ('width' in mediaAttrs) preserveAttrs.width = mediaAttrs.width;

  const singleAttrs: Record<string, unknown> = {};
  if (node.attrs?.layout) singleAttrs.layout = node.attrs.layout;
  if (node.attrs && 'width' in node.attrs) singleAttrs.width = node.attrs.width;

  const combined = { media: preserveAttrs, single: singleAttrs };
  const comment = `<!-- lk-media: ${JSON.stringify(combined)} -->`;

  return `${comment}\n![${alt}](${url})\n\n`;
}

// Inline nodes

function convertText(node: ProseMirrorNode): string {
  let text = node.text || '';
  const marks = node.marks || [];

  // Filter out typeAheadQuery marks (autocomplete artifacts)
  const activeMmarks = marks.filter((m) => m.type !== 'typeAheadQuery');

  // Apply marks in a specific order for consistent nesting
  // Order: link wraps everything, then strong, em, strike, underline, code
  const sortedMarks = [...activeMmarks].sort((a, b) => {
    const order: Record<string, number> = {
      link: 0,
      strong: 1,
      em: 2,
      strike: 3,
      underline: 4,
      code: 5,
    };
    return (order[a.type] ?? 99) - (order[b.type] ?? 99);
  });

  for (const mark of sortedMarks.reverse()) {
    text = applyMark(text, mark);
  }

  return text;
}

function applyMark(text: string, mark: ProseMirrorMark): string {
  switch (mark.type) {
    case 'strong':
      return `**${text}**`;
    case 'em':
      return `*${text}*`;
    case 'code':
      return `\`${text}\``;
    case 'strike':
      return `~~${text}~~`;
    case 'underline':
      return `<u>${text}</u>`;
    case 'link': {
      const href = (mark.attrs?.href as string) || '';
      let suffix = '';
      if (mark.attrs && '__confluenceMetadata' in mark.attrs) {
        suffix = ` <!-- lk-link: ${JSON.stringify({ __confluenceMetadata: mark.attrs.__confluenceMetadata })} -->`;
      }
      return `[${text}](${href})${suffix}`;
    }
    default:
      return text;
  }
}

function convertMention(node: ProseMirrorNode): string {
  const text =
    (node.attrs?.text as string) || (node.attrs?.alias as string) || 'mention';
  const id = (node.attrs?.id as string) || '';

  // Preserve all mention attrs for round-tripping
  const attrs: Record<string, unknown> = {};
  if (node.attrs) {
    for (const [key, val] of Object.entries(node.attrs)) {
      if (key !== 'text') attrs[key] = val;
    }
  }

  return `@[${text}](lk://${id}) <!-- lk-mention: ${JSON.stringify(attrs)} -->`;
}

function convertInlineExtension(node: ProseMirrorNode): string {
  return `<!-- lk-inline: ${JSON.stringify(node.attrs)} -->`;
}
