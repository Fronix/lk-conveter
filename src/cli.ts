#!/usr/bin/env node
import { mkdirSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { Command } from 'commander';
import { lk2md } from './lk2md/index.js';
import { lk2obsidian } from './lk2obsidian/index.js';
import { md2lk } from './md2lk/index.js';
import { obsidian2lk } from './obsidian2lk/index.js';
import { verify } from './verify.js';

// Derive a source name from an export path, stripping the `.lk` or `.json`
// extension (LK now exports plain JSON as well as gzipped `.lk`).
function stripExportExt(inputPath: string): string {
  return basename(inputPath).replace(/\.(lk|json)$/i, '');
}

const program = new Command();

program
  .name('lk-converter')
  .description('Bidirectional LegendKeeper (.lk) ↔ Markdown converter')
  .version('1.0.0');

program
  .command('lk2md')
  .description('Convert .lk/.json file(s) to markdown files')
  .argument(
    '<input...>',
    'Path(s) to .lk or .json export file(s) — supports globs like imports/*.lk',
  )
  .option('-o, --output <dir>', 'Output directory (default: current directory)')
  .action((inputs: string[], opts: { output?: string }) => {
    for (const input of inputs) {
      const inputPath = resolve(input);
      const sourceName = stripExportExt(inputPath);
      const outputDir = opts.output ? resolve(opts.output) : resolve('.');
      lk2md(inputPath, outputDir, sourceName);
    }
  });

program
  .command('md2lk')
  .description('Convert markdown files back to a .lk file')
  .argument(
    '<input>',
    'Directory containing markdown files, or a single .md file',
  )
  .option(
    '-o, --output <file>',
    'Output .lk file (default: for-import/<dir-name>.lk)',
  )
  .option(
    '-s, --source <name>',
    'Source name to export (default: inferred from input directory name)',
  )
  .action((input: string, opts: { output?: string; source?: string }) => {
    const inputPath = resolve(input);
    const inferredName = inputPath.endsWith('.md')
      ? basename(inputPath, '.md')
      : basename(inputPath);
    const outputPath = opts.output
      ? resolve(opts.output)
      : resolve('for-import', `${inferredName}.lk`);
    const sourceName = opts.source || inferredName;
    mkdirSync(dirname(outputPath), { recursive: true });
    md2lk(inputPath, outputPath, sourceName);
  });

program
  .command('obsidian2lk')
  .description('Import an Obsidian vault into a .lk file')
  .argument('<vault-path>', 'Path to Obsidian vault root directory')
  .option(
    '-o, --output <file>',
    'Output .lk file (default: for-import/<vault-name>.lk)',
  )
  .action((input: string, opts: { output?: string }) => {
    const inputPath = resolve(input);
    const vaultName = basename(inputPath);
    const outputPath = opts.output
      ? resolve(opts.output)
      : resolve('for-import', `${vaultName}.lk`);
    mkdirSync(dirname(outputPath), { recursive: true });
    obsidian2lk(inputPath, outputPath);
  });

program
  .command('lk2obsidian')
  .description(
    'Convert .lk/.json file(s) to Obsidian-compatible markdown vaults',
  )
  .argument(
    '<input...>',
    'Path(s) to .lk or .json export file(s) — supports globs like imports/*.lk',
  )
  .option('-o, --output <dir>', 'Output directory (default: current directory)')
  .action((inputs: string[], opts: { output?: string }) => {
    const lkInputs = inputs.map((input) => {
      const inputPath = resolve(input);
      const sourceName = stripExportExt(inputPath);
      const outputDir = opts.output ? resolve(opts.output) : resolve('.');
      return { inputPath, outputDir, sourceName };
    });
    lk2obsidian(lkInputs);
  });

program
  .command('verify')
  .description('Verify round-trip integrity of .lk/.json file(s)')
  .argument('<input...>', 'Path(s) to .lk or .json export file(s) to verify')
  .action((inputs: string[]) => {
    for (const input of inputs) {
      const inputPath = resolve(input);
      verify(inputPath);
    }
  });

program.parse();
