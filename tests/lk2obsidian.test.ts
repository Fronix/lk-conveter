import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { LkExport, LkResource } from '../src/shared/types.js';
import { compressLk } from '../src/md2lk/compress.js';
import { lk2obsidian } from '../src/lk2obsidian/index.js';

const TMP = join(__dirname, '__tmp_lk2obsidian__');

beforeAll(() => {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
});

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true });
});

function buildTestResource(
  id: string,
  name: string,
  parentId: string | undefined,
  opts: {
    tags?: string[];
    aliases?: string[];
    content?: { type: string; content?: unknown[] };
  } = {},
): LkResource {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id,
    name,
    parentId,
    pos: 'a0',
    aliases: opts.aliases ?? [],
    tags: opts.tags ?? [],
    banner: { enabled: false, url: '', yPosition: 50 },
    iconColor: '#6B7280',
    iconGlyph: 'file-text',
    iconShape: 'square',
    isHidden: false,
    isLocked: false,
    showPropertyBar: true,
    properties: [],
    documents: [
      {
        id: `doc-${id}`,
        name: 'Main',
        pos: 'a0',
        type: 'page',
        isFirst: true,
        isHidden: false,
        locatorId: `loc-${id}`,
        createdAt: now,
        updatedAt: now,
        transforms: [],
        sources: [],
        presentation: { documentType: 'page' },
        content: (opts.content as never) ?? {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: `Content of ${name}` }],
            },
          ],
        },
      },
    ],
  };
}

function buildTestExport(resources: LkResource[]): LkExport {
  return {
    version: 1,
    exportId: 'test-export',
    exportedAt: new Date().toISOString(),
    resources,
    calendars: [],
    resourceCount: resources.length,
    hash: '',
  };
}

describe('lk2obsidian end-to-end', () => {
  const lkPath = join(TMP, 'test.lk');
  const outputDir = join(TMP, 'output', 'test');

  beforeAll(() => {
    const resources = [
      buildTestResource('folder-1', 'World', undefined),
      buildTestResource('note-1', 'Overview', 'folder-1', {
        tags: ['worldbuilding', 'lore'],
        aliases: ['World Overview'],
        content: {
          type: 'doc',
          content: [
            {
              type: 'heading',
              attrs: { level: 1 },
              content: [{ type: 'text', text: 'Overview' }],
            },
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'The world is vast.' }],
            },
            {
              type: 'panel',
              attrs: { panelType: 'info' },
              content: [
                {
                  type: 'paragraph',
                  content: [
                    { type: 'text', text: 'This is important info.' },
                  ],
                },
              ],
            },
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'Regions',
                  marks: [
                    {
                      type: 'link',
                      attrs: { href: 'Regions.md' },
                    },
                  ],
                },
              ],
            },
          ],
        },
      }),
      buildTestResource('note-2', 'Regions', 'folder-1'),
    ];

    // Give the child resources proper hierarchy
    resources[1].parentId = 'folder-1';
    resources[2].parentId = 'folder-1';

    const data = buildTestExport(resources);
    mkdirSync(join(TMP, 'output'), { recursive: true });
    compressLk(data, lkPath);
  });

  it('creates output files', () => {
    lk2obsidian([{ inputPath: lkPath, outputDir, sourceName: 'test' }]);

    // World folder has children, so World/World.md
    const worldFile = readFileSync(
      join(outputDir, 'World', 'World.md'),
      'utf-8',
    );
    expect(worldFile).toBeDefined();

    const overviewFile = readFileSync(
      join(outputDir, 'World', 'Overview.md'),
      'utf-8',
    );
    expect(overviewFile).toBeDefined();

    const regionsFile = readFileSync(
      join(outputDir, 'World', 'Regions.md'),
      'utf-8',
    );
    expect(regionsFile).toBeDefined();
  });

  it('produces clean Obsidian frontmatter with tags and aliases', () => {
    const content = readFileSync(
      join(outputDir, 'World', 'Overview.md'),
      'utf-8',
    );

    // Should have tags and aliases
    expect(content).toContain('tags:');
    expect(content).toContain('worldbuilding');
    expect(content).toContain('lore');
    expect(content).toContain('aliases:');
    expect(content).toContain('World Overview');

    // Should NOT have any lk: namespace
    expect(content).not.toContain('lk:');
    expect(content).not.toContain('schemaVersion');
    expect(content).not.toContain('iconColor');
    expect(content).not.toContain('iconGlyph');
  });

  it('omits frontmatter when empty', () => {
    const content = readFileSync(
      join(outputDir, 'World', 'Regions.md'),
      'utf-8',
    );

    // No tags/aliases means no frontmatter block
    expect(content).not.toMatch(/^---/);
  });

  it('converts panels to Obsidian callouts', () => {
    const content = readFileSync(
      join(outputDir, 'World', 'Overview.md'),
      'utf-8',
    );

    expect(content).toContain('> [!NOTE]');
    expect(content).toContain('> This is important info.');
    expect(content).not.toContain(':::panel-');
  });

  it('converts internal links to wiki-links', () => {
    const content = readFileSync(
      join(outputDir, 'World', 'Overview.md'),
      'utf-8',
    );

    expect(content).toContain('[[Regions]]');
    expect(content).not.toContain('.md');
  });

  it('does not write _lk_meta.json', () => {
    let metaExists = true;
    try {
      readFileSync(join(outputDir, '_lk_meta.json'));
    } catch {
      metaExists = false;
    }
    expect(metaExists).toBe(false);
  });

  it('contains no LK HTML comments', () => {
    const content = readFileSync(
      join(outputDir, 'World', 'Overview.md'),
      'utf-8',
    );

    expect(content).not.toMatch(/<!-- lk-/);
    expect(content).not.toMatch(/<!-- empty -->/);
  });
});

describe('lk2obsidian cross-file links', () => {
  const lkPathA = join(TMP, 'a.lk');
  const lkPathB = join(TMP, 'b.lk');
  const outputDirA = join(TMP, 'cross-output', 'a');
  const outputDirB = join(TMP, 'cross-output', 'b');

  beforeAll(() => {
    mkdirSync(join(TMP, 'cross-output'), { recursive: true });

    // File A: has a mention referencing a document in file B
    const resourceA = buildTestResource('res-a', 'NoteA', undefined, {
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'See also ' },
              {
                type: 'mention',
                attrs: {
                  id: 'doc-res-b',
                  text: 'NoteB',
                  alias: 'NoteB',
                  accessLevel: '',
                },
              },
              { type: 'text', text: ' for more.' },
            ],
          },
        ],
      },
    });
    compressLk(buildTestExport([resourceA]), lkPathA);

    // File B: has a simple note
    const resourceB = buildTestResource('res-b', 'NoteB', undefined);
    compressLk(buildTestExport([resourceB]), lkPathB);
  });

  it('resolves cross-file mentions as wiki-links', () => {
    lk2obsidian([
      { inputPath: lkPathA, outputDir: outputDirA, sourceName: 'a' },
      { inputPath: lkPathB, outputDir: outputDirB, sourceName: 'b' },
    ]);

    const contentA = readFileSync(join(outputDirA, 'NoteA.md'), 'utf-8');
    // The mention @[NoteB](lk://doc-res-b) should become [[NoteB]]
    expect(contentA).toContain('[[NoteB]]');
    expect(contentA).not.toContain('lk://');
  });
});
