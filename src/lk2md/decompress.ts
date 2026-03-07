import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import type { LkExport } from '../shared/types.js';

export function decompressLk(filePath: string): LkExport {
  const buffer = readFileSync(filePath);
  const json = gunzipSync(buffer).toString('utf-8');
  return JSON.parse(json) as LkExport;
}
