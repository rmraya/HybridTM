# 02 · Importing Data

HybridTM ingests industry-standard bilingual files in two phases: the reader (`XLIFFReader` or `TMXReader`) parses the source document into a temporary JSONL file, and the `BatchImporter` streams that file into LanceDB in batches. This makes large imports predictable while keeping memory usage low.

## Importing XLIFF 2.x

```typescript
import path from 'node:path';
import { HybridTM, HybridTMFactory } from 'hybridtm';

const tm = HybridTMFactory.getInstance('docs-basic')
  ?? HybridTMFactory.createInstance('docs-basic', path.resolve('.data/docs-basic.lancedb'), HybridTM.QUALITY_MODEL);

await tm.importXLIFF(path.resolve('translations/demo.xlf'));
```

The importer validates that the document is XLIFF 2.x (version header plus `srcLang`/`trgLang`), walks every `<unit>`, extracts `<segment>` content, and normalizes each `state` value to the standard XLIFF 2 levels (`initial`, `translated`, `reviewed`, `final`).

## Importing TMX 1.4b

```typescript
await tm.importTMX(path.resolve('translations/legacy.tmx'));
```

TMX import preserves every `<tu>`/`<tuv>` pair, computes canonical IDs (`fileId:unitId:segmentIndex:lang`), and converts notes, creation/change metadata, and custom fields into the HybridTM metadata map.

## Import options

Use `ImportOptions` to tune the ingestion pass. All fields are optional; unspecified values fall back to the defaults listed below.

| Option | Default | Description |
| --- | --- | --- |
| `minState` | `translated` | Minimum normalized state (`initial`, `translated`, `reviewed`, `final`). Only XLIFF imports honor this filter; TMX entries are always imported. |
| `skipEmpty` | `true` | Drop segments whose normalized target text is empty or whitespace. |
| `skipUnconfirmed` | `true` | Skip XLIFF segments that do not carry a `state` attribute (no effect for TMX imports). |
| `extractMetadata` | `true` | Parse metadata attributes, notes, and custom properties into the LanceDB columns. |

Example:

```typescript
await tm.importXLIFF(filePath, {
  minState: 'reviewed',
  skipEmpty: true,
  skipUnconfirmed: false,
  extractMetadata: true
});
```

## Metadata extracted from files

When `extractMetadata` is enabled, HybridTM captures the following fields per segment:

- `state`, `subState`, and normalized `matchQuality`/`quality`
- Lifecycle attributes (`creationDate`, `creationId`, `changeDate`, `changeId`, `creationTool`, `creationToolVersion`)
- `context` attribute or the first custom property that contains "context"
- `<note>` values aggregated into `notes`
- Custom metadata (`properties`) assembled from `<metadata>`/`<metaGroup>` blocks
- Segment provenance (file ID, unit ID, explicit segment ID/index/count)

Downstream searches can filter on these values without reparsing the original files.

## Performance checklist

- Large corpora import faster when you keep the default batch size (1000 entries) and run imports on SSD-backed storage
- You can monitor progress through the console logs emitted by `BatchImporter`
- Temporary JSONL files are deleted automatically after the import finishes; if an import fails, delete leftover files before retrying
- The selected embedding model dictates import time—choose `HybridTM.SPEED_MODEL` for quick smoke tests and switch to `HybridTM.QUALITY_MODEL` for production-quality scores

Continue with [03 · Search and Filtering](03-search-and-filtering.md) once your database is populated.
