import { describe, expect, it } from 'vitest';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import type { LkExport } from '../src/shared/types.js';
import { decompressLk } from '../src/lk2md/decompress.js';
import { compressLk } from '../src/md2lk/compress.js';

describe('compress/decompress round-trip', () => {
  const tempDir = join(tmpdir(), `lk-test-${Date.now()}`);

  const testData: LkExport = {
    version: 1,
    exportId: 'test-export',
    exportedAt: '2024-01-01T00:00:00Z',
    resources: [],
    calendars: [],
    resourceCount: 0,
    hash: 'abc123',
  };

  it('decompresses a gzipped .lk file', () => {
    mkdirSync(tempDir, { recursive: true });

    const filePath = join(tempDir, 'test.lk');
    const compressed = gzipSync(Buffer.from(JSON.stringify(testData), 'utf-8'));
    const { writeFileSync } = require('node:fs');
    writeFileSync(filePath, compressed);

    const result = decompressLk(filePath);
    expect(result.version).toBe(1);
    expect(result.exportId).toBe('test-export');
    expect(result.resources).toEqual([]);
    expect(result.hash).toBe('abc123');

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('compresses and decompresses back to the same data', () => {
    const dir = join(tmpdir(), `lk-test-roundtrip-${Date.now()}`);
    mkdirSync(dir, { recursive: true });

    const filePath = join(dir, 'output.lk');
    compressLk(testData, filePath);

    const result = decompressLk(filePath);
    expect(result.version).toBe(testData.version);
    expect(result.exportId).toBe(testData.exportId);
    expect(result.exportedAt).toBe(testData.exportedAt);
    expect(result.hash).toBe(testData.hash);
    expect(result.resources).toEqual([]);
    expect(result.calendars).toEqual([]);

    rmSync(dir, { recursive: true, force: true });
  });

  it('produces valid gzip output', () => {
    const dir = join(tmpdir(), `lk-test-gzip-${Date.now()}`);
    mkdirSync(dir, { recursive: true });

    const filePath = join(dir, 'verify.lk');
    compressLk(testData, filePath);

    const compressed = readFileSync(filePath);
    const json = gunzipSync(compressed).toString('utf-8');
    const parsed = JSON.parse(json) as LkExport;

    expect(parsed.exportId).toBe('test-export');

    rmSync(dir, { recursive: true, force: true });
  });
});
