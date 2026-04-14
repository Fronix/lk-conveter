import { describe, expect, it } from 'vitest';
import { postprocessForObsidian } from '../src/lk2obsidian/postprocess.js';

const emptyLookup = new Map<string, string>();
const sampleLookup = new Map<string, string>([
  ['doc-id-1', 'The Lost Shrine'],
  ['doc-id-2', 'Aldric'],
  ['res-id-1', 'Map Overview'],
]);

describe('postprocessForObsidian', () => {
  describe('strip block-level LK comments', () => {
    it('strips lk-table comments', () => {
      const input =
        '<!-- lk-table: {"__rows":[]} -->\n| A | B |\n| --- | --- |\n| 1 | 2 |\n';
      const result = postprocessForObsidian(input, emptyLookup);
      expect(result).not.toContain('lk-table');
      expect(result).toContain('| A | B |');
    });

    it('strips lk-media comments', () => {
      const input =
        '<!-- lk-media: {"media":{"id":"abc"}} -->\n![image](https://example.com/img.png)\n';
      const result = postprocessForObsidian(input, emptyLookup);
      expect(result).not.toContain('lk-media');
      expect(result).toContain('![image](https://example.com/img.png)');
    });

    it('strips lk-tasklist comments', () => {
      const input =
        '<!-- lk-tasklist: {"localId":"abc"} -->\n- [x] Done task\n';
      const result = postprocessForObsidian(input, emptyLookup);
      expect(result).not.toContain('lk-tasklist');
      expect(result).toContain('- [x] Done task');
    });

    it('strips lk-ext comments', () => {
      const input = '<!-- lk-ext: {"extensionKey":"block-toc"} -->\n\nText\n';
      const result = postprocessForObsidian(input, emptyLookup);
      expect(result).not.toContain('lk-ext');
      expect(result).toContain('Text');
    });

    it('strips lk-unknown comments', () => {
      const input = '<!-- lk-unknown: {"type":"customNode"} -->\n\nText\n';
      const result = postprocessForObsidian(input, emptyLookup);
      expect(result).not.toContain('lk-unknown');
      expect(result).toContain('Text');
    });

    it('strips empty markers', () => {
      const input = 'Before\n\n<!-- empty -->\n\nAfter\n';
      const result = postprocessForObsidian(input, emptyLookup);
      expect(result).not.toContain('<!-- empty -->');
      expect(result).toContain('Before');
      expect(result).toContain('After');
    });

    it('strips lk-ws comments', () => {
      const input = '<!-- lk-ws: " " -->\n\nText\n';
      const result = postprocessForObsidian(input, emptyLookup);
      expect(result).not.toContain('lk-ws');
      expect(result).toContain('Text');
    });
  });

  describe('strip inline LK comments', () => {
    it('strips lk-task comments from task items', () => {
      const input =
        '- [x] Done task <!-- lk-task: {"localId":"abc"} -->\n';
      const result = postprocessForObsidian(input, emptyLookup);
      expect(result).not.toContain('lk-task');
      expect(result).toContain('- [x] Done task');
    });

    it('strips lk-pm comments from paragraphs', () => {
      const input =
        '**bold** and *italic* text\n<!-- lk-pm: [{"type":"text"}] -->\n';
      const result = postprocessForObsidian(input, emptyLookup);
      expect(result).not.toContain('lk-pm');
      expect(result).toContain('**bold** and *italic* text');
    });

    it('strips lk-mention comments', () => {
      const input = '@[Aldric](lk://doc-id-2) <!-- lk-mention: {"id":"doc-id-2"} -->\n';
      const result = postprocessForObsidian(input, sampleLookup);
      expect(result).not.toContain('lk-mention');
    });

    it('strips lk-link comments', () => {
      const input =
        '[link text](https://example.com) <!-- lk-link: {"__confluenceMetadata":{}} -->\n';
      const result = postprocessForObsidian(input, emptyLookup);
      expect(result).not.toContain('lk-link');
      expect(result).toContain('[link text](https://example.com)');
    });

    it('strips lk-expand inline comments', () => {
      const input = ':::expand Details <!-- lk-expand: {"__expanded":true} -->\nContent\n:::\n';
      const result = postprocessForObsidian(input, emptyLookup);
      expect(result).not.toContain('lk-expand');
    });
  });

  describe('mention conversion', () => {
    it('converts mention to wiki-link when id is in lookup', () => {
      const input = 'Talk to @[Aldric](lk://doc-id-2) now.\n';
      const result = postprocessForObsidian(input, sampleLookup);
      expect(result).toContain('[[Aldric]]');
      expect(result).not.toContain('lk://');
    });

    it('converts mention with different display text to aliased wiki-link', () => {
      const input = 'Visit @[the shrine](lk://doc-id-1) today.\n';
      const result = postprocessForObsidian(input, sampleLookup);
      expect(result).toContain('[[The Lost Shrine|the shrine]]');
    });

    it('converts mention to plain text when id is not in lookup', () => {
      const input = 'See @[Unknown](lk://missing-id) here.\n';
      const result = postprocessForObsidian(input, emptyLookup);
      expect(result).toContain('Unknown');
      expect(result).not.toContain('lk://');
      expect(result).not.toContain('[[');
    });
  });

  describe('panel conversion', () => {
    it('converts panel-info to NOTE callout', () => {
      const input = ':::panel-info\nSome info content.\n:::\n';
      const result = postprocessForObsidian(input, emptyLookup);
      expect(result).toContain('> [!NOTE]');
      expect(result).toContain('> Some info content.');
    });

    it('converts panel-warning to WARNING callout', () => {
      const input = ':::panel-warning\nBe careful!\n:::\n';
      const result = postprocessForObsidian(input, emptyLookup);
      expect(result).toContain('> [!WARNING]');
      expect(result).toContain('> Be careful!');
    });

    it('converts panel-error to ERROR callout', () => {
      const input = ':::panel-error\nSomething broke.\n:::\n';
      const result = postprocessForObsidian(input, emptyLookup);
      expect(result).toContain('> [!ERROR]');
      expect(result).toContain('> Something broke.');
    });

    it('converts panel-success to SUCCESS callout', () => {
      const input = ':::panel-success\nAll good!\n:::\n';
      const result = postprocessForObsidian(input, emptyLookup);
      expect(result).toContain('> [!SUCCESS]');
      expect(result).toContain('> All good!');
    });

    it('converts panel-note to QUOTE callout', () => {
      const input = ':::panel-note\nA quote.\n:::\n';
      const result = postprocessForObsidian(input, emptyLookup);
      expect(result).toContain('> [!QUOTE]');
      expect(result).toContain('> A quote.');
    });

    it('handles multi-line panel content', () => {
      const input =
        ':::panel-info\nLine one.\n\nLine two.\n:::\n';
      const result = postprocessForObsidian(input, emptyLookup);
      expect(result).toContain('> [!NOTE]');
      expect(result).toContain('> Line one.');
      expect(result).toContain('> Line two.');
    });
  });

  describe('secret conversion', () => {
    it('converts secret to ABSTRACT callout', () => {
      const input = ':::secret\nHidden content.\n:::\n';
      const result = postprocessForObsidian(input, emptyLookup);
      expect(result).toContain('> [!ABSTRACT]');
      expect(result).toContain('> Hidden content.');
    });

    it('converts secret with title', () => {
      const input = ':::secret Spoiler Alert\nThe butler did it.\n:::\n';
      const result = postprocessForObsidian(input, emptyLookup);
      expect(result).toContain('> [!ABSTRACT] Spoiler Alert');
      expect(result).toContain('> The butler did it.');
    });
  });

  describe('expand conversion', () => {
    it('converts expand to collapsed callout', () => {
      const input = ':::expand Click to reveal\nExpanded content.\n:::\n';
      const result = postprocessForObsidian(input, emptyLookup);
      expect(result).toContain('> [!NOTE]- Click to reveal');
      expect(result).toContain('> Expanded content.');
    });

    it('converts expand without title', () => {
      const input = ':::expand\nContent.\n:::\n';
      const result = postprocessForObsidian(input, emptyLookup);
      expect(result).toContain('> [!NOTE]-');
      expect(result).toContain('> Content.');
    });
  });

  describe('layout to multi-column-markdown', () => {
    it('converts layout to multi-column-markdown syntax', () => {
      const input =
        ':::layout\n:::col-50\nLeft column content.\n\n:::\n\n:::col-50\nRight column content.\n\n:::\n\n:::\n';
      const result = postprocessForObsidian(input, emptyLookup);
      expect(result).not.toContain(':::layout');
      expect(result).not.toContain(':::col-');
      expect(result).toContain('--- start-multi-column:');
      expect(result).toContain('Number of Columns: 2');
      expect(result).toContain('Column Size: [50%, 50%]');
      expect(result).toContain('Border: disabled');
      expect(result).toContain('--- end-column ---');
      expect(result).toContain('--- end-multi-column');
      expect(result).toContain('Left column content.');
      expect(result).toContain('Right column content.');
    });

    it('preserves column widths from LK', () => {
      const input =
        ':::layout\n:::col-33.33\nNarrow column.\n\n:::\n\n:::col-66.66\nWide column.\n\n:::\n\n:::\n';
      const result = postprocessForObsidian(input, emptyLookup);
      expect(result).toContain('Column Size: [33.33%, 66.66%]');
      expect(result).toContain('Number of Columns: 2');
    });

    it('handles three-column layouts', () => {
      const input =
        ':::layout\n:::col-33.33\nCol 1.\n\n:::\n\n:::col-33.33\nCol 2.\n\n:::\n\n:::col-33.33\nCol 3.\n\n:::\n\n:::\n';
      const result = postprocessForObsidian(input, emptyLookup);
      expect(result).toContain('Number of Columns: 3');
      expect(result).toContain('Column Size: [33.33%, 33.33%, 33.33%]');
      // Should have 2 column breaks for 3 columns
      const breaks = result.match(/--- end-column ---/g);
      expect(breaks).toHaveLength(2);
    });
  });

  describe('extension handling', () => {
    it('strips extension wrapper and keeps content', () => {
      const input =
        ':::extension {"extensionKey":"block-embed"}\nInner content here.\n:::\n';
      const result = postprocessForObsidian(input, emptyLookup);
      expect(result).not.toContain(':::extension');
      expect(result).toContain('Inner content here.');
    });
  });

  describe('wiki-link conversion', () => {
    it('converts .md links to wiki-links', () => {
      const input = 'See [The Lost Shrine](Quests/The%20Lost%20Shrine.md) for details.\n';
      const result = postprocessForObsidian(input, emptyLookup);
      expect(result).toContain('[[The Lost Shrine]]');
      expect(result).not.toContain('.md');
    });

    it('converts links with different display text to aliased wiki-links', () => {
      const input = 'Visit [the shrine](Quests/The%20Lost%20Shrine.md) today.\n';
      const result = postprocessForObsidian(input, emptyLookup);
      expect(result).toContain('[[The Lost Shrine|the shrine]]');
    });

    it('leaves external links unchanged', () => {
      const input = 'Visit [Google](https://google.com) today.\n';
      const result = postprocessForObsidian(input, emptyLookup);
      expect(result).toContain('[Google](https://google.com)');
    });

    it('does not convert image links', () => {
      const input = '![alt text](images/photo.md)\n';
      const result = postprocessForObsidian(input, emptyLookup);
      expect(result).toContain('![alt text](images/photo.md)');
    });

    it('handles links with spaces (percent-encoded)', () => {
      const input = '[My Note](Some%20Folder/My%20Note.md)\n';
      const result = postprocessForObsidian(input, emptyLookup);
      expect(result).toContain('[[My Note]]');
    });
  });

  describe('code protection', () => {
    it('does not transform content inside code blocks', () => {
      const input =
        '```\n<!-- lk-table: {"test":true} -->\n:::panel-info\nContent\n:::\n```\n';
      const result = postprocessForObsidian(input, emptyLookup);
      expect(result).toContain('<!-- lk-table');
      expect(result).toContain(':::panel-info');
    });

    it('does not transform content inside inline code', () => {
      const input = 'Use `@[mention](lk://id)` syntax.\n';
      const result = postprocessForObsidian(input, emptyLookup);
      expect(result).toContain('`@[mention](lk://id)`');
    });
  });

  describe('cleanup', () => {
    it('collapses excessive blank lines', () => {
      const input = 'Line one.\n\n\n\n\nLine two.\n';
      const result = postprocessForObsidian(input, emptyLookup);
      expect(result).not.toContain('\n\n\n');
      expect(result).toContain('Line one.\n\nLine two.');
    });
  });
});
