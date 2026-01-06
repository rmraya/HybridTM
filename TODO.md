# TODO

- Implement a new mechanism to provide batch import progress information to consumers without relying on console logging.
- Add a backup export flow that produces at most one TMX file plus zero or many bilingual XLIFF files, skipping embeddings to keep artifacts lightweight while preserving segment metadata.
- Extend the Match class (and semanticTranslationSearch output) to include source and target metadata so translation searches return the same metadata details as semanticSearch.
- Design a pluggable glossary import pipeline starting with TBX and GlossML support, aligned with the existing XLIFF/TMX reader → JSONL → BatchImporter flow.
- Provide a CLI that can run imports (XLIFF/TMX/glossaries) and execute searches (concordance, semantic, translation) against a HybridTM instance for scripting and automation.
