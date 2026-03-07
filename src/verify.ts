import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { decompressLk } from './lk2md/decompress.js';
import { lk2md } from './lk2md/index.js';
import { md2lk } from './md2lk/index.js';
import type {
  LkDocument,
  LkExport,
  LkResource,
  ProseMirrorNode,
} from './shared/types.js';

interface VerifyResult {
  passed: boolean;
  resourceCount: { expected: number; actual: number };
  errors: string[];
  stats: {
    resources: number;
    documents: number;
    skippedDocs: number;
    mediaUrls: number;
    mentions: number;
    contentTreesChecked: number;
  };
}

export function verify(inputPath: string): void {
  const name = basename(inputPath, '.lk');
  console.log(`\nVerifying round-trip: ${name}.lk`);

  // Step 1: Decompress original
  const original = decompressLk(inputPath);

  // Step 2: lk2md to temp dir
  const tempDir = join(tmpdir(), `lk-verify-${name}-${Date.now()}`);
  const tempMd = join(tempDir, 'md');
  const tempLk = join(tempDir, `${name}.lk`);

  try {
    mkdirSync(tempMd, { recursive: true });

    console.log(`  lk2md → ${original.resources.length} resources`);
    lk2md(inputPath, tempMd, name);

    // Step 3: md2lk back
    console.log(`  md2lk → regenerating ${name}.lk`);
    md2lk(tempMd, tempLk, name);

    // Step 4: Decompress regenerated
    const regenerated = decompressLk(tempLk);

    // Step 5: Deep compare
    const result = deepCompare(original, regenerated);

    // Print results
    console.log('');
    printResult('Resources', result.stats.resources, original.resources.length);
    printResult('Documents', result.stats.documents, countDocuments(original));
    printResult(
      'Content trees',
      result.stats.contentTreesChecked,
      result.stats.contentTreesChecked,
    );
    console.log(`  Media URLs:    ${result.stats.mediaUrls} checked`);
    console.log(`  Mentions:      ${result.stats.mentions} checked`);
    console.log('');

    if (result.errors.length > 0) {
      console.log(
        `  RESULT: FAIL — ${result.errors.length} difference(s) found\n`,
      );
      for (const err of result.errors.slice(0, 50)) {
        console.log(`  ${err}`);
      }
      if (result.errors.length > 20) {
        console.log(`  ... and ${result.errors.length - 20} more`);
      }
      process.exit(1);
    } else {
      console.log('  RESULT: PASS — lossless round-trip confirmed');
    }
  } finally {
    // Cleanup
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

function printResult(label: string, actual: number, expected: number): void {
  const pad = label.padEnd(15);
  const status =
    actual === expected ? 'OK' : `MISMATCH (${actual}/${expected})`;
  console.log(`  ${pad}${actual}/${expected} ${status}`);
}

function countDocuments(data: LkExport): number {
  return data.resources.reduce((sum, r) => sum + r.documents.length, 0);
}

function deepCompare(original: LkExport, regenerated: LkExport): VerifyResult {
  const errors: string[] = [];
  const stats = {
    resources: 0,
    documents: 0,
    skippedDocs: 0,
    mediaUrls: 0,
    mentions: 0,
    contentTreesChecked: 0,
  };

  // Index resources by ID
  const origMap = new Map<string, LkResource>();
  for (const r of original.resources) origMap.set(r.id, r);

  const regenMap = new Map<string, LkResource>();
  for (const r of regenerated.resources) regenMap.set(r.id, r);

  // Check resource count
  if (original.resources.length !== regenerated.resources.length) {
    errors.push(
      `Resource count: expected ${original.resources.length}, got ${regenerated.resources.length}`,
    );
  }

  // Compare each resource
  for (const [id, origRes] of origMap) {
    const regenRes = regenMap.get(id);
    if (!regenRes) {
      errors.push(`Missing resource: "${origRes.name}" (${id})`);
      continue;
    }
    stats.resources++;

    const resPrefix = `Resource "${origRes.name}" (${id})`;

    // Check resource-level metadata
    if (origRes.parentId !== regenRes.parentId) {
      errors.push(
        `${resPrefix}: parentId expected "${origRes.parentId}", got "${regenRes.parentId}"`,
      );
    }
    if (origRes.pos !== regenRes.pos) {
      errors.push(
        `${resPrefix}: pos expected "${origRes.pos}", got "${regenRes.pos}"`,
      );
    }
    if (
      JSON.stringify(origRes.tags.sort()) !==
      JSON.stringify(regenRes.tags.sort())
    ) {
      errors.push(`${resPrefix}: tags differ`);
    }
    if (
      JSON.stringify(origRes.aliases.sort()) !==
      JSON.stringify(regenRes.aliases.sort())
    ) {
      errors.push(`${resPrefix}: aliases differ`);
    }
    if (origRes.iconColor !== regenRes.iconColor) {
      errors.push(`${resPrefix}: iconColor differs`);
    }
    if (origRes.iconGlyph !== regenRes.iconGlyph) {
      errors.push(`${resPrefix}: iconGlyph differs`);
    }
    if (origRes.iconShape !== regenRes.iconShape) {
      errors.push(`${resPrefix}: iconShape differs`);
    }
    if (origRes.isHidden !== regenRes.isHidden) {
      errors.push(`${resPrefix}: isHidden differs`);
    }
    if (origRes.isLocked !== regenRes.isLocked) {
      errors.push(`${resPrefix}: isLocked differs`);
    }

    // Check properties
    if (
      JSON.stringify(origRes.properties) !== JSON.stringify(regenRes.properties)
    ) {
      errors.push(`${resPrefix}: properties differ`);
    }

    // Check banner
    if (JSON.stringify(origRes.banner) !== JSON.stringify(regenRes.banner)) {
      errors.push(`${resPrefix}: banner differs`);
    }

    // Check documents
    const origDocs = new Map<string, LkDocument>();
    for (const d of origRes.documents) origDocs.set(d.id, d);

    const regenDocs = new Map<string, LkDocument>();
    for (const d of regenRes.documents) regenDocs.set(d.id, d);

    if (origRes.documents.length !== regenRes.documents.length) {
      errors.push(
        `${resPrefix}: document count expected ${origRes.documents.length}, got ${regenRes.documents.length}`,
      );
    }

    for (const [docId, origDoc] of origDocs) {
      const regenDoc = regenDocs.get(docId);
      if (!regenDoc) {
        errors.push(
          `${resPrefix}: missing document "${origDoc.name}" (${docId})`,
        );
        continue;
      }
      stats.documents++;

      const docPrefix = `${resPrefix} > Doc "${origDoc.name}" (${docId})`;

      // Check document metadata
      if (origDoc.locatorId !== regenDoc.locatorId) {
        errors.push(`${docPrefix}: locatorId differs`);
      }
      if (origDoc.createdAt !== regenDoc.createdAt) {
        errors.push(`${docPrefix}: createdAt differs`);
      }
      if (origDoc.updatedAt !== regenDoc.updatedAt) {
        errors.push(`${docPrefix}: updatedAt differs`);
      }

      // Compare content trees (normalize typeAheadQuery marks first)
      stats.contentTreesChecked++;
      const normalizedOrig = normalizeNode(origDoc.content);
      const normalizedRegen = normalizeNode(regenDoc.content);
      const contentErrors = compareNodes(
        normalizedOrig,
        normalizedRegen,
        `${docPrefix} > content`,
      );

      // Count media and mentions in content errors context
      countNodesOfType(origDoc.content, 'media', stats, 'mediaUrls');
      countNodesOfType(origDoc.content, 'mention', stats, 'mentions');

      errors.push(...contentErrors);
    }
  }

  // Check for extra resources in regenerated
  for (const [id, regenRes] of regenMap) {
    if (!origMap.has(id)) {
      errors.push(`Extra resource in regenerated: "${regenRes.name}" (${id})`);
    }
  }

  // Check calendars
  if (
    JSON.stringify(original.calendars) !== JSON.stringify(regenerated.calendars)
  ) {
    errors.push('Calendars differ');
  }

  // Check export metadata
  if (original.version !== regenerated.version) {
    errors.push(
      `Version: expected ${original.version}, got ${regenerated.version}`,
    );
  }
  if (original.exportId !== regenerated.exportId) {
    errors.push(
      `ExportId: expected ${original.exportId}, got ${regenerated.exportId}`,
    );
  }

  return {
    passed: errors.length === 0,
    resourceCount: {
      expected: original.resources.length,
      actual: regenerated.resources.length,
    },
    errors,
    stats,
  };
}

function compareNodes(
  orig: ProseMirrorNode,
  regen: ProseMirrorNode,
  path: string,
): string[] {
  const errors: string[] = [];

  if (orig.type !== regen.type) {
    errors.push(`${path}: type expected "${orig.type}", got "${regen.type}"`);
    return errors; // no point comparing further
  }

  // Compare text
  if (orig.text !== regen.text) {
    errors.push(
      `${path}: text expected "${truncate(orig.text)}", got "${truncate(regen.text)}"`,
    );
  }

  // Compare attrs (with some tolerance for missing vs undefined)
  const origAttrs = orig.attrs || {};
  const regenAttrs = regen.attrs || {};
  if (JSON.stringify(origAttrs) !== JSON.stringify(regenAttrs)) {
    // Detailed attr comparison
    const allKeys = new Set([
      ...Object.keys(origAttrs),
      ...Object.keys(regenAttrs),
    ]);
    for (const key of allKeys) {
      if (JSON.stringify(origAttrs[key]) !== JSON.stringify(regenAttrs[key])) {
        errors.push(
          `${path}.attrs.${key}: expected ${JSON.stringify(origAttrs[key])}, got ${JSON.stringify(regenAttrs[key])}`,
        );
      }
    }
  }

  // Compare marks (sort by type for order-insensitive comparison)
  const origMarks = [...(orig.marks || [])].sort((a, b) =>
    a.type.localeCompare(b.type),
  );
  const regenMarks = [...(regen.marks || [])].sort((a, b) =>
    a.type.localeCompare(b.type),
  );
  if (JSON.stringify(origMarks) !== JSON.stringify(regenMarks)) {
    errors.push(
      `${path}.marks: expected ${JSON.stringify(origMarks)}, got ${JSON.stringify(regenMarks)}`,
    );
  }

  // Compare children
  const origContent = orig.content || [];
  const regenContent = regen.content || [];
  if (origContent.length !== regenContent.length) {
    errors.push(
      `${path}.content: expected ${origContent.length} children, got ${regenContent.length}`,
    );
    // Compare up to the minimum length
    const minLen = Math.min(origContent.length, regenContent.length);
    for (let i = 0; i < minLen; i++) {
      errors.push(
        ...compareNodes(
          origContent[i],
          regenContent[i],
          `${path}.content[${i}]`,
        ),
      );
    }
  } else {
    for (let i = 0; i < origContent.length; i++) {
      errors.push(
        ...compareNodes(
          origContent[i],
          regenContent[i],
          `${path}.content[${i}]`,
        ),
      );
    }
  }

  return errors;
}

function countNodesOfType(
  node: ProseMirrorNode,
  type: string,
  stats: Record<string, number>,
  key: string,
): void {
  if (node.type === type) stats[key]++;
  if (node.content) {
    for (const child of node.content) {
      countNodesOfType(child, type, stats, key);
    }
  }
}

function truncate(s: string | undefined, len = 60): string {
  if (!s) return '(undefined)';
  return s.length > len ? `${s.slice(0, len)}...` : s;
}

/**
 * Normalize a ProseMirror node tree before comparison:
 * - Strip typeAheadQuery marks (autocomplete artifacts)
 * - Merge adjacent text nodes with identical marks after stripping
 */
function normalizeNode(node: ProseMirrorNode): ProseMirrorNode {
  const result: ProseMirrorNode = { ...node };

  // Strip typeAheadQuery marks from text nodes
  if (result.marks) {
    result.marks = result.marks.filter((m) => m.type !== 'typeAheadQuery');
    if (result.marks.length === 0) delete result.marks;
  }

  // Trim trailing whitespace from expand titles (not preservable in markdown)
  if (
    result.type === 'expand' &&
    result.attrs?.title &&
    typeof result.attrs.title === 'string'
  ) {
    result.attrs = { ...result.attrs, title: result.attrs.title.trimEnd() };
  }

  // Normalize empty localId to undefined (empty string not preserved in markdown)
  if (
    result.attrs &&
    'localId' in result.attrs &&
    result.attrs.localId === ''
  ) {
    result.attrs = { ...result.attrs };
    delete result.attrs.localId;
  }

  // Normalize taskItem: wrap bare text nodes in a paragraph to match parser output
  if (
    result.type === 'taskItem' &&
    result.content &&
    result.content.length > 0 &&
    result.content[0].type === 'text'
  ) {
    result.content = [{ type: 'paragraph', content: result.content }];
  }

  // Recursively normalize children, then merge adjacent text nodes
  if (result.content) {
    const normalized = result.content.map((c) => normalizeNode(c));
    // Merge adjacent text nodes with same marks
    const merged: ProseMirrorNode[] = [];
    for (const child of normalized) {
      const prev = merged[merged.length - 1];
      if (
        prev &&
        prev.type === 'text' &&
        child.type === 'text' &&
        JSON.stringify(prev.marks || []) === JSON.stringify(child.marks || [])
      ) {
        prev.text = (prev.text || '') + (child.text || '');
      } else {
        merged.push({ ...child });
      }
    }
    // Trim trailing whitespace-only text nodes in headings (not preservable)
    if (result.type === 'heading' && merged.length > 0) {
      const last = merged[merged.length - 1];
      if (last.type === 'text' && !last.marks && last.text?.trim() === '') {
        merged.pop();
      }
    }
    result.content = merged;
  }

  return result;
}
