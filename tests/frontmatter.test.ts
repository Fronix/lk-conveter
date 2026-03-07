import { describe, expect, it } from 'vitest';
import { parseFrontmatter, splitDocumentSections } from '../src/md2lk/frontmatter.js';

describe('parseFrontmatter', () => {
  it('parses frontmatter and body', () => {
    const content = '---\ntitle: Hello\n---\n\nBody text\n';
    const result = parseFrontmatter(content);
    expect(result.frontmatter.title).toBe('Hello');
    expect(result.body).toBe('Body text\n');
  });

  it('returns empty frontmatter when none present', () => {
    const result = parseFrontmatter('Just some text');
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe('Just some text');
  });

  it('parses nested YAML', () => {
    const content = '---\nlk:\n  id: abc\n  source: Test\n---\n\nBody\n';
    const result = parseFrontmatter(content);
    const lk = result.frontmatter.lk as Record<string, unknown>;
    expect(lk.id).toBe('abc');
    expect(lk.source).toBe('Test');
  });

  it('parses arrays in frontmatter', () => {
    const content = '---\ntags:\n  - one\n  - two\n---\n\nBody\n';
    const result = parseFrontmatter(content);
    expect(result.frontmatter.tags).toEqual(['one', 'two']);
  });
});

describe('splitDocumentSections', () => {
  it('returns single section when no markers', () => {
    const sections = splitDocumentSections('Some body text\n');
    expect(sections).toHaveLength(1);
    expect(sections[0].name).toBe('Main');
    expect(sections[0].content).toBe('Some body text\n');
  });

  it('splits multiple sections', () => {
    const body = '<!-- lk-doc: Tab1 -->\n\nContent one\n\n<!-- lk-doc: Tab2 -->\n\nContent two\n';
    const sections = splitDocumentSections(body);
    expect(sections).toHaveLength(2);
    expect(sections[0].name).toBe('Tab1');
    expect(sections[0].content).toContain('Content one');
    expect(sections[1].name).toBe('Tab2');
    expect(sections[1].content).toContain('Content two');
  });

  it('handles sections with no trailing newlines', () => {
    const body = '<!-- lk-doc: Only -->\n\nJust this';
    const sections = splitDocumentSections(body);
    expect(sections).toHaveLength(1);
    expect(sections[0].name).toBe('Only');
  });
});
