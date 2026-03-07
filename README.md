# lk-converter

Bidirectional [LegendKeeper](https://www.legendkeeper.com/) (`.lk`) ↔ Markdown converter for lossless round-tripping.

Convert `.lk` export files into human-readable markdown, edit them with any tool, then convert back for re-import — without losing data.

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

## Markdown Format

### Frontmatter

Resource metadata is stored under a `lk:` namespace in YAML frontmatter.

### Directives (`:::`)

| LK Element | Markdown |
|---|---|
| Panel | `:::panel-success` / `:::panel-info` / `:::panel-warning` / `:::panel-error` / `:::panel-note` |
| Secret | `:::secret` |
| Layout | `:::layout` with `:::col-50` columns |
| Expand | `:::expand Title` |
| Extension | `:::extension` |

### Inline Elements

| Element | Syntax |
|---|---|
| Cross-reference | `@[Display Name](lk://document-id)` |
| Bold | `**text**` |
| Italic | `*text*` |
| Bold+Italic | `***text***` |
| Code | `` `text` `` |
| Strikethrough | `~~text~~` |
| Underline | `<u>text</u>` |
| Link | `[text](url)` |

### Metadata Comments

- `<!-- lk-media: {...} -->` — image/media attributes
- `<!-- lk-table: {...} -->` — table structure with raw row data
- `<!-- lk-mention: {...} -->` — mention attributes
- `<!-- lk-pm: [...] -->` — raw ProseMirror content for complex inline marks

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

## License

MIT
