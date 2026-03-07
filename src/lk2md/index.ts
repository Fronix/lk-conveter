import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { stringify as yamlStringify } from 'yaml';
import type {
  LkDocument,
  LkMeta,
  LkMetaMulti,
  LkResource,
  SkippedDocument,
} from '../shared/types.js';
import { SKIPPED_DOC_TYPES } from '../shared/types.js';
import { decompressLk } from './decompress.js';
import { prosemirrorToMd } from './prosemirror-to-md.js';
import {
  buildResourceTree,
  computeFilePaths,
  flattenTree,
} from './resource-tree.js';

export function lk2md(
  inputPath: string,
  outputDir: string,
  sourceName: string,
): void {
  console.log(`Reading ${inputPath}...`);
  const data = decompressLk(inputPath);

  console.log(
    `Found ${data.resources.length} resources, ${data.calendars.length} calendars`,
  );

  // Build resource tree and compute file paths
  const roots = buildResourceTree(data.resources);
  computeFilePaths(roots, outputDir);
  const allNodes = flattenTree(roots);

  // Track skipped documents
  const skippedDocuments: Record<string, SkippedDocument> = {};
  let skippedCount = 0;
  let writtenCount = 0;

  for (const node of allNodes) {
    const resource = node.resource;

    // Separate convertible and skipped documents
    const convertibleDocs: LkDocument[] = [];
    for (const doc of resource.documents) {
      if (SKIPPED_DOC_TYPES.has(doc.presentation.documentType)) {
        const key = `${resource.id}:${doc.id}`;
        skippedDocuments[key] = { resourceId: resource.id, document: doc };
        skippedCount++;
      } else {
        convertibleDocs.push(doc);
      }
    }

    // Build frontmatter
    const frontmatter = buildFrontmatter(resource, convertibleDocs, sourceName);

    // Convert each convertible document to markdown
    const docSections: string[] = [];
    for (const doc of convertibleDocs) {
      // Blank documents with empty content ({}) — output empty body
      const isEmptyContent =
        !doc.content.type &&
        (!doc.content.content || doc.content.content.length === 0);
      const md = isEmptyContent ? '' : prosemirrorToMd(doc.content);
      if (convertibleDocs.length > 1) {
        docSections.push(`<!-- lk-doc: ${doc.name} -->\n\n${md}`);
      } else {
        docSections.push(md);
      }
    }

    // If all documents were skipped but resource still has metadata, write a minimal file
    const body =
      docSections.length > 0
        ? docSections.join('\n')
        : '<!-- All documents in this resource are non-text (map/timeline/board) -->\n';

    const content = `---\n${yamlStringify(frontmatter).trim()}\n---\n\n${body}`;

    // Write file
    mkdirSync(dirname(node.filePath), { recursive: true });
    writeFileSync(node.filePath, content, 'utf-8');
    writtenCount++;
  }

  // Write _lk_meta.json (multi-source: merge with existing)
  const sourceMeta: LkMeta = {
    version: data.version,
    exportId: data.exportId,
    exportedAt: data.exportedAt,
    calendars: data.calendars,
    resourceCount: data.resourceCount,
    hash: data.hash,
    skippedDocuments,
  };

  const metaPath = `${outputDir}/_lk_meta.json`;
  mkdirSync(dirname(metaPath), { recursive: true });

  // Read existing meta and merge
  let multiMeta: LkMetaMulti = { sources: {} };
  if (existsSync(metaPath)) {
    try {
      const existing = JSON.parse(readFileSync(metaPath, 'utf-8'));
      if (existing.sources) {
        multiMeta = existing as LkMetaMulti;
      } else {
        // Migrate old single-source format
        multiMeta = { sources: { [sourceName]: existing as LkMeta } };
      }
    } catch {}
  }
  multiMeta.sources[sourceName] = sourceMeta;

  writeFileSync(metaPath, JSON.stringify(multiMeta, null, 2), 'utf-8');

  console.log(
    `Written ${writtenCount} markdown files, ${skippedCount} documents skipped (map/time/board)`,
  );
  console.log(`Metadata written to ${metaPath}`);
}

function buildFrontmatter(
  resource: LkResource,
  convertibleDocs: LkDocument[],
  sourceName: string,
): Record<string, unknown> {
  const fm: Record<string, unknown> = {};

  // Top-level fields (Obsidian-compatible)
  if (resource.tags.length > 0) fm.tags = resource.tags;
  if (resource.aliases.length > 0) fm.aliases = resource.aliases;

  // LK metadata namespace
  const lk: Record<string, unknown> = {
    source: sourceName,
    id: resource.id,
    schemaVersion: resource.schemaVersion,
    pos: resource.pos,
    iconColor: resource.iconColor,
    iconGlyph: resource.iconGlyph,
    iconShape: resource.iconShape,
    isHidden: resource.isHidden,
    isLocked: resource.isLocked,
    showPropertyBar: resource.showPropertyBar,
    banner: resource.banner,
    properties: resource.properties,
  };

  if (resource.parentId) lk.parentId = resource.parentId;
  if (resource.createdBy) lk.createdBy = resource.createdBy;

  // Document metadata (IDs, timestamps — content is in the body)
  lk.documents = convertibleDocs.map((doc) => ({
    id: doc.id,
    name: doc.name,
    type: doc.type,
    pos: doc.pos,
    isFirst: doc.isFirst,
    isHidden: doc.isHidden,
    locatorId: doc.locatorId,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    presentation: doc.presentation,
    transforms: doc.transforms,
    sources: doc.sources,
  }));

  fm.lk = lk;

  return fm;
}
