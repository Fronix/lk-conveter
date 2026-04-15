import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { md2lk } from '../src/md2lk/index.js';
import type { LkExport, LkMeta } from '../src/shared/types.js';

const TMP = join(__dirname, '__tmp_md2lk_synthesize__');

const META: LkMeta = {
  version: 1,
  exportId: 'test-export',
  exportedAt: '2025-01-01',
  calendars: [],
  resourceCount: 1,
  hash: 'abc',
  skippedDocuments: {},
};

// Existing folder self-file: Quests/Quests.md (resource id "res-quests")
const EXISTING_QUESTS_SELF = `---
lk:
  source: TestSource
  id: res-quests
  name: Quests
  schemaVersion: 1
  pos: a0
  iconColor: "#fff"
  iconGlyph: folder
  iconShape: square
  isHidden: false
  isLocked: false
  showPropertyBar: true
  banner: null
  properties: []
  documents:
    - id: doc-quests
      name: Main
      pos: a0
      type: page
      isFirst: true
      isHidden: false
      locatorId: loc-quests
      createdAt: "2025-01-01"
      updatedAt: "2025-01-02"
      transforms: []
      sources: []
      presentation:
        documentType: page
---

Quests overview
`;

const NEW_NOTE_BARE = `# Dragon Slayer

A new quest the user wrote from scratch.
`;

const NEW_NOTE_WITH_TAGS = `---
tags: [lore, dragons]
aliases: [Slayer]
---

The hero who slays dragons.
`;

function readLkOutput(path: string): LkExport {
  const compressed = readFileSync(path);
  const json = gunzipSync(compressed).toString('utf-8');
  return JSON.parse(json);
}

describe('md2lk synthesizes metadata for new files', () => {
  beforeAll(() => {
    rmSync(TMP, { recursive: true, force: true });

    // Layout:
    // TMP/
    //   _lk_meta.json
    //   Quests/
    //     Quests.md            (existing self-file)
    //     Dragon Slayer.md     (new — should become child of Quests)
    //   Lore/                  (new folder, no self-file)
    //     Heroes/              (new sub-folder)
    //       Hero.md            (new — Lore and Heroes should be synthesized)
    const questDir = join(TMP, 'Quests');
    const heroDir = join(TMP, 'Lore', 'Heroes');
    mkdirSync(questDir, { recursive: true });
    mkdirSync(heroDir, { recursive: true });

    writeFileSync(join(TMP, '_lk_meta.json'), JSON.stringify(META));
    writeFileSync(join(questDir, 'Quests.md'), EXISTING_QUESTS_SELF);
    writeFileSync(join(questDir, 'Dragon Slayer.md'), NEW_NOTE_BARE);
    writeFileSync(join(heroDir, 'Hero.md'), NEW_NOTE_WITH_TAGS);
  });

  afterAll(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('attaches a bare new file to its existing parent folder resource', () => {
    const out = join(TMP, 'mixed.lk');
    md2lk(TMP, out, 'TestSource');
    expect(existsSync(out)).toBe(true);

    const result = readLkOutput(out);
    const dragon = result.resources.find((r) => r.name === 'Dragon Slayer');
    expect(dragon).toBeDefined();
    expect(dragon!.parentId).toBe('res-quests');
    expect(dragon!.id).toBeTruthy();
    expect(dragon!.documents).toHaveLength(1);
    // Document content reflects the markdown body
    const text = JSON.stringify(dragon!.documents[0].content);
    expect(text).toContain('Dragon Slayer');
  });

  it('synthesizes a chain of folder resources for new nested folders', () => {
    const out = join(TMP, 'mixed.lk');
    md2lk(TMP, out, 'TestSource');

    const result = readLkOutput(out);
    const lore = result.resources.find((r) => r.name === 'Lore');
    const heroes = result.resources.find((r) => r.name === 'Heroes');
    const hero = result.resources.find((r) => r.name === 'Hero');

    expect(lore).toBeDefined();
    expect(heroes).toBeDefined();
    expect(hero).toBeDefined();

    // Lore is a top-level synthesized folder (no parent in our input)
    expect(lore!.parentId).toBeUndefined();
    expect(heroes!.parentId).toBe(lore!.id);
    expect(hero!.parentId).toBe(heroes!.id);
  });

  it('respects frontmatter tags and aliases on new files', () => {
    const out = join(TMP, 'mixed.lk');
    md2lk(TMP, out, 'TestSource');

    const hero = readLkOutput(out).resources.find((r) => r.name === 'Hero')!;
    expect(hero.tags).toEqual(['lore', 'dragons']);
    expect(hero.aliases).toEqual(['Slayer']);
  });

  it('works on a fully-new directory with no _lk_meta.json', () => {
    const fresh = join(TMP, 'fresh-vault');
    mkdirSync(fresh, { recursive: true });
    mkdirSync(join(fresh, 'Notes'), { recursive: true });
    writeFileSync(join(fresh, 'Notes', 'First.md'), '# First\n\nHello\n');
    writeFileSync(join(fresh, 'Top Level.md'), '# Top\n\nWorld\n');

    const out = join(TMP, 'fresh.lk');
    md2lk(fresh, out, 'fresh-vault');

    const result = readLkOutput(out);
    const names = result.resources.map((r) => r.name).sort();
    expect(names).toEqual(['First', 'Notes', 'Top Level']);
    const notes = result.resources.find((r) => r.name === 'Notes')!;
    const first = result.resources.find((r) => r.name === 'First')!;
    expect(first.parentId).toBe(notes.id);
  });
});
