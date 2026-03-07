import { parse as yamlParse } from 'yaml';

export interface ParsedMarkdown {
  frontmatter: Record<string, unknown>;
  body: string;
}

/**
 * Parse a markdown file into frontmatter and body.
 */
export function parseFrontmatter(content: string): ParsedMarkdown {
  const match = content.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }
  const frontmatter = yamlParse(match[1]) as Record<string, unknown>;
  const body = match[2];
  return { frontmatter, body };
}

/**
 * Split a multi-document markdown body into sections by <!-- lk-doc: Name --> markers.
 * Returns array of { name, content } pairs.
 */
export function splitDocumentSections(
  body: string,
): Array<{ name: string; content: string }> {
  const pattern = /<!-- lk-doc: (.+?) -->/g;
  const sections: Array<{ name: string; content: string }> = [];
  // Check if there are any doc separators
  const matches: Array<{ name: string; index: number }> = [];
  for (const m of body.matchAll(pattern)) {
    matches.push({ name: m[1], index: m.index });
  }

  if (matches.length === 0) {
    // Single document — no separators
    return [{ name: 'Main', content: body }];
  }

  for (let i = 0; i < matches.length; i++) {
    const start =
      matches[i].index + matches[i].name.length + '<!-- lk-doc:  -->'.length;
    const end = i + 1 < matches.length ? matches[i + 1].index : body.length;
    const content = body
      .slice(start, end)
      .replace(/^\n+/, '')
      .replace(/\n+$/, '\n');
    sections.push({ name: matches[i].name, content });
  }

  return sections;
}
