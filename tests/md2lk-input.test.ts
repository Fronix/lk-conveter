import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { LkExport, LkMeta } from '../src/shared/types.js';
import { md2lk } from '../src/md2lk/index.js';

const TMP = join(__dirname, '__tmp_md2lk_input__');

const META: LkMeta = {
  version: 1,
  exportId: 'test-export',
  exportedAt: '2025-01-01',
  calendars: [],
  resourceCount: 2,
  hash: 'abc',
  skippedDocuments: {},
};

const MD_QUEST = `---
lk:
  source: TestSource
  id: res-quest
  name: "Quest - The Vaults"
  schemaVersion: 1
  pos: a0
  iconColor: "#fff"
  iconGlyph: sword
  iconShape: circle
  isHidden: false
  isLocked: false
  showPropertyBar: true
  banner: null
  properties: []
  documents:
    - id: doc1
      name: Main
      pos: a0
      type: page
      isFirst: true
      isHidden: false
      locatorId: loc1
      createdAt: "2025-01-01"
      updatedAt: "2025-01-02"
      transforms: []
      sources: []
      presentation:
        documentType: page
---

Hello from the quest
`;

const MD_NPC = `---
lk:
  source: TestSource
  id: res-npc
  name: "NPC - Aldric"
  schemaVersion: 1
  pos: a1
  iconColor: "#000"
  iconGlyph: user
  iconShape: square
  isHidden: false
  isLocked: false
  showPropertyBar: true
  banner: null
  properties: []
  documents:
    - id: doc2
      name: Main
      pos: a0
      type: page
      isFirst: true
      isHidden: false
      locatorId: loc2
      createdAt: "2025-01-01"
      updatedAt: "2025-01-02"
      transforms: []
      sources: []
      presentation:
        documentType: page
---

Hello from the NPC
`;

function readLkOutput(path: string): LkExport {
  const compressed = readFileSync(path);
  const json = gunzipSync(compressed).toString('utf-8');
  return JSON.parse(json);
}

describe('md2lk input modes', () => {
  beforeAll(() => {
    rmSync(TMP, { recursive: true, force: true });

    // Create directory structure:
    // __tmp__/
    //   _lk_meta.json
    //   Quests/
    //     Quest - The Vaults.md
    //   NPCs/
    //     NPC - Aldric.md
    const questDir = join(TMP, 'Quests');
    const npcDir = join(TMP, 'NPCs');
    mkdirSync(questDir, { recursive: true });
    mkdirSync(npcDir, { recursive: true });

    writeFileSync(join(TMP, '_lk_meta.json'), JSON.stringify(META));
    writeFileSync(join(questDir, 'Quest - The Vaults.md'), MD_QUEST);
    writeFileSync(join(npcDir, 'NPC - Aldric.md'), MD_NPC);
  });

  afterAll(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('converts a directory with multiple files', () => {
    const outPath = join(TMP, 'dir-output.lk');
    md2lk(TMP, outPath, 'TestSource');

    expect(existsSync(outPath)).toBe(true);
    const result = readLkOutput(outPath);
    expect(result.resources).toHaveLength(2);

    const names = result.resources.map((r) => r.name).sort();
    expect(names).toEqual(['NPC - Aldric', 'Quest - The Vaults']);
  });

  it('converts a single .md file', () => {
    const singleFile = join(TMP, 'Quests', 'Quest - The Vaults.md');
    const outPath = join(TMP, 'single-output.lk');
    md2lk(singleFile, outPath, 'TestSource');

    expect(existsSync(outPath)).toBe(true);
    const result = readLkOutput(outPath);
    expect(result.resources).toHaveLength(1);
    expect(result.resources[0].name).toBe('Quest - The Vaults');
    expect(result.resources[0].id).toBe('res-quest');
  });

  it('single file finds _lk_meta.json in ancestor directory', () => {
    const singleFile = join(TMP, 'NPCs', 'NPC - Aldric.md');
    const outPath = join(TMP, 'ancestor-meta-output.lk');
    // _lk_meta.json is in TMP, file is in TMP/NPCs — should find it
    md2lk(singleFile, outPath, 'TestSource');

    const result = readLkOutput(outPath);
    expect(result.resources).toHaveLength(1);
    expect(result.resources[0].name).toBe('NPC - Aldric');
  });

  it('single file produces valid document content', () => {
    const singleFile = join(TMP, 'Quests', 'Quest - The Vaults.md');
    const outPath = join(TMP, 'content-check.lk');
    md2lk(singleFile, outPath, 'TestSource');

    const result = readLkOutput(outPath);
    const doc = result.resources[0].documents[0];
    expect(doc.content.type).toBe('doc');
    const text = doc.content.content?.[0]?.content?.[0]?.text;
    expect(text).toBe('Hello from the quest');
  });

  it('directory still processes subdirectories recursively', () => {
    const outPath = join(TMP, 'recursive-output.lk');
    md2lk(TMP, outPath, 'TestSource');

    const result = readLkOutput(outPath);
    // Should find files in both Quests/ and NPCs/ subdirectories
    expect(result.resources).toHaveLength(2);
  });

  it('single file ignores source name mismatch', () => {
    // When converting a single file, the source filter should be skipped
    // even if sourceName doesn't match lk.source in the frontmatter
    const singleFile = join(TMP, 'Quests', 'Quest - The Vaults.md');
    const outPath = join(TMP, 'source-mismatch.lk');
    // File has source "TestSource" but we pass "WrongSource"
    md2lk(singleFile, outPath, 'WrongSource');

    const result = readLkOutput(outPath);
    expect(result.resources).toHaveLength(1);
    expect(result.resources[0].name).toBe('Quest - The Vaults');
  });

  it('directory filters by source name', () => {
    const outPath = join(TMP, 'source-filter.lk');
    // All files have source "TestSource", passing "OtherSource" should match none
    md2lk(TMP, outPath, 'OtherSource');

    const result = readLkOutput(outPath);
    expect(result.resources).toHaveLength(0);
  });
});
