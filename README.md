# lk-converter

> This project is not affiliated with, endorsed by, or associated with LegendKeeper or its developers. I needed a way to solve this so I made a tool.

# READ THIS BEFORE USING

Bidirectional [LegendKeeper](https://www.legendkeeper.com/) (`.lk`) ↔ Markdown converter for lossless round-tripping.

Convert `.lk` export files into human-readable markdown, edit them with any tool, then convert back for re-import, without losing data.

## Intended use case

LegendKeeper allows exporting files in differnt formats, however most of those formats don't preserve the document in the way it looks in LegendKeeper.
However `.lk` exports (gzipped JSON) does preserves the exact structure/look of files. By converting your `.lk` exports into plain markdown files, you can feed your world content to AI tools (like Claude, ChatGPT, etc.) to:

- Track and query world details, ask questions about your lore, characters, locations, and timelines
- Maintain consistency detect contradictions in dates, character descriptions, faction relationships, and other lore details across your world
- Find and fix inconsistencies surface errors like conflicting timelines, duplicate names, or orphaned references
- And if you are **really lazy** even generate new content, but I'd suggest doing that yourself or this whole thing is kinda boring... 

You can edit .md files but `lk-converter` does add certain things in the files to be able to preserve structure.

Once you're done, convert back to `.lk` and re-import into LegendKeeper.

**Note**
LegendKeeper doesn't replace imports of folders, so if you import an entire folder of files it will create a duplicate folder, good to avoid destroying everything if this tool fails.

## Markdown Format

### Frontmatter
_Do not edit, required for round-tripping_

Resource metadata is stored under a `lk:` namespace in YAML frontmatter.

### Directives (`:::`)
_Can be edited but be careful, required for structure_
| LK Element | Markdown |
|---|---|
| Panel | `:::panel-success` / `:::panel-info` / `:::panel-warning` / `:::panel-error` / `:::panel-note` |
| Secret | `:::secret` |
| Layout | `:::layout` with `:::col-50` columns |
| Expand | `:::expand Title` |
| Extension | `:::extension` |

### Inline Elements

| Element | Syntax | Safe to edit? |
|---|---|---|
| Cross-reference | `@[Display Name](lk://document-id)` | No, changing the ID will break the link |
| Bold | `**text**` | Yes |
| Italic | `*text*` | Yes |
| Bold+Italic | `***text***` | Yes |
| Code | `` `text` `` | Yes |
| Strikethrough | `~~text~~` | Yes |
| Underline | `<u>text</u>` | Yes |
| Link | `[text](url)` | Yes |

### Metadata Comments
_Do not edit, required for round-tripping_

- `<!-- lk-media: {...} -->`: image/media attributes
- `<!-- lk-table: {...} -->`: table structure with raw row data
- `<!-- lk-mention: {...} -->`: mention attributes
- `<!-- lk-pm: [...] -->`: raw ProseMirror content for complex inline marks

### Multi-document Resources

Documents are separated by `<!-- lk-doc: TabName -->`.

### Skipped Document Types

Map, timeline, and board documents are stored raw in `_lk_meta.json` and passed through unchanged.

## Project Structure

```
lk-converter/
  src/
    cli.ts              # CLI entry point
    verify.ts           # Round-trip verification
    lk2md/              # .lk → markdown conversion
    md2lk/              # markdown → .lk conversion
    shared/             # Shared types
```

## Installation

```bash
git clone https://github.com/YOUR_USERNAME/lk-converter.git
cd lk-converter
pnpm install
pnpm build
```

### Global CLI via `pnpm link`

After building, you can make `lk-converter` available as a global command:

```bash
pnpm link --global
```

Now you can run it from anywhere:

```bash
lk-converter lk2md ~/exports/Compendium.lk -o ./output/
lk-converter md2lk ./output/Compendium/ -o reimport.lk
lk-converter verify ~/exports/Compendium.lk
```

To unlink later:

```bash
pnpm unlink --global
```

### Without linking

You can also run commands directly inside the project using `pnpm`:

```bash
pnpm lk2md <path-to-.lk-file> [-o output-dir]
pnpm md2lk <markdown-dir> [-o output-file]
pnpm verify <path-to-.lk-file>
```

## Usage

### Convert `.lk` to Markdown

```bash
lk-converter lk2md <path-to-.lk-file> [-o output-dir]
```

Extracts all resources and documents into a directory of markdown files with YAML frontmatter.

### Convert Markdown to `.lk`

```bash
lk-converter md2lk <markdown-dir> [-o output-file]
```

Reassembles a markdown directory back into a `.lk` file ready for import into LegendKeeper.

### Verify round-trip integrity

```bash
lk-converter verify <path-to-.lk-file>
```

Runs a full round-trip (`.lk` → markdown → `.lk`) and reports any differences.

## Disclaimer

This project was written with the assistance of AI. Use at your own risk.

## License

MIT
