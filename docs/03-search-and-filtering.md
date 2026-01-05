# 03 · Search and Filtering

This guide walks through the available query methods and the metadata filters that keep results precise.

## Match scores

`semanticTranslationSearch` returns `Match` objects with three metrics:

- `semantic`: cosine-like similarity derived from the LanceDB vector distance
- `fuzzy`: LCS-based string similarity supplied by `MatchQuality`
- `hybridScore()`: the rounded mean of the two measures, i.e. $hybrid = \frac{semantic + fuzzy}{2}$

Set the `similarity` argument to the minimum hybrid score you are willing to accept (0–100).

## Translation search

```typescript
import { HybridTM } from 'hybridtm';

const matches = await tm.semanticTranslationSearch(
  'Reset password', // query text
  'en',             // source language
  'es',             // target language
  55,               // minimum hybrid score
  10,               // limit
  {
    target: { states: ['reviewed', 'final'] }
  }
);
```

The optional `TranslationSearchFilters` argument lets you require metadata on the source, target, or both sides. When no target segment exists for the same unit, the candidate is dropped. `states` filters rely on the normalized `state` metadata saved during XLIFF imports; TMX entries do not carry a state value, so those filters have no effect on TMX-only data.

## Monolingual semantic search

Use `semanticSearch` to inspect the contents of a single language without pairing it with translations:

```typescript
const entries = await tm.semanticSearch(
  'settings',
  'en',
  5,
  {
    contextIncludes: ['ui.settings'],
    minState: 'translated'
  }
);

entries.forEach((entry) => {
  console.log(entry.pureText, entry.metadata.state, entry.metadata.context);
});
```

`semanticSearch` returns full `LangEntry` objects, so you can read metadata directly.

## Concordance search

```typescript
const variations = await tm.concordanceSearch('error', 'en', 10);
variations.forEach((languageMap, index) => {
  console.log('Unit', index + 1);
  for (const [lang, element] of languageMap) {
    console.log('  •', lang, element.toString());
  }
});
```

Concordance search aggregates all language variants for the units that contain a fragment in the requested language, which is useful for terminology reviews.

## Metadata filters reference

| Field | Applies to | Description |
| --- | --- | --- |
| `states` | target (and any language that carries `state`) | Allow only specific normalized states captured from XLIFF imports. |
| `minState` | target (and any language that carries `state`) | Enforce a minimum review level (`initial` < `translated` < `reviewed` < `final`). |
| `contextIncludes` | source/target | Array of substrings that must all appear in the stored context string (case-insensitive). |
| `requiredProperties` | source/target | Key/value pairs that must be present in `metadata.properties`. |
| `provider` | source/target | Restrict to segments imported from a specific provider identifier. |

Combine filters to keep noisy segments out—for instance, restrict `states` to `['reviewed', 'final']` and require `provider: 'xliff'` when mixing manually curated content with raw imports.

## Ranking

`semanticTranslationSearch` sorts matches by an internal ranking score that favors:

- Higher hybrid score
- Matching segment indexes between the source and target entries
- Newer `changeDate`/`creationDate`
- Target state of `final` or `reviewed`

Understanding these tie-breakers helps predict why two candidates swap positions when you adjust metadata.

Continue with [04 · Sample Scenarios](04-sample-scenarios.md) to see these concepts executed end to end.
