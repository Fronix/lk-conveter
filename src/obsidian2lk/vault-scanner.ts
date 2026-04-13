import { readdirSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

export interface VaultNote {
  absolutePath: string;
  relativePath: string; // "Quests/The Lost Shrine.md"
  name: string; // "The Lost Shrine"
  parentFolder: string; // "Quests" or "" for root
}

const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.webp',
  '.bmp',
]);

export function isImageFile(filename: string): boolean {
  const ext = filename.lastIndexOf('.');
  if (ext === -1) return false;
  return IMAGE_EXTENSIONS.has(filename.slice(ext).toLowerCase());
}

export function scanVault(vaultPath: string): VaultNote[] {
  const notes: VaultNote[] = [];

  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      // Skip dotfiles/dotfolders (.obsidian, .git, .trash, etc.)
      if (entry.startsWith('.')) continue;

      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (entry.endsWith('.md')) {
        const rel = relative(vaultPath, fullPath).replace(/\\/g, '/');
        const parentFolder = relative(vaultPath, dir).replace(/\\/g, '/');
        notes.push({
          absolutePath: fullPath,
          relativePath: rel,
          name: basename(entry, '.md'),
          parentFolder: parentFolder === '.' ? '' : parentFolder,
        });
      }
    }
  }

  walk(vaultPath);
  return notes;
}

export function buildNoteLookup(notes: VaultNote[]): Map<string, string> {
  const lookup = new Map<string, string>();

  for (const note of notes) {
    const key = note.name.toLowerCase();
    // First occurrence wins; Obsidian uses shortest-path resolution
    // but for one-time import this is sufficient
    if (!lookup.has(key)) {
      lookup.set(key, note.relativePath);
    }
  }

  return lookup;
}
