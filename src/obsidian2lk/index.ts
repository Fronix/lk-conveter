import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type {
  LkDocument,
  LkExport,
  LkResource,
} from '../shared/types.js';
import { compressLk } from '../md2lk/compress.js';
import { parseFrontmatter } from '../md2lk/frontmatter.js';
import { mdToProsemirror } from '../md2lk/md-to-prosemirror.js';
import { buildHierarchy } from './hierarchy.js';
import { preprocessObsidian } from './preprocess.js';
import { buildNoteLookup, scanVault } from './vault-scanner.js';

export function obsidian2lk(vaultPath: string, outputPath: string): void {
  console.log(`Scanning Obsidian vault at ${vaultPath}...`);

  const notes = scanVault(vaultPath);
  if (notes.length === 0) {
    console.warn('No markdown files found in vault.');
    return;
  }
  console.log(`Found ${notes.length} notes`);

  const noteLookup = buildNoteLookup(notes);
  const hierarchy = buildHierarchy(notes);

  const resources: LkResource[] = [];

  for (const entry of hierarchy) {
    if (entry.isFolder) {
      // Folder resource: empty page document
      resources.push(
        buildResource(entry.id, entry.name, entry.parentId, entry.pos, {
          tags: [],
          aliases: [],
          documents: [buildEmptyDocument()],
        }),
      );
      continue;
    }

    const note = entry.note!;
    const content = readFileSync(note.absolutePath, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(content);

    // Extract tags from frontmatter (supports both `tags` and `tag` fields)
    const fmTags = normalizeTags(frontmatter.tags ?? frontmatter.tag);

    // Extract aliases
    const aliases = normalizeStringArray(frontmatter.aliases);

    // Preprocess Obsidian syntax
    const { markdown: preprocessed, inlineTags } = preprocessObsidian(
      body,
      noteLookup,
    );

    // Merge tags
    const allTags = dedupe([...fmTags, ...inlineTags]);

    // Convert markdown to ProseMirror
    process.stderr.write(`  Converting ${note.relativePath}...\r`);
    const pmDoc = preprocessed.trim()
      ? mdToProsemirror(preprocessed)
      : { type: 'doc' as const, content: [{ type: 'paragraph' as const, content: [] }] };

    // Use frontmatter `title` to override name if present
    const name =
      typeof frontmatter.title === 'string' && frontmatter.title
        ? frontmatter.title
        : entry.name;

    const doc = buildDocument(pmDoc);

    resources.push(
      buildResource(entry.id, name, entry.parentId, entry.pos, {
        tags: allTags,
        aliases,
        documents: [doc],
      }),
    );
  }

  const exportData: LkExport = {
    version: 1,
    exportId: randomUUID(),
    exportedAt: new Date().toISOString(),
    resources,
    calendars: [],
    resourceCount: resources.length,
    hash: '',
  };

  compressLk(exportData, outputPath);
  console.log(`\nWritten ${outputPath} (${resources.length} resources)`);
}

function buildResource(
  id: string,
  name: string,
  parentId: string | undefined,
  pos: string,
  opts: {
    tags: string[];
    aliases: string[];
    documents: LkDocument[];
  },
): LkResource {
  return {
    schemaVersion: 1,
    id,
    name,
    parentId,
    pos,
    aliases: opts.aliases,
    tags: opts.tags,
    banner: { enabled: false, url: '', yPosition: 50 },
    iconColor: '#6B7280',
    iconGlyph: 'file-text',
    iconShape: 'square',
    isHidden: false,
    isLocked: false,
    showPropertyBar: true,
    properties: [],
    documents: opts.documents,
  };
}

function buildDocument(content: LkDocument['content']): LkDocument {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    name: 'Main',
    pos: 'a0',
    type: 'page',
    isFirst: true,
    isHidden: false,
    locatorId: randomUUID(),
    createdAt: now,
    updatedAt: now,
    transforms: [],
    sources: [],
    presentation: { documentType: 'page' },
    content,
  };
}

function buildEmptyDocument(): LkDocument {
  return buildDocument({ type: 'doc', content: [{ type: 'paragraph', content: [] }] });
}

function normalizeTags(tags: unknown): string[] {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.map(String);
  if (typeof tags === 'string') return [tags];
  return [];
}

function normalizeStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') return [value];
  return [];
}

function dedupe(arr: string[]): string[] {
  return [...new Set(arr)];
}
