import { describe, expect, it } from 'vitest';
import { stringify as yamlStringify } from 'yaml';
import type { LkDocument, ProseMirrorNode } from '../src/shared/types.js';
import { prosemirrorToMd } from '../src/lk2md/prosemirror-to-md.js';
import { mdToProsemirror } from '../src/md2lk/md-to-prosemirror.js';
import { parseFrontmatter } from '../src/md2lk/frontmatter.js';

/**
 * Round-trip tests: ProseMirror → Markdown → ProseMirror
 * Verifies that converting to markdown and back produces equivalent documents.
 */

function doc(...content: ProseMirrorNode[]): ProseMirrorNode {
  return { type: 'doc', content };
}

function p(...content: ProseMirrorNode[]): ProseMirrorNode {
  return { type: 'paragraph', content };
}

function text(t: string, marks?: ProseMirrorNode['marks']): ProseMirrorNode {
  const node: ProseMirrorNode = { type: 'text', text: t };
  if (marks) node.marks = marks;
  return node;
}

function roundtrip(pmDoc: ProseMirrorNode): ProseMirrorNode {
  const md = prosemirrorToMd(pmDoc);
  return mdToProsemirror(md);
}

describe('round-trip: ProseMirror → Markdown → ProseMirror', () => {
  it('round-trips a simple paragraph', () => {
    const result = roundtrip(doc(p(text('Hello world'))));
    expect(result.content?.[0].content?.[0].text).toBe('Hello world');
  });

  it('round-trips bold text', () => {
    const result = roundtrip(doc(p(text('bold', [{ type: 'strong' }]))));
    const textNode = result.content?.[0].content?.[0];
    expect(textNode?.text).toBe('bold');
    expect(textNode?.marks).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'strong' })]),
    );
  });

  it('round-trips italic text', () => {
    const result = roundtrip(doc(p(text('italic', [{ type: 'em' }]))));
    const textNode = result.content?.[0].content?.[0];
    expect(textNode?.text).toBe('italic');
    expect(textNode?.marks).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'em' })]),
    );
  });

  it('round-trips a code block', () => {
    const original = doc({
      type: 'codeBlock',
      attrs: { language: 'js' },
      content: [text('const x = 1;')],
    });
    const result = roundtrip(original);
    expect(result.content?.[0].type).toBe('codeBlock');
    expect(result.content?.[0].attrs?.language).toBe('js');
    expect(result.content?.[0].content?.[0].text).toBe('const x = 1;');
  });

  it('round-trips a bullet list', () => {
    const original = doc({
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [p(text('one'))] },
        { type: 'listItem', content: [p(text('two'))] },
      ],
    });
    const result = roundtrip(original);
    expect(result.content?.[0].type).toBe('bulletList');
    expect(result.content?.[0].content).toHaveLength(2);
  });

  it('round-trips an ordered list', () => {
    const original = doc({
      type: 'orderedList',
      content: [
        { type: 'listItem', content: [p(text('first'))] },
        { type: 'listItem', content: [p(text('second'))] },
      ],
    });
    const result = roundtrip(original);
    expect(result.content?.[0].type).toBe('orderedList');
    expect(result.content?.[0].content).toHaveLength(2);
  });

  it('round-trips a blockquote', () => {
    const original = doc({
      type: 'blockquote',
      content: [p(text('quoted text'))],
    });
    const result = roundtrip(original);
    expect(result.content?.[0].type).toBe('blockquote');
    const innerP = result.content?.[0].content?.[0];
    expect(innerP?.content?.[0].text).toBe('quoted text');
  });

  it('round-trips a horizontal rule', () => {
    const result = roundtrip(doc({ type: 'rule' }));
    expect(result.content?.[0].type).toBe('rule');
  });

  it('round-trips headings', () => {
    for (let level = 1; level <= 6; level++) {
      const result = roundtrip(
        doc({
          type: 'heading',
          attrs: { level },
          content: [text('Title')],
        }),
      );
      expect(result.content?.[0].type).toBe('heading');
      expect(result.content?.[0].attrs?.level).toBe(level);
      expect(result.content?.[0].content?.[0].text).toBe('Title');
    }
  });

  it('round-trips a panel', () => {
    const result = roundtrip(
      doc({
        type: 'panel',
        attrs: { panelType: 'warning' },
        content: [p(text('Watch out'))],
      }),
    );
    expect(result.content?.[0].type).toBe('panel');
    expect(result.content?.[0].attrs?.panelType).toBe('warning');
  });

  it('round-trips an expand', () => {
    const result = roundtrip(
      doc({
        type: 'expand',
        attrs: { title: 'More Info' },
        content: [p(text('Details here'))],
      }),
    );
    expect(result.content?.[0].type).toBe('expand');
    expect(result.content?.[0].attrs?.title).toBe('More Info');
  });

  it('round-trips an empty paragraph', () => {
    const result = roundtrip(doc(p()));
    expect(result.content?.[0].type).toBe('paragraph');
    expect(result.content?.[0].content).toEqual([]);
  });

  it('round-trips multiple paragraphs', () => {
    const result = roundtrip(
      doc(p(text('First')), p(text('Second')), p(text('Third'))),
    );
    expect(result.content).toHaveLength(3);
    expect(result.content?.[0].content?.[0].text).toBe('First');
    expect(result.content?.[1].content?.[0].text).toBe('Second');
    expect(result.content?.[2].content?.[0].text).toBe('Third');
  });

  it('round-trips a link', () => {
    const result = roundtrip(
      doc(
        p(text('click', [{ type: 'link', attrs: { href: 'https://example.com' } }])),
      ),
    );
    const textNode = result.content?.[0].content?.[0];
    expect(textNode?.text).toBe('click');
    const linkMark = textNode?.marks?.find((m) => m.type === 'link');
    expect(linkMark?.attrs?.href).toBe('https://example.com');
  });

  it('round-trips mixed content paragraph', () => {
    const result = roundtrip(
      doc(
        p(
          text('Hello '),
          text('bold', [{ type: 'strong' }]),
          text(' and '),
          text('italic', [{ type: 'em' }]),
          text(' text'),
        ),
      ),
    );
    const content = result.content?.[0].content || [];
    const fullText = content.map((n) => n.text).join('');
    expect(fullText).toBe('Hello bold and italic text');
  });

  it('round-trips a task list with inline content (no paragraph wrapper)', () => {
    const original = doc({
      type: 'taskList',
      attrs: { localId: 'tl1' },
      content: [
        {
          type: 'taskItem',
          attrs: { state: 'TODO', localId: 'ti1' },
          content: [text('Buy milk')],
        },
        {
          type: 'taskItem',
          attrs: { state: 'DONE', localId: 'ti2' },
          content: [text('Write tests')],
        },
      ],
    });
    const result = roundtrip(original);
    const taskList = result.content?.[0];
    expect(taskList?.type).toBe('taskList');
    expect(taskList?.content).toHaveLength(2);

    // taskItem content must be inline nodes directly, not wrapped in paragraph
    const firstItem = taskList?.content?.[0];
    expect(firstItem?.content?.[0].type).toBe('text');
    expect(firstItem?.content?.[0].text).toBe('Buy milk');
    expect(firstItem?.attrs?.state).toBe('TODO');

    const secondItem = taskList?.content?.[1];
    expect(secondItem?.content?.[0].type).toBe('text');
    expect(secondItem?.content?.[0].text).toBe('Write tests');
    expect(secondItem?.attrs?.state).toBe('DONE');
  });
});

describe('round-trip: document property preservation', () => {
  /**
   * Simulates the lk2md → md2lk round-trip for document metadata.
   * lk2md stores all doc properties (except content) in frontmatter YAML.
   * md2lk reads them back and spreads them onto the rebuilt document.
   */
  function roundtripDocMeta(doc: LkDocument): Record<string, unknown> {
    // lk2md: strip content, serialize remaining props to YAML
    const { content: _content, ...meta } = doc;
    const yaml = yamlStringify({ lk: { documents: [meta] } });
    // md2lk: parse YAML back
    const parsed = parseFrontmatter(`---\n${yaml}---\n\nBody\n`);
    const lk = parsed.frontmatter.lk as Record<string, unknown>;
    const docs = lk.documents as Record<string, unknown>[];
    return docs[0];
  }

  function makeDoc(extra: Record<string, unknown> = {}): LkDocument {
    return {
      id: 'doc1',
      name: 'Main',
      pos: 'a0',
      type: 'page',
      isFirst: true,
      isHidden: false,
      locatorId: 'loc1',
      createdAt: '2025-01-01',
      updatedAt: '2025-01-02',
      transforms: [],
      sources: [],
      presentation: { documentType: 'page' },
      content: { type: 'doc', content: [] },
      ...extra,
    };
  }

  it('preserves isFullWidth through frontmatter round-trip', () => {
    const result = roundtripDocMeta(makeDoc({ isFullWidth: true }));
    expect(result.isFullWidth).toBe(true);
  });

  it('preserves calendarId through frontmatter round-trip', () => {
    const result = roundtripDocMeta(makeDoc({ calendarId: 'cal123' }));
    expect(result.calendarId).toBe('cal123');
  });

  it('preserves arbitrary extra properties through frontmatter round-trip', () => {
    const result = roundtripDocMeta(makeDoc({
      customFlag: true,
      someNumber: 42,
      nestedObj: { a: 1, b: 'two' },
    }));
    expect(result.customFlag).toBe(true);
    expect(result.someNumber).toBe(42);
    expect(result.nestedObj).toEqual({ a: 1, b: 'two' });
  });

  it('does not include content in frontmatter metadata', () => {
    const result = roundtripDocMeta(makeDoc());
    expect(result.content).toBeUndefined();
  });
});

describe('round-trip: resource name preservation', () => {
  function roundtripResourceName(originalName: string): string {
    // lk2md: name goes into frontmatter lk.name
    const yaml = yamlStringify({ lk: { name: originalName, id: 'r1' } });
    // md2lk: parse it back
    const parsed = parseFrontmatter(`---\n${yaml}---\n\nBody\n`);
    const lk = parsed.frontmatter.lk as Record<string, unknown>;
    return lk.name as string;
  }

  it('preserves resource names with colons', () => {
    expect(roundtripResourceName('Session 27: Harbour Dispute')).toBe(
      'Session 27: Harbour Dispute',
    );
  });

  it('preserves resource names with other special characters', () => {
    expect(roundtripResourceName('Items <rare> & "legendary"')).toBe(
      'Items <rare> & "legendary"',
    );
  });

  it('preserves plain resource names', () => {
    expect(roundtripResourceName('Simple Name')).toBe('Simple Name');
  });
});
