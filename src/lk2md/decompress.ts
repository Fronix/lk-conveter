import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import type { LkExport } from '../shared/types.js';

export function decompressLk(filePath: string): LkExport {
  const buffer = readFileSync(filePath);
  // LK now exports plain JSON as well as gzipped `.lk`. Both are the same
  // payload — sniff the gzip magic bytes (0x1f 0x8b) to decide whether to
  // inflate or read the buffer directly as UTF-8 JSON.
  const isGzip = buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
  const json = isGzip
    ? gunzipSync(buffer).toString('utf-8')
    : buffer.toString('utf-8');
  return JSON.parse(json) as LkExport;
}
