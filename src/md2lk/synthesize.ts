import { randomUUID } from 'node:crypto';
import { basename, dirname, relative, resolve } from 'node:path';
import type { LkDocument, LkResource } from '../shared/types.js';
import type { ParsedMarkdown } from './frontmatter.js';

export interface ParsedFile extends ParsedMarkdown {
  filePath: string;
}

export interface FolderEntry {
  id: string;
  name: string;
  /** Absolute folder path */
  folderPath: string;
  /** True if no .md self-file exists for this folder — we synthesize a resource for it */
  isSynthetic: boolean;
  /** Resolved later */
  parentId?: string;
}

/**
 * A file is "new" when it lacks `lk.id` in its frontmatter.
 */
export function isNewFile(parsed: ParsedMarkdown): boolean {
  const lk = parsed.frontmatter.lk as Record<string, unknown> | undefined;
  return !lk?.id;
}

/**
 * Build a map of absolute folder path → existing resource id.
 *
 * A folder is owned by an existing resource when there is a self-file
 * `Folder/Folder.md` whose lk.id is set. Those resources are the ones
 * with children in the lk2md output convention.
 */
export function buildFolderToIdMap(files: ParsedFile[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const file of files) {
    const lk = file.frontmatter.lk as Record<string, unknown> | undefined;
    if (!lk?.id) continue;
    const fileBase = basename(file.filePath, '.md');
    const folder = resolve(dirname(file.filePath));
    if (basename(folder) === fileBase) {
      map.set(folder, lk.id as string);
    }
  }
  return map;
}

/**
 * For every folder that contains md files but has no existing self-file,
 * synthesize a folder entry. Walks parent chain so intermediate folders are
 * also created when needed (e.g., new files inside `Quests/Dragons/` when
 * neither Quests nor Dragons has a self-file).
 *
 * `inputDir` bounds the walk — we never synthesize folders above the input root.
 */
export function synthesizeFolderEntries(
  newFiles: ParsedFile[],
  existingFolders: Map<string, string>,
  inputDir: string,
): Map<string, FolderEntry> {
  const synthetic = new Map<string, FolderEntry>();
  const rootAbs = resolve(inputDir);

  for (const file of newFiles) {
    let folder = resolve(dirname(file.filePath));
    while (folder !== rootAbs && folder.startsWith(rootAbs)) {
      if (existingFolders.has(folder) || synthetic.has(folder)) break;
      synthetic.set(folder, {
        id: randomUUID(),
        name: basename(folder),
        folderPath: folder,
        isSynthetic: true,
      });
      const parent = dirname(folder);
      if (parent === folder) break;
      folder = parent;
    }
  }

  // Resolve each synthetic folder's parentId by walking up
  for (const entry of synthetic.values()) {
    const parent = dirname(entry.folderPath);
    entry.parentId = existingFolders.get(parent) ?? synthetic.get(parent)?.id;
  }

  return synthetic;
}

/**
 * Resolve the parentId for a new file by looking at its directory.
 * Walks up until it finds a folder owned by an existing or synthetic resource.
 */
export function resolveParentId(
  filePath: string,
  existingFolders: Map<string, string>,
  syntheticFolders: Map<string, FolderEntry>,
  inputDir: string,
): string | undefined {
  const rootAbs = resolve(inputDir);
  let folder = resolve(dirname(filePath));
  while (folder.startsWith(rootAbs)) {
    if (existingFolders.has(folder)) return existingFolders.get(folder);
    if (syntheticFolders.has(folder)) return syntheticFolders.get(folder)!.id;
    if (folder === rootAbs) return undefined;
    const parent = dirname(folder);
    if (parent === folder) return undefined;
    folder = parent;
  }
  return undefined;
}

/**
 * Generate a position string that sorts after typical LK fractional-index
 * positions. New siblings are alphabetically ordered among themselves.
 */
export function newPos(name: string): string {
  return `zzz_${name}`;
}

/**
 * Build a fresh LkResource for a new file or a synthesized folder.
 */
export function buildNewResource(opts: {
  id: string;
  name: string;
  parentId: string | undefined;
  pos: string;
  tags: string[];
  aliases: string[];
  documents: LkDocument[];
}): LkResource {
  return {
    schemaVersion: 1,
    id: opts.id,
    name: opts.name,
    parentId: opts.parentId,
    pos: opts.pos,
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

/**
 * Build a single-page LkDocument with the given ProseMirror content.
 */
export function buildNewDocument(content: LkDocument['content']): LkDocument {
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

/**
 * Empty page document — used for synthesized folder resources that have no body.
 */
export function buildEmptyDocument(): LkDocument {
  return buildNewDocument({
    type: 'doc',
    content: [{ type: 'paragraph', content: [] }],
  });
}

export function normalizeStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') return [value];
  return [];
}

/** Used in log lines so we don't dump absolute paths. */
export function relPath(filePath: string, inputDir: string): string {
  return relative(inputDir, filePath).replace(/\\/g, '/');
}
