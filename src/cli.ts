#!/usr/bin/env node
import { mkdirSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { Command } from 'commander';
import { lk2md } from './lk2md/index.js';
import { md2lk } from './md2lk/index.js';
import { verify } from './verify.js';

const program = new Command();

program
  .name('lk-converter')
  .description('Bidirectional LegendKeeper (.lk) ↔ Markdown converter')
  .version('1.0.0');

program
  .command('lk2md')
  .description('Convert .lk file(s) to markdown files')
  .argument(
    '<input...>',
    'Path(s) to .lk file(s) — supports globs like imports/*.lk',
  )
  .option('-o, --output <dir>', 'Output directory (default: current directory)')
  .action((inputs: string[], opts: { output?: string }) => {
    for (const input of inputs) {
      const inputPath = resolve(input);
      const sourceName = basename(inputPath, '.lk');
      const outputDir = opts.output ? resolve(opts.output) : resolve('.');
      lk2md(inputPath, outputDir, sourceName);
    }
  });

program
  .command('md2lk')
  .description('Convert markdown files back to a .lk file')
  .argument(
    '<input-dir>',
    'Directory containing markdown files with _lk_meta.json',
  )
  .option(
    '-o, --output <file>',
    'Output .lk file (default: for-import/<dir-name>.lk)',
  )
  .option(
    '-s, --source <name>',
    'Source name to export (default: inferred from input directory name)',
  )
  .action((inputDir: string, opts: { output?: string; source?: string }) => {
    const inputPath = resolve(inputDir);
    const dirName = basename(inputPath);
    const outputPath = opts.output
      ? resolve(opts.output)
      : resolve('for-import', `${dirName}.lk`);
    const sourceName = opts.source || dirName;
    mkdirSync(dirname(outputPath), { recursive: true });
    md2lk(inputPath, outputPath, sourceName);
  });

program
  .command('verify')
  .description('Verify round-trip integrity of .lk file(s)')
  .argument('<input...>', 'Path(s) to .lk file(s) to verify')
  .action((inputs: string[]) => {
    for (const input of inputs) {
      const inputPath = resolve(input);
      verify(inputPath);
    }
  });

program.parse();
