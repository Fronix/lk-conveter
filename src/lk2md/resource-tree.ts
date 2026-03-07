import type { LkResource } from '../shared/types.js';

export interface ResourceTreeNode {
  resource: LkResource;
  children: ResourceTreeNode[];
  filePath: string;
}

/**
 * Build a tree of resources from the flat array using parentId references.
 * Resources whose parentId is not in the export are treated as roots.
 */
export function buildResourceTree(resources: LkResource[]): ResourceTreeNode[] {
  const index = new Map<string, ResourceTreeNode>();
  const nodes: ResourceTreeNode[] = [];

  // Create nodes
  for (const resource of resources) {
    const node: ResourceTreeNode = { resource, children: [], filePath: '' };
    index.set(resource.id, node);
    nodes.push(node);
  }

  // Link children to parents
  const roots: ResourceTreeNode[] = [];
  for (const node of nodes) {
    const parentId = node.resource.parentId;
    if (parentId && index.has(parentId)) {
      index.get(parentId)?.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort children by pos for consistent ordering
  for (const node of nodes) {
    node.children.sort((a, b) => a.resource.pos.localeCompare(b.resource.pos));
  }

  return roots;
}

/**
 * Compute file paths for all nodes in the tree.
 * - Resources with children → Name/Name.md
 * - Leaf resources → Name.md
 * - Disambiguates siblings with the same sanitized name by appending resource ID
 */
export function computeFilePaths(
  roots: ResourceTreeNode[],
  baseDir: string,
): void {
  assignPathsForChildren(roots, baseDir);
}

function assignPathsForChildren(
  nodes: ResourceTreeNode[],
  parentDir: string,
): void {
  // Detect duplicates among siblings
  const nameCount = new Map<string, number>();
  for (const node of nodes) {
    const name = sanitizeFilename(node.resource.name);
    nameCount.set(name, (nameCount.get(name) || 0) + 1);
  }

  for (const node of nodes) {
    let safeName = sanitizeFilename(node.resource.name);
    if ((nameCount.get(safeName) || 0) > 1) {
      safeName = `${safeName}_${node.resource.id}`;
    }

    if (node.children.length > 0) {
      const dir = `${parentDir}/${safeName}`;
      node.filePath = `${dir}/${safeName}.md`;
      assignPathsForChildren(node.children, dir);
    } else {
      node.filePath = `${parentDir}/${safeName}.md`;
    }
  }
}

/**
 * Sanitize a resource name for use as a filename.
 */
function sanitizeFilename(name: string): string {
  return name
    .replace(/:/g, '_')
    .replace(/[<>"|?*]/g, '_')
    .replace(/\//g, '_')
    .replace(/\\/g, '_')
    .replace(/\.+$/g, '') // trailing dots
    .trim();
}

/**
 * Flatten the tree into an array of all nodes.
 */
export function flattenTree(roots: ResourceTreeNode[]): ResourceTreeNode[] {
  const result: ResourceTreeNode[] = [];
  function walk(node: ResourceTreeNode) {
    result.push(node);
    for (const child of node.children) walk(child);
  }
  for (const root of roots) walk(root);
  return result;
}
