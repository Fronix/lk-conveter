import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import type { LkExport } from '../shared/types.js';

export function compressLk(data: LkExport, outputPath: string): void {
  const json = JSON.stringify(data);
  const compressed = gzipSync(Buffer.from(json, 'utf-8'));
  writeFileSync(outputPath, compressed);
}
