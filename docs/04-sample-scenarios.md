# 04 · Sample Scenarios

The `samples/` directory is a self-contained TypeScript project that demonstrates the API in runnable scripts. Each sample recreates a clean instance, runs a workflow, prints its output, and closes the database.

> The first time you run any sample, HybridTM automatically downloads the embedding model weights. The scripts now print a reminder before instantiating the engine so you know why the process may pause for a minute.

## How to run the samples

### When working inside this repository

```bash
npm install
npm run build
cd samples
npm install
```

### When copying `samples/` elsewhere

1. Copy the `samples/` directory to a new location
2. Edit `samples/package.json` and set the `hybridtm` dependency to the published version you want to test (for example `"^1.0.0"`)
3. Run `npm install`

> The default `package.json` points to the parent folder (`"file:.."`) so the samples always use the current source tree while you iterate locally.

## Available scripts

| Script | Command | Description |
| --- | --- | --- |
| Basic workflow | `npm run dev:basic` | Shows how to create an instance, insert two bilingual segments manually, and request matches. See [samples/src/basicWorkflow.ts](samples/src/basicWorkflow.ts). |
| Import files | `npm run dev:import` | Imports the bundled XLIFF/TMX snippets from `samples/data`, then performs a semantic translation search. See [samples/src/importFiles.ts](samples/src/importFiles.ts). |
| Filters & concordance | `npm run dev:filters` | Demonstrates metadata-aware searches (`semanticSearch`, `semanticTranslationSearch` with filters, and `concordanceSearch`). See [samples/src/metadataFilters.ts](samples/src/metadataFilters.ts). |

Each script writes its LanceDB files under `samples/.hybridtm-samples/<scenario>.lancedb`. Delete that folder to reset the environment.

## Sample data

The `samples/data` directory contains tiny bilingual fixtures:

- [samples/data/demo.xlf](samples/data/demo.xlf): Valid XLIFF 2.0 sample with file-level notes, multiple login variations at different review states, and metadata groups for context/properties used by the filters tutorial
- [samples/data/demo.tmx](samples/data/demo.tmx): TMX 1.4 entries that add usage notes, login reminders, context props, and lifecycle metadata to complement the XLIFF sample

These files are intentionally short so you can read them alongside the console output.

With the tutorials complete, you can adapt the scripts into your own tools or wire the library into an existing CAT workflow.
