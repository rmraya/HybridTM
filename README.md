# HybridTM

HybridTM is a TypeScript translation memory engine that stores bilingual content in LanceDB and scores matches by combining semantic embeddings (Xenova/Transformers.js) with the built-in MatchQuality fuzzy metric.

## Highlights

- Imports XLIFF 2.x and TMX 1.4b files, preserving metadata, notes, and custom properties
- Generates semantic vectors with any Xenova-compatible text model (default: `HybridTM.QUALITY_MODEL`, LaBSE)
- Provides `semanticTranslationSearch`, `semanticSearch`, and `concordanceSearch` APIs with metadata-aware filtering
- Streams data into LanceDB through a JSONL-based batch importer to keep memory usage predictable
- Prevents duplicate segments by rewriting entries with deterministic IDs (`fileId:unitId:segmentIndex:lang`)

Models download automatically the first time you initialize an instance and are cached in the standard Hugging Face directory.

## Requirements

- Node.js 22 LTS or later
- npm 11+
- Disk space for both the LanceDB directory you choose and the embedding model cache

## Installation

```bash
npm install hybridtm
```

## Quick start

```typescript
import path from 'node:path';
import { HybridTM, HybridTMFactory, Utils } from 'hybridtm';

const INSTANCE_NAME = 'docs-basic';
const DB_PATH = path.resolve('.hybridtm', INSTANCE_NAME + '.lancedb');

function getOrCreateTM(): HybridTM {
  return HybridTMFactory.getInstance(INSTANCE_NAME)
    ?? HybridTMFactory.createInstance(INSTANCE_NAME, DB_PATH, HybridTM.QUALITY_MODEL);
}

async function main(): Promise<void> {
  const tm = getOrCreateTM();
  const source = Utils.buildXMLElement('<source>Hello world</source>');
  const target = Utils.buildXMLElement('<target>Hola mundo</target>');

  await tm.storeLangEntry('demo', 'demo.xlf', 'unit1', 'en', 'Hello world', source, undefined, 1, 1, { state: 'final' });
  await tm.storeLangEntry('demo', 'demo.xlf', 'unit1', 'es', 'Hola mundo', target, undefined, 1, 1, { state: 'final' });

  const matches = await tm.semanticTranslationSearch('Hi world', 'en', 'es', 50, 5);
  matches.forEach((match) => {
    console.log('Hybrid', match.hybridScore(), 'Semantic', match.semantic, 'Fuzzy', match.fuzzy);
    console.log('Source:', match.source.toString());
    console.log('Target:', match.target.toString());
  });

  await tm.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

Import XLIFF/TMX content at any time:

```typescript
await tm.importXLIFF('./translations/project.xlf', { minState: 'reviewed' });
await tm.importTMX('./translations/legacy.tmx');
```

`semanticTranslationSearch` automatically pairs every source hit with its matching target segment (same `fileId`, `unitId`, and `segmentIndex`), making the output ready for CAT integrations.

## Documentation

- [01 · Getting Started](docs/01-getting-started.md)
- [02 · Importing Data](docs/02-importing-data.md)
- [03 · Search and Filtering](docs/03-search-and-filtering.md)
- [04 · Sample Scenarios](docs/04-sample-scenarios.md)

Each guide is short and task-oriented, so you can jump directly to the workflow you need.

## Runnable samples

The [samples](docs/04-sample-scenarios.md) project contains three scripts (`dev:basic`, `dev:import`, `dev:filters`) plus miniature XLIFF/TMX fixtures.

When working on the repository:

```bash
npm install
npm run build
cd samples
npm install
npm run dev:basic
```

If you copy `samples/` elsewhere, update `samples/package.json` so the `hybridtm` dependency points to the published version you intend to test, then run `npm install`.

## Project layout

- `ts/` – source files for the library
- `dist/` – compiled JavaScript and declarations (`npm run build`)
- `docs/` – task-focused tutorials referenced above
- `samples/` – standalone TypeScript project with runnable workflows
- `models/` – local cache for pre-downloaded Xenova models (optional)

## Development

- `npm run build` – compile TypeScript to `dist/`
- `node dist/tmxtest.js` and `node dist/xlifftest.js` – regression checks for the TMX and XLIFF importers (run after building)

Contributions should include unit or integration coverage when you touch importer or search logic. Use `HybridTMFactory.removeInstance(name)` to clean up any throwaway databases you create during manual tests.

## License

Eclipse Public License 1.0 — see [LICENSE](LICENSE) for details.
