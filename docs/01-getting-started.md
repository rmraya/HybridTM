# 01 · Getting Started

Use this guide to configure a HybridTM workspace, create your first translation memory instance, and issue the first query. The examples target Node.js 18 or later.

## Prerequisites

- Node.js 22 LTS or later
- npm 11+
- Network access so the selected Xenova model can download on first use (defaults to `HybridTM.QUALITY_MODEL`, a LaBSE encoder)
- Enough disk space for the LanceDB database directory you select and the model cache stored under your home directory

## Install the library

### Use HybridTM as a dependency

```bash
npm install hybridtm
```

### Work directly from this repository

```bash
git clone https://github.com/rmraya/HybridTM.git
cd HybridTM
npm install
npm run build
```

Running `npm run build` compiles the TypeScript sources into `dist/`, which is what downstream projects (including the samples) consume.

## Manage instances with `HybridTMFactory`

HybridTM stores open instances inside a small registry (`instances.json`) under the user configuration directory (`~/Library/Application Support/HybridTM` on macOS, `%APPDATA%/HybridTM` on Windows, `~/.config/HybridTM` on Linux). Use the factory helpers to keep that registry in sync:

```typescript
import path from 'node:path';
import { HybridTM, HybridTMFactory } from 'hybridtm';

const INSTANCE_NAME = 'docs-basic';
const DB_PATH = path.resolve(process.cwd(), '.hybridtm', INSTANCE_NAME + '.lancedb');

function getOrCreateInstance(): HybridTM {
  const existing = HybridTMFactory.getInstance(INSTANCE_NAME);
  if (existing) {
    return existing;
  }
  return HybridTMFactory.createInstance(INSTANCE_NAME, DB_PATH, HybridTM.QUALITY_MODEL);
}
```

Use `HybridTMFactory.removeInstance(name)` when you need to delete both the registry entry and the LanceDB directory, and `HybridTMFactory.listInstances()` to inspect everything that is currently tracked.

## Populate the translation memory

You can import XLIFF/TMX files or inject entries manually. The minimal manual approach uses `storeLangEntry` twice (one per language):

```typescript
import { Utils } from 'hybridtm';

const tm = getOrCreateInstance();
const source = Utils.buildXMLElement('<source>Hello world</source>');
const target = Utils.buildXMLElement('<target>Hola mundo</target>');

await tm.storeLangEntry('demo', 'demo.xlf', 'unit1', 'en', 'Hello world', source, undefined, 1, 1, { state: 'final' });
await tm.storeLangEntry('demo', 'demo.xlf', 'unit1', 'es', 'Hola mundo', target, undefined, 1, 1, { state: 'final' });
```

When you already have bilingual files, call `tm.importXLIFF(filePath, options?)` or `tm.importTMX(filePath, options?)`. The importer normalizes metadata (state, subState, quality, context, custom properties) before bulk-loading it into LanceDB.

## Run the first translation search

`semanticTranslationSearch` generates an embedding for the query text, finds the best source-language candidates, and pairs every hit with the closest target-language segment from the same unit:

```typescript
const matches = await tm.semanticTranslationSearch(
  'Sign in',  // text to match
  'en',       // source language
  'es',       // target language
  50,         // minimum hybrid score (0-100)
  5           // maximum number of matches
);

matches.forEach((match) => {
  console.log('Hybrid', match.hybridScore(), 'Semantic', match.semantic, 'Fuzzy', match.fuzzy);
  console.log('Source:', match.source.toString());
  console.log('Target:', match.target.toString());
});
```

Call `await tm.close()` once you are done so LanceDB can flush its buffers.

## Concordance and cleanup

Use `tm.concordanceSearch(fragment, language, limit?, filter?)` to retrieve all language variants that contain a fragment (for terminology checks or QA). To delete the temporary database created for a tutorial run, call `HybridTMFactory.removeInstance(INSTANCE_NAME)`.

## Next steps

- Study the runnable counterpart in [samples/src/basicWorkflow.ts](samples/src/basicWorkflow.ts)
- Continue with [02 · Importing Data](02-importing-data.md) to configure bulk imports
- Explore scoring and filtering strategies in [03 · Search and Filtering](03-search-and-filtering.md)
