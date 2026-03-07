# lk-converter

Bidirectional LegendKeeper (`.lk`) ↔ Markdown converter for lossless round-tripping.

## Setup

```bash
cd lk-converter
pnpm install
```

## Workflow

1. Export `.lk` files from LegendKeeper
2. Drop them into `lk-converter/imports/`
3. Convert to markdown:
   ```bash
   pnpm lk2md imports/Compendium.lk    # → ../Compendium/
   pnpm lk2md imports/Players.lk       # → ../Players/
   pnpm lk2md imports/Sessions.lk      # → ../Sessions/
   ```
4. Edit markdown files (with Claude or any editor)
5. Convert back to `.lk`:
   ```bash
   pnpm md2lk ../Compendium            # → for-import/Compendium.lk
   pnpm md2lk ../Players               # → for-import/Players.lk
   ```
6. Import `.lk` from `for-import/` back into LegendKeeper

## Commands

```bash
# Convert .lk → markdown
pnpm lk2md <path-to-.lk-file> [-o output-dir]

# Convert markdown → .lk
pnpm md2lk <markdown-dir> [-o output-file]

# Verify round-trip integrity
pnpm verify <path-to-.lk-file>
```

## Directory Structure

```
lk-converter/
  imports/          # Drop .lk files here
  for-import/       # Generated .lk files for re-import
  src/
    cli.ts          # CLI entry point
    verify.ts       # Round-trip verification
    lk2md/          # .lk → markdown conversion
    md2lk/          # markdown → .lk conversion
    shared/         # Shared types
```

## Markdown Format

### Frontmatter
Resource metadata stored under `lk:` namespace in YAML frontmatter.

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
Documents separated by `<!-- lk-doc: TabName -->`.

### Skipped Document Types
Map, timeline, and board documents are stored raw in `_lk_meta.json` and passed through unchanged.

## Verify Results

The verify command tests lossless round-tripping (`.lk` → md → `.lk` → compare):

| File | Resources | Documents | Remaining Diffs |
|---|---|---|---|
| Compendium.lk | 449 | 549 | 14 (1 resource) |
| Players.lk | 25 | 38 | 3 |
| Sessions.lk | 60 | 61 | 3 |

Remaining diffs are markdown ambiguity edge cases (paragraph text starting with `1.` or `- ` being re-parsed as lists, trailing whitespace in text nodes).
