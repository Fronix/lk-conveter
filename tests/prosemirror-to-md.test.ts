import { describe, expect, it } from 'vitest';
import type { ProseMirrorNode } from '../src/shared/types.js';
import { prosemirrorToMd } from '../src/lk2md/prosemirror-to-md.js';

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

describe('prosemirrorToMd', () => {
  it('converts a simple paragraph', () => {
    const result = prosemirrorToMd(doc(p(text('Hello world'))));
    expect(result).toBe('Hello world\n');
  });

  it('converts bold text', () => {
    const result = prosemirrorToMd(
      doc(p(text('bold', [{ type: 'strong' }]))),
    );
    expect(result).toBe('**bold**\n');
  });

  it('converts italic text', () => {
    const result = prosemirrorToMd(doc(p(text('italic', [{ type: 'em' }]))));
    expect(result).toBe('*italic*\n');
  });

  it('converts bold+italic text', () => {
    const result = prosemirrorToMd(
      doc(p(text('both', [{ type: 'strong' }, { type: 'em' }]))),
    );
    expect(result).toBe('***both***\n');
  });

  it('converts inline code', () => {
    const result = prosemirrorToMd(doc(p(text('code', [{ type: 'code' }]))));
    expect(result).toBe('`code`\n');
  });

  it('converts strikethrough', () => {
    const result = prosemirrorToMd(
      doc(p(text('struck', [{ type: 'strike' }]))),
    );
    expect(result).toBe('~~struck~~\n');
  });

  it('converts underline', () => {
    const result = prosemirrorToMd(
      doc(p(text('under', [{ type: 'underline' }]))),
    );
    expect(result).toBe('<u>under</u>\n');
  });

  it('converts a link', () => {
    const result = prosemirrorToMd(
      doc(
        p(text('click', [{ type: 'link', attrs: { href: 'https://example.com' } }])),
      ),
    );
    expect(result).toBe('[click](https://example.com)\n');
  });

  it('converts headings', () => {
    for (let level = 1; level <= 6; level++) {
      const node: ProseMirrorNode = {
        type: 'heading',
        attrs: { level },
        content: [text('Title')],
      };
      const result = prosemirrorToMd(doc(node));
      expect(result).toBe(`${'#'.repeat(level)} Title\n`);
    }
  });

  it('converts a code block', () => {
    const result = prosemirrorToMd(
      doc({
        type: 'codeBlock',
        attrs: { language: 'ts' },
        content: [text('const x = 1;')],
      }),
    );
    expect(result).toBe('```ts\nconst x = 1;\n```\n');
  });

  it('converts a code block without language', () => {
    const result = prosemirrorToMd(
      doc({
        type: 'codeBlock',
        content: [text('hello')],
      }),
    );
    expect(result).toBe('```\nhello\n```\n');
  });

  it('converts a bullet list', () => {
    const result = prosemirrorToMd(
      doc({
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [p(text('one'))] },
          { type: 'listItem', content: [p(text('two'))] },
        ],
      }),
    );
    expect(result).toBe('- one\n- two\n');
  });

  it('converts an ordered list', () => {
    const result = prosemirrorToMd(
      doc({
        type: 'orderedList',
        content: [
          { type: 'listItem', content: [p(text('first'))] },
          { type: 'listItem', content: [p(text('second'))] },
        ],
      }),
    );
    expect(result).toBe('1. first\n2. second\n');
  });

  it('converts a blockquote', () => {
    const result = prosemirrorToMd(
      doc({
        type: 'blockquote',
        content: [p(text('quoted'))],
      }),
    );
    expect(result).toBe('> quoted\n');
  });

  it('converts a horizontal rule', () => {
    const result = prosemirrorToMd(doc({ type: 'rule' }));
    expect(result).toBe('---\n');
  });

  it('converts a hard break', () => {
    const result = prosemirrorToMd(
      doc(p(text('line1'), { type: 'hardBreak' }, text('line2'))),
    );
    expect(result).toBe('line1<br>line2\n');
  });

  it('converts a panel', () => {
    const result = prosemirrorToMd(
      doc({
        type: 'panel',
        attrs: { panelType: 'info' },
        content: [p(text('Notice'))],
      }),
    );
    expect(result).toBe(':::panel-info\nNotice\n:::\n');
  });

  it('converts an expand block', () => {
    const result = prosemirrorToMd(
      doc({
        type: 'expand',
        attrs: { title: 'Details' },
        content: [p(text('Hidden content'))],
      }),
    );
    expect(result).toBe(':::expand Details\nHidden content\n:::\n');
  });

  it('converts a secret block', () => {
    const result = prosemirrorToMd(
      doc({
        type: 'bodiedExtension',
        attrs: {
          extensionType: 'com.algorific.legendkeeper.extensions',
          extensionKey: 'block-secret',
          parameters: { extensionTitle: 'Secret' },
          layout: 'default',
        },
        content: [p(text('secret stuff'))],
      }),
    );
    expect(result).toBe(':::secret\nsecret stuff\n:::\n');
  });

  it('converts a layout section with columns', () => {
    const result = prosemirrorToMd(
      doc({
        type: 'layoutSection',
        content: [
          {
            type: 'layoutColumn',
            attrs: { width: 50 },
            content: [p(text('Left'))],
          },
          {
            type: 'layoutColumn',
            attrs: { width: 50 },
            content: [p(text('Right'))],
          },
        ],
      }),
    );
    expect(result).toContain(':::layout');
    expect(result).toContain(':::col-50');
    expect(result).toContain('Left');
    expect(result).toContain('Right');
  });

  it('converts a mention', () => {
    const result = prosemirrorToMd(
      doc(
        p({
          type: 'mention',
          attrs: { id: 'abc123', text: 'John', alias: 'john' },
        }),
      ),
    );
    expect(result).toContain('@[John](lk://abc123)');
    expect(result).toContain('<!-- lk-mention:');
  });

  it('converts an image/media', () => {
    const result = prosemirrorToMd(
      doc({
        type: 'mediaSingle',
        attrs: { layout: 'center' },
        content: [
          {
            type: 'media',
            attrs: {
              id: 'img1',
              type: 'external',
              url: 'https://example.com/img.png',
              alt: 'A photo',
            },
          },
        ],
      }),
    );
    expect(result).toContain('![A photo](https://example.com/img.png)');
    expect(result).toContain('<!-- lk-media:');
  });

  it('outputs empty paragraph marker', () => {
    const result = prosemirrorToMd(doc(p()));
    expect(result).toContain('<!-- empty -->');
  });

  it('handles multiple paragraphs', () => {
    const result = prosemirrorToMd(
      doc(p(text('First')), p(text('Second'))),
    );
    expect(result).toBe('First\n\nSecond\n');
  });

  it('converts a task list', () => {
    const result = prosemirrorToMd(
      doc({
        type: 'taskList',
        attrs: {},
        content: [
          {
            type: 'taskItem',
            attrs: { state: 'TODO' },
            content: [p(text('Do this'))],
          },
          {
            type: 'taskItem',
            attrs: { state: 'DONE' },
            content: [p(text('Did this'))],
          },
        ],
      }),
    );
    expect(result).toContain('- [ ] Do this');
    expect(result).toContain('- [x] Did this');
  });
});
