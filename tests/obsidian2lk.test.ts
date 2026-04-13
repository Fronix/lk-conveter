import {
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildNoteLookup,
  scanVault,
} from '../src/obsidian2lk/vault-scanner.js';
import { buildHierarchy } from '../src/obsidian2lk/hierarchy.js';
import { obsidian2lk } from '../src/obsidian2lk/index.js';
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import type { LkExport } from '../src/shared/types.js';

const TMP = join(__dirname, '__tmp_obsidian2lk__');

beforeAll(() => {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
});

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true });
});

function createVault(basePath: string, files: Record<string, string>) {
  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(basePath, path);
    mkdirSync(join(fullPath, '..'), { recursive: true });
    writeFileSync(fullPath, content);
  }
}

describe('scanVault', () => {
  const vaultDir = join(TMP, 'scan-vault');

  beforeAll(() => {
    createVault(vaultDir, {
      'Root Note.md': '# Root',
      'Quests/The Lost Shrine.md': '# Quest',
      'Quests/Side/Fetch Quest.md': '# Fetch',
      'NPCs/Aldric.md': '# Aldric',
      '.obsidian/config.json': '{}',
      '.git/HEAD': 'ref: refs/heads/main',
      'Images/map.png': 'binary',
    });
  });

  it('finds all markdown files', () => {
    const notes = scanVault(vaultDir);
    const names = notes.map((n) => n.name).sort();
    expect(names).toEqual(['Aldric', 'Fetch Quest', 'Root Note', 'The Lost Shrine']);
  });

  it('skips .obsidian and .git directories', () => {
    const notes = scanVault(vaultDir);
    const paths = notes.map((n) => n.relativePath);
    expect(paths.every((p) => !p.includes('.obsidian'))).toBe(true);
    expect(paths.every((p) => !p.includes('.git'))).toBe(true);
  });

  it('skips non-md files', () => {
    const notes = scanVault(vaultDir);
    expect(notes.every((n) => n.relativePath.endsWith('.md'))).toBe(true);
  });

  it('sets parentFolder correctly', () => {
    const notes = scanVault(vaultDir);
    const root = notes.find((n) => n.name === 'Root Note')!;
    const quest = notes.find((n) => n.name === 'The Lost Shrine')!;
    const nested = notes.find((n) => n.name === 'Fetch Quest')!;
    expect(root.parentFolder).toBe('');
    expect(quest.parentFolder).toBe('Quests');
    expect(nested.parentFolder).toBe('Quests/Side');
  });
});

describe('buildNoteLookup', () => {
  it('creates case-insensitive lookup', () => {
    const notes = [
      {
        absolutePath: '/a/b.md',
        relativePath: 'b.md',
        name: 'MyNote',
        parentFolder: '',
      },
    ];
    const lookup = buildNoteLookup(notes);
    expect(lookup.get('mynote')).toBe('b.md');
  });
});

describe('buildHierarchy', () => {
  it('creates folder resources and note resources', () => {
    const notes = [
      {
        absolutePath: '/vault/Quests/Quest1.md',
        relativePath: 'Quests/Quest1.md',
        name: 'Quest1',
        parentFolder: 'Quests',
      },
      {
        absolutePath: '/vault/Root.md',
        relativePath: 'Root.md',
        name: 'Root',
        parentFolder: '',
      },
    ];
    const entries = buildHierarchy(notes);

    const folders = entries.filter((e) => e.isFolder);
    const noteEntries = entries.filter((e) => !e.isFolder);

    expect(folders).toHaveLength(1);
    expect(folders[0].name).toBe('Quests');

    expect(noteEntries).toHaveLength(2);
    const quest1 = noteEntries.find((e) => e.name === 'Quest1')!;
    expect(quest1.parentId).toBe(folders[0].id);

    const root = noteEntries.find((e) => e.name === 'Root')!;
    expect(root.parentId).toBeUndefined();
  });

  it('assigns pos values', () => {
    const notes = [
      {
        absolutePath: '/vault/B.md',
        relativePath: 'B.md',
        name: 'B',
        parentFolder: '',
      },
      {
        absolutePath: '/vault/A.md',
        relativePath: 'A.md',
        name: 'A',
        parentFolder: '',
      },
    ];
    const entries = buildHierarchy(notes);
    const a = entries.find((e) => e.name === 'A')!;
    const b = entries.find((e) => e.name === 'B')!;
    expect(a.pos).toBe('a0');
    expect(b.pos).toBe('a1');
  });
});

describe('obsidian2lk end-to-end', () => {
  const vaultDir = join(TMP, 'e2e-vault');
  const outputPath = join(TMP, 'e2e-output.lk');

  beforeAll(() => {
    createVault(vaultDir, {
      'World/Overview.md': `---
tags:
  - worldbuilding
aliases:
  - World Overview
---

# World Overview

This world contains many [[Regions]] and #lore elements.

> [!NOTE] Important
> This is a key note about the world.
`,
      'World/Regions.md': `# Regions

The ==Northern Lands== are cold. See ![[map.png]] for reference.

%%This is a hidden comment%%
`,
      '.obsidian/app.json': '{}',
    });
  });

  it('produces a valid .lk file', () => {
    obsidian2lk(vaultDir, outputPath);

    const compressed = readFileSync(outputPath);
    const json = gunzipSync(compressed).toString('utf-8');
    const data = JSON.parse(json) as LkExport;

    expect(data.version).toBe(1);
    expect(data.exportId).toBeTruthy();
    expect(data.calendars).toEqual([]);
    expect(data.resources.length).toBe(3); // World folder + 2 notes
    expect(data.resourceCount).toBe(3);

    // Check folder resource
    const folder = data.resources.find((r) => r.name === 'World')!;
    expect(folder).toBeDefined();
    expect(folder.parentId).toBeUndefined();

    // Check note resources
    const overview = data.resources.find((r) => r.name === 'Overview')!;
    expect(overview).toBeDefined();
    expect(overview.parentId).toBe(folder.id);
    expect(overview.tags).toContain('worldbuilding');
    expect(overview.tags).toContain('lore');
    expect(overview.aliases).toContain('World Overview');
    expect(overview.documents).toHaveLength(1);
    expect(overview.documents[0].type).toBe('page');

    const regions = data.resources.find((r) => r.name === 'Regions')!;
    expect(regions).toBeDefined();
    expect(regions.parentId).toBe(folder.id);

    // Verify ProseMirror content exists
    expect(overview.documents[0].content.type).toBe('doc');
    expect(overview.documents[0].content.content!.length).toBeGreaterThan(0);
  });
});
