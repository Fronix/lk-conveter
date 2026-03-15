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

export function md2lk(
  inputPath: string,
  outputPath: string,
  sourceName: string,
): void {
  // Determine if input is a file or directory
  const inputStat = statSync(inputPath);
  const inputDir = inputStat.isDirectory() ? inputPath : dirname(inputPath);

  // Read _lk_meta.json — search inputDir and ancestors
  const metaPath = findMetaFile(inputDir);
  if (!metaPath) {
    throw new Error(
      `Could not find _lk_meta.json in ${inputDir} or any parent directory. Run lk2md first to generate metadata.`,
    );
  }

  let meta: LkMeta;
  try {
    const raw = JSON.parse(readFileSync(metaPath, 'utf-8'));
    if (raw.sources) {
      // Multi-source format
      const multiMeta = raw as LkMetaMulti;
      const sourceMeta = multiMeta.sources[sourceName];
      if (!sourceMeta) {
        const available = Object.keys(multiMeta.sources).join(', ');
        throw new Error(
          `Source "${sourceName}" not found in ${metaPath}. Available: ${available}`,
        );
      }
      meta = sourceMeta;
    } else {
      // Old single-source format
      meta = raw as LkMeta;
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes('not found in')) throw e;
    throw new Error(
      `Could not read ${metaPath}. Run lk2md first to generate metadata.`,
    );
  }

  const isSingleFile = inputStat.isFile();
  console.log(`Reading markdown files from ${inputPath}...`);

  // Find all .md files — single file or recursive directory scan
  const mdFiles = isSingleFile ? [inputPath] : findMdFiles(inputDir);
  console.log(`Found ${mdFiles.length} markdown files`);

  // Parse each file into a resource
  const resources: LkResource[] = [];

  for (const filePath of mdFiles) {
    const content = readFileSync(filePath, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(content);
    const lk = frontmatter.lk as Record<string, unknown> | undefined;

    if (!lk || !lk.id) {
      console.warn(`Skipping ${filePath}: no lk metadata in frontmatter`);
      continue;
    }

    // Filter by source — skip resources from other .lk exports
    // When converting a single file, skip the filter (user explicitly chose this file)
    const fileSource = lk.source as string | undefined;
    if (!isSingleFile && fileSource && fileSource !== sourceName) {
      console.warn(
        `Skipping ${filePath}: source "${fileSource}" does not match "${sourceName}"`,
      );
      continue;
    }

    // Split body into document sections
    const sections = splitDocumentSections(body);
    const docMetas = (lk.documents as Array<Record<string, unknown>>) || [];

    // Build documents
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

      // Convert markdown content to ProseMirror
      process.stderr.write(`  Converting ${filePath} doc ${i}...\r`);
      const docType = (docMeta.presentation as { documentType: string })
        ?.documentType;
      const sectionContent = section.content.trim();

      // Blank documents with no real content should stay as empty objects
      const pmDoc =
        docType === 'blank' && !sectionContent
          ? ({} as any)
          : mdToProsemirror(section.content);

      // LK import ignores content for documents with type/documentType "blank",
      // treating them as empty pages. Rewrite to "page" so content is preserved.
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

    // Sort documents by pos
    documents.sort((a, b) => a.pos.localeCompare(b.pos));

    // Build resource
    const resource: LkResource = {
      schemaVersion: (lk.schemaVersion as number) || 1,
      id: lk.id as string,
      name: (lk.name as string) || extractResourceName(filePath, inputDir),
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

    resources.push(resource);
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

function extractResourceName(filePath: string, _baseDir: string): string {
  // The resource name is the filename without .md extension
  return basename(filePath, '.md');
}

function normalizeTags(tags: unknown): string[] {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.map(String);
  if (typeof tags === 'string') return [tags];
  return [];
}
