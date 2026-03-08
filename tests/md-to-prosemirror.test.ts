import { describe, expect, it } from 'vitest';
import { mdToProsemirror } from '../src/md2lk/md-to-prosemirror.js';

function getContent(md: string) {
  return mdToProsemirror(md).content || [];
}

describe('mdToProsemirror', () => {
  it('parses a simple paragraph', () => {
    const nodes = getContent('Hello world\n');
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe('paragraph');
    expect(nodes[0].content?.[0].text).toBe('Hello world');
  });

  it('parses bold text', () => {
    const nodes = getContent('**bold**\n');
    const textNode = nodes[0].content?.[0];
    expect(textNode?.text).toBe('bold');
    expect(textNode?.marks).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'strong' })]),
    );
  });

  it('parses italic text', () => {
    const nodes = getContent('*italic*\n');
    const textNode = nodes[0].content?.[0];
    expect(textNode?.text).toBe('italic');
    expect(textNode?.marks).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'em' })]),
    );
  });

  it('parses bold+italic text', () => {
    const nodes = getContent('***both***\n');
    const textNode = nodes[0].content?.[0];
    expect(textNode?.text).toBe('both');
    expect(textNode?.marks).toHaveLength(2);
    const markTypes = textNode?.marks?.map((m) => m.type).sort();
    expect(markTypes).toEqual(['em', 'strong']);
  });

  it('parses inline code', () => {
    const nodes = getContent('`code`\n');
    const textNode = nodes[0].content?.[0];
    expect(textNode?.text).toBe('code');
    expect(textNode?.marks).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'code' })]),
    );
  });

  it('parses strikethrough', () => {
    const nodes = getContent('~~struck~~\n');
    const textNode = nodes[0].content?.[0];
    expect(textNode?.text).toBe('struck');
    expect(textNode?.marks).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'strike' })]),
    );
  });

  it('parses underline', () => {
    const nodes = getContent('<u>under</u>\n');
    const textNode = nodes[0].content?.[0];
    expect(textNode?.text).toBe('under');
    expect(textNode?.marks).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'underline' })]),
    );
  });

  it('parses a link', () => {
    const nodes = getContent('[click](https://example.com)\n');
    const textNode = nodes[0].content?.[0];
    expect(textNode?.text).toBe('click');
    expect(textNode?.marks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'link',
          attrs: expect.objectContaining({ href: 'https://example.com' }),
        }),
      ]),
    );
  });

  it('parses headings at all levels', () => {
    for (let level = 1; level <= 6; level++) {
      const nodes = getContent(`${'#'.repeat(level)} Title\n`);
      expect(nodes[0].type).toBe('heading');
      expect(nodes[0].attrs?.level).toBe(level);
      expect(nodes[0].content?.[0].text).toBe('Title');
    }
  });

  it('parses a code block', () => {
    const nodes = getContent('```ts\nconst x = 1;\n```\n');
    expect(nodes[0].type).toBe('codeBlock');
    expect(nodes[0].attrs?.language).toBe('ts');
    expect(nodes[0].content?.[0].text).toBe('const x = 1;');
  });

  it('parses a code block without language', () => {
    const nodes = getContent('```\nhello\n```\n');
    expect(nodes[0].type).toBe('codeBlock');
    expect(nodes[0].content?.[0].text).toBe('hello');
  });

  it('parses a bullet list', () => {
    const nodes = getContent('- one\n- two\n');
    expect(nodes[0].type).toBe('bulletList');
    expect(nodes[0].content).toHaveLength(2);
    expect(nodes[0].content?.[0].type).toBe('listItem');
  });

  it('parses an ordered list', () => {
    const nodes = getContent('1. first\n2. second\n');
    expect(nodes[0].type).toBe('orderedList');
    expect(nodes[0].content).toHaveLength(2);
  });

  it('parses a blockquote', () => {
    const nodes = getContent('> quoted\n');
    expect(nodes[0].type).toBe('blockquote');
    const innerP = nodes[0].content?.[0];
    expect(innerP?.type).toBe('paragraph');
    expect(innerP?.content?.[0].text).toBe('quoted');
  });

  it('parses a horizontal rule', () => {
    const nodes = getContent('---\n');
    expect(nodes[0].type).toBe('rule');
  });

  it('parses a hard break', () => {
    const nodes = getContent('line1<br>line2\n');
    const content = nodes[0].content || [];
    expect(content[0].text).toBe('line1');
    expect(content[1].type).toBe('hardBreak');
    expect(content[2].text).toBe('line2');
  });

  it('parses a panel directive', () => {
    const nodes = getContent(':::panel-info\nNotice\n:::\n');
    expect(nodes[0].type).toBe('panel');
    expect(nodes[0].attrs?.panelType).toBe('info');
  });

  it('parses an expand directive', () => {
    const nodes = getContent(':::expand Details\nHidden content\n:::\n');
    expect(nodes[0].type).toBe('expand');
    expect(nodes[0].attrs?.title).toBe('Details');
  });

  it('parses a secret directive', () => {
    const nodes = getContent(':::secret\nsecret stuff\n:::\n');
    expect(nodes[0].type).toBe('bodiedExtension');
    expect(nodes[0].attrs?.extensionKey).toBe('block-secret');
  });

  it('parses a layout with columns', () => {
    const md = ':::layout\n:::col-50\nLeft\n:::\n\n:::col-50\nRight\n:::\n\n:::\n';
    const nodes = getContent(md);
    expect(nodes[0].type).toBe('layoutSection');
    expect(nodes[0].content).toHaveLength(2);
    expect(nodes[0].content?.[0].attrs?.width).toBe(50);
  });

  it('parses a mention', () => {
    const md = '@[John](lk://abc123) <!-- lk-mention: {"id":"abc123","alias":"john"} -->\n';
    const nodes = getContent(md);
    const mention = nodes[0].content?.find((n) => n.type === 'mention');
    expect(mention).toBeDefined();
    expect(mention?.attrs?.id).toBe('abc123');
    expect(mention?.attrs?.text).toBe('John');
  });

  it('parses an image with media comment', () => {
    const md = '<!-- lk-media: {"media":{"id":"img1","type":"external"},"single":{"layout":"center"}} -->\n![A photo](https://example.com/img.png)\n';
    const nodes = getContent(md);
    expect(nodes[0].type).toBe('mediaSingle');
    const media = nodes[0].content?.[0];
    expect(media?.attrs?.url).toBe('https://example.com/img.png');
  });

  it('parses empty paragraph marker', () => {
    const nodes = getContent('<!-- empty -->\n');
    expect(nodes[0].type).toBe('paragraph');
    expect(nodes[0].content).toEqual([]);
  });

  it('parses a task list with tasklist comment', () => {
    const md = '<!-- lk-tasklist: {"localId":"tl1"} -->\n- [ ] Do this\n- [x] Did this\n';
    const nodes = getContent(md);
    expect(nodes[0].type).toBe('taskList');
    expect(nodes[0].content).toHaveLength(2);
    expect(nodes[0].content?.[0].attrs?.state).toBe('TODO');
    expect(nodes[0].content?.[1].attrs?.state).toBe('DONE');
  });

  it('task items contain inline nodes directly, not wrapped in paragraph', () => {
    const md = '- [ ] Do this\n- [x] Done that\n';
    const nodes = getContent(md);
    expect(nodes[0].type).toBe('taskList');
    const firstItem = nodes[0].content?.[0];
    expect(firstItem?.type).toBe('taskItem');
    // Content should be inline nodes (text), NOT paragraph wrappers
    expect(firstItem?.content?.[0].type).toBe('text');
    expect(firstItem?.content?.[0].text).toBe('Do this');
  });

  it('parses mixed inline marks in a paragraph', () => {
    const nodes = getContent('Hello **bold** and *italic*\n');
    expect(nodes[0].type).toBe('paragraph');
    const content = nodes[0].content || [];
    expect(content.length).toBeGreaterThanOrEqual(3);
  });

  it('parses a non-bodied extension comment', () => {
    const md = '<!-- lk-ext: {"extensionType":"test","extensionKey":"widget"} -->\n';
    const nodes = getContent(md);
    expect(nodes[0].type).toBe('extension');
    expect(nodes[0].attrs?.extensionKey).toBe('widget');
  });
});
