import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { stringify as yamlStringify } from 'yaml';
import type {
  LkDocument,
  LkMeta,
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

  // Write _lk_meta.json into the source's own directory
  const sourceMeta: LkMeta = {
    version: data.version,
    exportId: data.exportId,
    exportedAt: data.exportedAt,
    calendars: data.calendars,
    resourceCount: data.resourceCount,
    hash: data.hash,
    skippedDocuments,
  };

  // Determine where this source's files live — common ancestor of all written files
  const metaDir = findCommonDir(allNodes.map((n) => dirname(n.filePath)));
  const metaPath = `${metaDir}/_lk_meta.json`;
  mkdirSync(metaDir, { recursive: true });

  writeFileSync(metaPath, JSON.stringify(sourceMeta, null, 2), 'utf-8');

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
    name: resource.name,
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

  // Document metadata (all properties except content, which goes in the body)
  lk.documents = convertibleDocs.map((doc) => {
    const { content: _content, ...meta } = doc;
    return meta;
  });

  fm.lk = lk;

  return fm;
}

function findCommonDir(dirs: string[]): string {
  if (dirs.length === 0) return '.';
  const resolved = dirs.map((d) => resolve(d));
  const parts = resolved[0].split(/[\\/]/);
  let common = parts.length;
  for (const dir of resolved.slice(1)) {
    const p = dir.split(/[\\/]/);
    common = Math.min(common, p.length);
    for (let i = 0; i < common; i++) {
      if (parts[i] !== p[i]) {
        common = i;
        break;
      }
    }
  }
  return parts.slice(0, common).join('/');
}
