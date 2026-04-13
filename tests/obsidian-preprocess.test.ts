import { describe, expect, it } from 'vitest';
import { preprocessObsidian } from '../src/obsidian2lk/preprocess.js';

const emptyLookup = new Map<string, string>();
const sampleLookup = new Map<string, string>([
  ['the lost shrine', 'Quests/The Lost Shrine.md'],
  ['aldric', 'NPCs/Aldric.md'],
  ['map overview', 'Maps/Map Overview.md'],
]);

describe('preprocessObsidian', () => {
  describe('wiki-links', () => {
    it('converts basic wiki-links', () => {
      const { markdown } = preprocessObsidian(
        'See [[The Lost Shrine]] for details.',
        sampleLookup,
      );
      expect(markdown).toContain(
        '[The Lost Shrine](Quests/The%20Lost%20Shrine.md)',
      );
    });

    it('converts wiki-links with display text', () => {
      const { markdown } = preprocessObsidian(
        'Talk to [[Aldric|the old wizard]].',
        sampleLookup,
      );
      expect(markdown).toContain('[the old wizard](NPCs/Aldric.md)');
    });

    it('handles unresolved wiki-links', () => {
      const { markdown } = preprocessObsidian(
        'See [[Unknown Note]] here.',
        emptyLookup,
      );
      expect(markdown).toContain('[Unknown Note](Unknown%20Note.md)');
    });
  });

  describe('image embeds', () => {
    it('converts image embeds', () => {
      const { markdown } = preprocessObsidian(
        'Here is ![[castle.png]] an image.',
        emptyLookup,
      );
      expect(markdown).toContain('![castle.png](castle.png)');
    });

    it('converts image embeds with alt text', () => {
      const { markdown } = preprocessObsidian(
        '![[castle.png|A grand castle]]',
        emptyLookup,
      );
      expect(markdown).toContain('![A grand castle](castle.png)');
    });

    it('converts non-image embeds to links', () => {
      const { markdown } = preprocessObsidian(
        'Embed: ![[The Lost Shrine]]',
        sampleLookup,
      );
      expect(markdown).toContain(
        '[The Lost Shrine](Quests/The%20Lost%20Shrine.md)',
      );
    });
  });

  describe('callouts', () => {
    it('converts a basic callout', () => {
      const input = '> [!WARNING] Be careful\n> This is dangerous content.\n';
      const { markdown } = preprocessObsidian(input, emptyLookup);
      expect(markdown).toContain(':::panel-warning');
      expect(markdown).toContain('**Be careful**');
      expect(markdown).toContain('This is dangerous content.');
      expect(markdown).toContain(':::');
    });

    it('converts callout without title', () => {
      const input = '> [!NOTE]\n> Some note content.\n';
      const { markdown } = preprocessObsidian(input, emptyLookup);
      expect(markdown).toContain(':::panel-info');
      expect(markdown).toContain('Some note content.');
      expect(markdown).not.toContain('****');
    });

    it('maps callout types correctly', () => {
      const types: [string, string][] = [
        ['NOTE', 'info'],
        ['WARNING', 'warning'],
        ['ERROR', 'error'],
        ['SUCCESS', 'success'],
        ['QUESTION', 'note'],
        ['TIP', 'info'],
        ['BUG', 'error'],
      ];
      for (const [obsType, lkType] of types) {
        const input = `> [!${obsType}]\n> content\n`;
        const { markdown } = preprocessObsidian(input, emptyLookup);
        expect(markdown).toContain(`:::panel-${lkType}`);
      }
    });
  });

  describe('inline tags', () => {
    it('extracts inline tags', () => {
      const { inlineTags } = preprocessObsidian(
        'This is about #worldbuilding and #lore/history stuff.',
        emptyLookup,
      );
      expect(inlineTags).toContain('worldbuilding');
      expect(inlineTags).toContain('lore/history');
    });

    it('removes inline tags from markdown', () => {
      const { markdown } = preprocessObsidian(
        'Text #tag more text.',
        emptyLookup,
      );
      expect(markdown).not.toContain('#tag');
      expect(markdown).toContain('Text');
      expect(markdown).toContain('more text.');
    });

    it('deduplicates tags', () => {
      const { inlineTags } = preprocessObsidian(
        'One #tag and another #tag here.',
        emptyLookup,
      );
      expect(inlineTags).toEqual(['tag']);
    });
  });

  describe('comments', () => {
    it('strips Obsidian comments', () => {
      const { markdown } = preprocessObsidian(
        'Before %%hidden comment%% after.',
        emptyLookup,
      );
      expect(markdown).toContain('Before  after.');
      expect(markdown).not.toContain('hidden comment');
    });

    it('strips multi-line comments', () => {
      const { markdown } = preprocessObsidian(
        'Before\n%%\nmulti\nline\n%%\nafter',
        emptyLookup,
      );
      expect(markdown).not.toContain('multi');
      expect(markdown).toContain('Before');
      expect(markdown).toContain('after');
    });
  });

  describe('highlights', () => {
    it('strips highlight markers', () => {
      const { markdown } = preprocessObsidian(
        'This is ==highlighted text== in the doc.',
        emptyLookup,
      );
      expect(markdown).toContain('highlighted text');
      expect(markdown).not.toContain('==');
    });
  });

  describe('code protection', () => {
    it('does not transform wiki-links inside code blocks', () => {
      const input = '```\n[[Not A Link]]\n```\n';
      const { markdown } = preprocessObsidian(input, emptyLookup);
      expect(markdown).toContain('[[Not A Link]]');
    });

    it('does not transform wiki-links inside inline code', () => {
      const input = 'Use `[[Not A Link]]` syntax.';
      const { markdown } = preprocessObsidian(input, emptyLookup);
      expect(markdown).toContain('`[[Not A Link]]`');
    });
  });
});
