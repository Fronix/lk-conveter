import { describe, expect, it } from 'vitest';
import type { ProseMirrorNode } from '../src/shared/types.js';
import { prosemirrorToMd } from '../src/lk2md/prosemirror-to-md.js';
import { mdToProsemirror } from '../src/md2lk/md-to-prosemirror.js';

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
});
