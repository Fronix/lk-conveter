import { describe, expect, it } from 'vitest';
import type { LkResource } from '../src/shared/types.js';
import { buildResourceTree, computeFilePaths, flattenTree } from '../src/lk2md/resource-tree.js';

function makeResource(
  id: string,
  name: string,
  parentId?: string,
): LkResource {
  return {
    schemaVersion: 1,
    id,
    name,
    parentId,
    pos: id,
    aliases: [],
    tags: [],
    banner: { enabled: false, url: '', yPosition: 0 },
    iconColor: '',
    iconGlyph: '',
    iconShape: '',
    isHidden: false,
    isLocked: false,
    showPropertyBar: false,
    properties: [],
    documents: [],
  };
}

describe('buildResourceTree', () => {
  it('creates root nodes for resources without parents', () => {
    const resources = [makeResource('a', 'Alpha'), makeResource('b', 'Beta')];
    const roots = buildResourceTree(resources);
    expect(roots).toHaveLength(2);
  });

  it('nests children under parents', () => {
    const resources = [
      makeResource('parent', 'Parent'),
      makeResource('child', 'Child', 'parent'),
    ];
    const roots = buildResourceTree(resources);
    expect(roots).toHaveLength(1);
    expect(roots[0].children).toHaveLength(1);
    expect(roots[0].children[0].resource.name).toBe('Child');
  });

  it('treats orphans as roots', () => {
    const resources = [makeResource('orphan', 'Orphan', 'missing-parent')];
    const roots = buildResourceTree(resources);
    expect(roots).toHaveLength(1);
  });

  it('sorts children by pos', () => {
    const resources = [
      makeResource('parent', 'Parent'),
      makeResource('c', 'Charlie', 'parent'),
      makeResource('a', 'Alpha', 'parent'),
      makeResource('b', 'Beta', 'parent'),
    ];
    const roots = buildResourceTree(resources);
    const childNames = roots[0].children.map((c) => c.resource.name);
    expect(childNames).toEqual(['Alpha', 'Beta', 'Charlie']);
  });
});

describe('computeFilePaths', () => {
  it('assigns leaf nodes a flat .md path', () => {
    const resources = [makeResource('a', 'Alpha')];
    const roots = buildResourceTree(resources);
    computeFilePaths(roots, '/out');
    expect(roots[0].filePath).toBe('/out/Alpha.md');
  });

  it('assigns parent nodes a nested path', () => {
    const resources = [
      makeResource('parent', 'Parent'),
      makeResource('child', 'Child', 'parent'),
    ];
    const roots = buildResourceTree(resources);
    computeFilePaths(roots, '/out');
    expect(roots[0].filePath).toBe('/out/Parent/Parent.md');
    expect(roots[0].children[0].filePath).toBe('/out/Parent/Child.md');
  });

  it('disambiguates siblings with same name', () => {
    const resources = [
      makeResource('a1', 'Same'),
      makeResource('a2', 'Same'),
    ];
    const roots = buildResourceTree(resources);
    computeFilePaths(roots, '/out');
    expect(roots[0].filePath).not.toBe(roots[1].filePath);
    expect(roots[0].filePath).toContain('a1');
    expect(roots[1].filePath).toContain('a2');
  });

  it('sanitizes filenames with special characters', () => {
    const resources = [makeResource('a', 'My:File<Name>')];
    const roots = buildResourceTree(resources);
    computeFilePaths(roots, '/out');
    expect(roots[0].filePath).not.toContain(':');
    expect(roots[0].filePath).not.toContain('<');
    expect(roots[0].filePath).not.toContain('>');
  });
});

describe('flattenTree', () => {
  it('flattens a nested tree', () => {
    const resources = [
      makeResource('parent', 'Parent'),
      makeResource('child1', 'Child1', 'parent'),
      makeResource('child2', 'Child2', 'parent'),
      makeResource('leaf', 'Leaf'),
    ];
    const roots = buildResourceTree(resources);
    const flat = flattenTree(roots);
    expect(flat).toHaveLength(4);
  });
});
