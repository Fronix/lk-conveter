import { randomUUID } from 'node:crypto';
import type { VaultNote } from './vault-scanner.js';

export interface ResourceEntry {
  id: string;
  name: string;
  parentId: string | undefined;
  pos: string;
  isFolder: boolean;
  note: VaultNote | null;
}

export function buildHierarchy(notes: VaultNote[]): ResourceEntry[] {
  // Collect all unique folder paths
  const folderPaths = new Set<string>();
  for (const note of notes) {
    if (note.parentFolder) {
      // Add the folder and all ancestor folders
      const parts = note.parentFolder.split('/');
      for (let i = 1; i <= parts.length; i++) {
        folderPaths.add(parts.slice(0, i).join('/'));
      }
    }
  }

  // Create folder resources with stable IDs
  const folderIds = new Map<string, string>();
  const entries: ResourceEntry[] = [];

  // Sort folders so parents come before children
  const sortedFolders = [...folderPaths].sort();

  for (const folderPath of sortedFolders) {
    const id = randomUUID();
    folderIds.set(folderPath, id);

    const parts = folderPath.split('/');
    const name = parts[parts.length - 1];
    const parentPath = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
    const parentId = parentPath ? folderIds.get(parentPath) : undefined;

    entries.push({
      id,
      name,
      parentId,
      pos: '', // assigned below
      isFolder: true,
      note: null,
    });
  }

  // Create note resources
  for (const note of notes) {
    const parentId = note.parentFolder
      ? folderIds.get(note.parentFolder)
      : undefined;

    entries.push({
      id: randomUUID(),
      name: note.name,
      parentId,
      pos: '', // assigned below
      isFolder: false,
      note,
    });
  }

  // Assign pos values per parent group (siblings sorted alphabetically)
  const byParent = new Map<string, ResourceEntry[]>();
  for (const entry of entries) {
    const key = entry.parentId || '__root__';
    const group = byParent.get(key);
    if (group) {
      group.push(entry);
    } else {
      byParent.set(key, [entry]);
    }
  }

  for (const siblings of byParent.values()) {
    // Folders first, then notes, each sorted alphabetically
    siblings.sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (let i = 0; i < siblings.length; i++) {
      siblings[i].pos = `a${i}`;
    }
  }

  return entries;
}
