import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { stringify as yamlStringify } from 'yaml';
import type { LkDocument, LkExport, LkResource } from '../shared/types.js';
import { SKIPPED_DOC_TYPES } from '../shared/types.js';
import { decompressLk } from '../lk2md/decompress.js';
import { prosemirrorToMd } from '../lk2md/prosemirror-to-md.js';
import {
  type ResourceTreeNode,
  buildResourceTree,
  computeFilePaths,
  flattenTree,
} from '../lk2md/resource-tree.js';
import { postprocessForObsidian } from './postprocess.js';

export interface LkInput {
  inputPath: string;
  outputDir: string;
  sourceName: string;
}

interface DecompressedSource {
  input: LkInput;
  data: LkExport;
  allNodes: ResourceTreeNode[];
}

export function lk2obsidian(inputs: LkInput[]): void {
  // Pass 1: Decompress all files and build global lookup
  const sources: DecompressedSource[] = [];
  const globalLookup = new Map<string, string>();

  for (const input of inputs) {
    console.log(`Reading ${input.inputPath}...`);
    const data = decompressLk(input.inputPath);
    console.log(
      `Found ${data.resources.length} resources in ${input.sourceName}`,
    );

    const roots = buildResourceTree(data.resources);
    computeFilePaths(roots, input.outputDir);
    const allNodes = flattenTree(roots);

    // Add to global lookup: resourceId → resource name, documentId → resource name
    for (const node of allNodes) {
      const name = node.resource.name;
      globalLookup.set(node.resource.id, name);
      for (const doc of node.resource.documents) {
        globalLookup.set(doc.id, name);
        if (doc.locatorId) {
          globalLookup.set(doc.locatorId, name);
        }
      }
    }

    sources.push({ input, data, allNodes });
  }

  // Pass 2: Convert and write
  for (const source of sources) {
    let writtenCount = 0;
    let skippedCount = 0;

    for (const node of source.allNodes) {
      const resource = node.resource;

      // Separate convertible and skipped documents
      const convertibleDocs: LkDocument[] = [];
      for (const doc of resource.documents) {
        if (SKIPPED_DOC_TYPES.has(doc.presentation.documentType)) {
          skippedCount++;
        } else {
          convertibleDocs.push(doc);
        }
      }

      if (convertibleDocs.length === 0) continue;

      // Build clean Obsidian frontmatter
      const frontmatter = buildObsidianFrontmatter(resource);

      // Convert each document to markdown and post-process
      const docSections: string[] = [];
      for (const doc of convertibleDocs) {
        const isEmptyContent =
          !doc.content.type &&
          (!doc.content.content || doc.content.content.length === 0);
        const rawMd = isEmptyContent ? '' : prosemirrorToMd(doc.content);
        const md = postprocessForObsidian(rawMd, globalLookup);

        if (convertibleDocs.length > 1) {
          // Multi-document: use heading instead of lk-doc comment
          docSections.push(`## ${doc.name}\n\n${md}`);
        } else {
          docSections.push(md);
        }
      }

      const body = docSections.join('\n---\n\n');

      // Assemble file content
      let content: string;
      if (Object.keys(frontmatter).length > 0) {
        content = `---\n${yamlStringify(frontmatter).trim()}\n---\n\n${body}`;
      } else {
        content = body;
      }

      mkdirSync(dirname(node.filePath), { recursive: true });
      writeFileSync(node.filePath, content, 'utf-8');
      writtenCount++;
    }

    console.log(
      `${source.input.sourceName}: written ${writtenCount} files, ${skippedCount} documents skipped (map/time/board)`,
    );
  }
}

function buildObsidianFrontmatter(
  resource: LkResource,
): Record<string, unknown> {
  const fm: Record<string, unknown> = {};
  if (resource.tags.length > 0) fm.tags = resource.tags;
  if (resource.aliases.length > 0) fm.aliases = resource.aliases;
  return fm;
}
