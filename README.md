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
    lk2md/              # .lk → markdown conversion (round-trip)
    md2lk/              # markdown → .lk conversion
    lk2obsidian/        # .lk → clean Obsidian vault (one-way)
    obsidian2lk/        # Obsidian vault → .lk
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
lk-converter lk2obsidian ~/exports/Compendium.lk -o ./obsidian-vault/
lk-converter obsidian2lk ~/MyVault -o vault-import.lk
lk-converter verify ~/exports/Compendium.lk
```

To unlink later:

```bash
pnpm unlink --global
```

### Without linking

You can run commands directly inside the project:

```bash
pnpm lk2md <path-to-.lk-file> [-o output-dir]
pnpm md2lk <markdown-dir> [-o output-file]
pnpm verify <path-to-.lk-file>
```

Or invoke any command via `tsx`:

```bash
pnpm tsx src/cli.ts lk2obsidian <path-to-.lk-file> [-o output-dir]
pnpm tsx src/cli.ts obsidian2lk <vault-path> [-o output-file]
```

## Usage

### Convert `.lk` to Markdown (round-trip)

```bash
lk-converter lk2md <path-to-.lk-file> [-o output-dir]
```

Extracts all resources and documents into a directory of markdown files with YAML frontmatter. Preserves all LK metadata in a `lk:` namespace and HTML comments so the result can be converted back to `.lk` losslessly.

Supports multiple files and globs:

```bash
lk-converter lk2md imports/*.lk -o ./output/
```

### Convert Markdown to `.lk`

```bash
lk-converter md2lk <markdown-dir> [-o output-file] [-s source-name]
```

Reassembles a markdown directory back into a `.lk` file ready for import into LegendKeeper. Accepts either a directory or a single `.md` file. Reads `_lk_meta.json` from the input (or an ancestor directory) to restore skipped document types (maps, timelines, boards).

Default output: `for-import/<dir-name>.lk`.

### Convert `.lk` to Obsidian vault (one-way, clean)

```bash
lk-converter lk2obsidian <path-to-.lk-file> [-o output-dir]
```

Converts `.lk` files into **clean Obsidian-compatible markdown** with zero LK artifacts. Unlike `lk2md`, this output is not round-trippable — it's optimized for editing and reading in Obsidian.

What gets converted:

- **Frontmatter**: only `tags` and `aliases` (no `lk:` namespace)
- **Panels** → Obsidian callouts (`:::panel-info` → `> [!NOTE]`, warning → `> [!WARNING]`, etc.)
- **Secrets** → `> [!ABSTRACT]` callouts
- **Expands** → collapsed callouts (`> [!NOTE]- Title`)
- **Layouts** → [Multi-Column Markdown](https://github.com/ckRobinson/multi-column-markdown) plugin syntax with original column widths preserved
- **Mentions & internal links** → wiki-links (`[[Note Name]]` or `[[Note Name|display text]]`)
- All `<!-- lk-* -->` metadata comments stripped
- No `_lk_meta.json` written

Multiple `.lk` files can be converted in one command — cross-file mentions and links are resolved as wiki-links across the entire set:

```bash
lk-converter lk2obsidian world.lk npcs.lk quests.lk -o ./vault/
```

This produces `./vault/World/`, `./vault/NPCs/`, `./vault/Quests/` (folder names come from each file's root resource).

**Recommended Obsidian plugin:** [Multi-Column Markdown](https://github.com/ckRobinson/multi-column-markdown) for rendering LK layouts as actual side-by-side columns.

### Convert Obsidian vault to `.lk`

```bash
lk-converter obsidian2lk <vault-path> [-o output-file]
```

Imports an Obsidian vault into a `.lk` file. Handles standard Obsidian syntax:

- **Wiki-links** (`[[Note]]`, `[[Note|Display]]`) → LK links
- **Embeds** (`![[image.png]]`, `![[image.png|alt]]`) → LK images/media
- **Callouts** (`> [!NOTE]`, `> [!WARNING]`, etc.) → LK panels
- **Inline tags** (`#tag`, `#lore/history`) → extracted to resource tags
- **Frontmatter** `tags` and `aliases` → LK resource metadata
- **Obsidian comments** (`%%...%%`) → stripped
- **Highlights** (`==text==`) → plain text
- Folder structure → LK resource hierarchy

Default output: `for-import/<vault-name>.lk`.

### Verify round-trip integrity

```bash
lk-converter verify <path-to-.lk-file>
```

Runs a full round-trip (`.lk` → markdown → `.lk`) and reports any differences. Applies to the `lk2md`/`md2lk` pipeline only.

## Disclaimer

This project was written with the assistance of AI. Use at your own risk.

## License

MIT
