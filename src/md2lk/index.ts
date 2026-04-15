import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import type {
  LkDocument,
  LkExport,
  LkMeta,
  LkMetaMulti,
  LkResource,
} from '../shared/types.js';
// LkMetaMulti kept for backward compat with old meta files
import { compressLk } from './compress.js';
import { parseFrontmatter, splitDocumentSections } from './frontmatter.js';
import { mdToProsemirror } from './md-to-prosemirror.js';
import {
  buildEmptyDocument,
  buildFolderToIdMap,
  buildNewDocument,
  buildNewResource,
  isNewFile,
  newPos,
  normalizeStringArray,
  type ParsedFile,
  relPath,
  resolveParentId,
  synthesizeFolderEntries,
} from './synthesize.js';

export function md2lk(
  inputPath: string,
  outputPath: string,
  sourceName: string,
): void {
  // Determine if input is a file or directory
  const inputStat = statSync(inputPath);
  const inputDir = inputStat.isDirectory() ? inputPath : dirname(inputPath);

  // Read _lk_meta.json — search inputDir and ancestors. Missing meta is
  // tolerated when all input files are new (synthesized from scratch).
  const metaPath = findMetaFile(inputDir);
  const meta = loadMeta(metaPath, sourceName);

  const isSingleFile = inputStat.isFile();
  console.log(`Reading markdown files from ${inputPath}...`);

  // Find all .md files — single file or recursive directory scan
  const mdFiles = isSingleFile ? [inputPath] : findMdFiles(inputDir);
  console.log(`Found ${mdFiles.length} markdown files`);

  // Pre-parse all files so we can build folder mappings before processing
  const parsedFiles: ParsedFile[] = mdFiles.map((filePath) => {
    const content = readFileSync(filePath, 'utf-8');
    return { filePath, ...parseFrontmatter(content) };
  });

  // Filter parsed files for processing — same source filter as before, but
  // applied here so synthesis only considers files we'd actually emit.
  const inScope = parsedFiles.filter((file) => {
    const lk = file.frontmatter.lk as Record<string, unknown> | undefined;
    if (!lk?.id) return true; // new files have no source — always in scope
    if (isSingleFile) return true; // explicit file pick bypasses source filter
    const fileSource = lk.source as string | undefined;
    if (fileSource && fileSource !== sourceName) {
      console.warn(
        `Skipping ${file.filePath}: source "${fileSource}" does not match "${sourceName}"`,
      );
      return false;
    }
    return true;
  });

  const newFiles = inScope.filter(isNewFile);
  const folderToId = buildFolderToIdMap(inScope);
  const syntheticFolders = synthesizeFolderEntries(
    newFiles,
    folderToId,
    inputDir,
  );

  if (newFiles.length > 0 || syntheticFolders.size > 0) {
    console.log(
      `Synthesizing metadata for ${newFiles.length} new file(s)` +
        (syntheticFolders.size > 0
          ? ` and ${syntheticFolders.size} new folder(s)`
          : ''),
    );
  }

  const resources: LkResource[] = [];

  // Process files first — new files that act as a folder self-file will
  // claim (and remove) the matching synthesized folder slot so we don't
  // emit two resources sharing the same id.
  for (const file of inScope) {
    const { filePath, frontmatter, body } = file;
    const lk = frontmatter.lk as Record<string, unknown> | undefined;

    if (!lk?.id) {
      resources.push(
        buildResourceFromNewFile(
          filePath,
          frontmatter,
          body,
          inputDir,
          folderToId,
          syntheticFolders,
          isSingleFile,
        ),
      );
      continue;
    }

    resources.push(
      buildResourceFromExistingFile(
        filePath,
        frontmatter,
        body,
        meta,
        isSingleFile,
      ),
    );
  }

  // Emit any synthetic folder resources that were not claimed by a self-file.
  for (const entry of syntheticFolders.values()) {
    resources.push(
      buildNewResource({
        id: entry.id,
        name: entry.name,
        parentId: entry.parentId,
        pos: newPos(entry.name),
        tags: [],
        aliases: [],
        documents: [buildEmptyDocument()],
      }),
    );
  }

  // Build export
  const exportData: LkExport = {
    version: meta.version,
    exportId: meta.exportId,
    exportedAt: meta.exportedAt,
    resources,
    calendars: meta.calendars,
    resourceCount: resources.length,
    hash: meta.hash,
  };

  compressLk(exportData, outputPath);
  console.log(`Written ${outputPath} (${resources.length} resources)`);
}

function buildResourceFromExistingFile(
  filePath: string,
  frontmatter: Record<string, unknown>,
  body: string,
  meta: LkMeta,
  isSingleFile: boolean,
): LkResource {
  const lk = frontmatter.lk as Record<string, unknown>;

  const sections = splitDocumentSections(body);
  const docMetas = (lk.documents as Array<Record<string, unknown>>) || [];

  const documents: LkDocument[] = [];

  for (let i = 0; i < docMetas.length; i++) {
    const docMeta = docMetas[i];
    const section = sections[i];

    if (!section) {
      console.warn(
        `Missing section ${i} for document ${docMeta.name} in ${filePath}`,
      );
      continue;
    }

    process.stderr.write(`  Converting ${filePath} doc ${i}...\r`);
    const docType = (docMeta.presentation as { documentType: string })
      ?.documentType;
    const sectionContent = section.content.trim();

    const pmDoc =
      docType === 'blank' && !sectionContent
        ? ({} as LkDocument['content'])
        : mdToProsemirror(section.content);

    const effectiveDocMeta = { ...docMeta };
    if (docType === 'blank' && sectionContent) {
      effectiveDocMeta.type = 'page';
      effectiveDocMeta.presentation = { documentType: 'page' };
    }

    documents.push({
      ...effectiveDocMeta,
      content: pmDoc,
    } as LkDocument);
  }

  // Add skipped documents back (maps, timelines, boards)
  const resourceId = lk.id as string;
  for (const [_key, skipped] of Object.entries(meta.skippedDocuments)) {
    if (skipped.resourceId === resourceId) {
      documents.push(skipped.document);
    }
  }

  documents.sort((a, b) => a.pos.localeCompare(b.pos));

  return {
    schemaVersion: (lk.schemaVersion as number) || 1,
    id: resourceId,
    name: (lk.name as string) || extractResourceName(filePath),
    parentId: lk.parentId as string | undefined,
    pos: lk.pos as string,
    aliases: (frontmatter.aliases as string[]) || [],
    tags: normalizeTags(frontmatter.tags),
    banner: lk.banner as LkResource['banner'],
    createdBy: lk.createdBy as string | undefined,
    iconColor: lk.iconColor as string,
    iconGlyph: lk.iconGlyph as string,
    iconShape: lk.iconShape as string,
    isHidden: isSingleFile ? true : (lk.isHidden as boolean),
    isLocked: lk.isLocked as boolean,
    showPropertyBar: lk.showPropertyBar as boolean,
    properties: (lk.properties as LkResource['properties']) || [],
    documents,
  };
}

function buildResourceFromNewFile(
  filePath: string,
  frontmatter: Record<string, unknown>,
  body: string,
  inputDir: string,
  folderToId: Map<string, string>,
  syntheticFolders: ReturnType<typeof synthesizeFolderEntries>,
  isSingleFile: boolean,
): LkResource {
  const partialLk =
    (frontmatter.lk as Record<string, unknown> | undefined) ?? {};

  const fileBase = basename(filePath, '.md');
  const folder = resolve(dirname(filePath));

  // If this new file is the self-file for an already-synthesized folder
  // (Folder/Folder.md), adopt that folder's id so any children link to us
  // instead of a phantom folder resource.
  let id: string;
  let parentId: string | undefined;
  const synthEntry =
    basename(folder) === fileBase ? syntheticFolders.get(folder) : undefined;
  if (synthEntry) {
    id = synthEntry.id;
    parentId = synthEntry.parentId;
    syntheticFolders.delete(folder);
  } else {
    id = (partialLk.id as string | undefined) ?? randomUUID();
    parentId =
      (partialLk.parentId as string | undefined) ??
      resolveParentId(filePath, folderToId, syntheticFolders, inputDir);
  }

  const name =
    (typeof frontmatter.title === 'string' && frontmatter.title) ||
    (partialLk.name as string | undefined) ||
    fileBase;

  process.stderr.write(`  Converting ${relPath(filePath, inputDir)} (new)\r`);
  const pmDoc = body.trim()
    ? mdToProsemirror(body)
    : ({
        type: 'doc',
        content: [{ type: 'paragraph', content: [] }],
      } as LkDocument['content']);

  const resource = buildNewResource({
    id,
    name,
    parentId,
    pos: (partialLk.pos as string | undefined) ?? newPos(name),
    tags: normalizeTags(frontmatter.tags ?? frontmatter.tag),
    aliases: normalizeStringArray(frontmatter.aliases),
    documents: [buildNewDocument(pmDoc)],
  });
  if (isSingleFile) resource.isHidden = true;
  return resource;
}

/**
 * Load _lk_meta.json. When missing or unreadable for a fully-new directory,
 * fall back to a synthetic empty meta so md2lk still works.
 */
function loadMeta(metaPath: string | null, sourceName: string): LkMeta {
  if (!metaPath) {
    console.log(
      'No _lk_meta.json found — generating a fresh export header (treating all files as new).',
    );
    return defaultMeta();
  }
  try {
    const raw = JSON.parse(readFileSync(metaPath, 'utf-8'));
    if (raw.sources) {
      const multiMeta = raw as LkMetaMulti;
      const sourceMeta = multiMeta.sources[sourceName];
      if (!sourceMeta) {
        const available = Object.keys(multiMeta.sources).join(', ');
        throw new Error(
          `Source "${sourceName}" not found in ${metaPath}. Available: ${available}`,
        );
      }
      return sourceMeta;
    }
    return raw as LkMeta;
  } catch (e) {
    if (e instanceof Error && e.message.includes('not found in')) throw e;
    throw new Error(
      `Could not read ${metaPath}. Run lk2md first to generate metadata.`,
    );
  }
}

function defaultMeta(): LkMeta {
  return {
    version: 1,
    exportId: randomUUID(),
    exportedAt: new Date().toISOString(),
    calendars: [],
    resourceCount: 0,
    hash: '',
    skippedDocuments: {},
  };
}

function findMetaFile(startDir: string): string | null {
  let dir = resolve(startDir);
  while (true) {
    const candidate = join(dir, '_lk_meta.json');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null; // reached filesystem root
    dir = parent;
  }
}

function findMdFiles(dir: string): string[] {
  const results: string[] = [];

  function walk(d: string) {
    for (const entry of readdirSync(d)) {
      const fullPath = join(d, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (entry.endsWith('.md')) {
        results.push(fullPath);
      }
    }
  }

  walk(dir);
  return results;
}

function extractResourceName(filePath: string): string {
  return basename(filePath, '.md');
}

function normalizeTags(tags: unknown): string[] {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.map(String);
  if (typeof tags === 'string') return [tags];
  return [];
}
