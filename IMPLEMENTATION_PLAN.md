# HybridTM Enhancement Implementation Plan

**Version:** 1.0  
**Date:** December 10, 2025  
**Status:** Planning Phase

## Overview

This plan outlines the enhancement of HybridTM to support:

1. Segment-level granularity for XLIFF 2.x files
2. Metadata extraction and storage for translator decision support
3. Quality filtering (state-based for XLIFF, property-based for TMX)
4. Improved target matching for both merged and segmented entries

## Implementation Phases

---

## Phase 1: Data Model Enhancement

### 1.1 Update LangEntry Interface ⬜

**File:** `ts/langEntry.ts`

**Changes:**

```typescript
export interface LangEntry {
    // Existing fields
    id: string;              // NEW FORMAT: fileId:unitId:segmentIndex:language
    language: string;
    pureText: string;
    element: string;
    fileId: string;
    original: string;
    unitId: string;
    vector: number[];
    
    // NEW: Segmentation support
    segmentIndex: number;    // 0 = full unit/TMX, 1+ = XLIFF segment
    segmentCount: number;    // Total segments in unit
    
    // NEW: Metadata
    metadata: EntryMetadata;
    
    [key: string]: any;
}

export interface EntryMetadata {
    // Quality and state
    state?: 'translated' | 'reviewed' | 'final';
    subState?: string;
    quality?: number;           // 0-100 score
    
    // Provenance
    creationDate?: string;
    creationId?: string;
    changeDate?: string;
    changeId?: string;
    creationTool?: string;
    creationToolVersion?: string;
    
    // Context
    context?: string;
    notes?: string[];
    
    // TMX usage tracking
    usageCount?: number;
    lastUsageDate?: string;
    
    // Flexible storage
    properties?: Record<string, string>;
}
```

**Testing:**

- [ ] Interface compiles without errors
- [ ] All existing code updated to use new structure

---

### 1.2 Update Database Schema ⬜

**File:** `ts/hybridtm.ts` → `initializeDatabase()`

**Changes:**

```typescript
const schema: Schema = new Schema([
    Field.new('id', new Utf8(), false),
    Field.new('language', new Utf8(), false),
    Field.new('pureText', new Utf8(), false),
    Field.new('element', new Utf8(), false),
    Field.new('fileId', new Utf8(), false),
    Field.new('original', new Utf8(), false),
    Field.new('unitId', new Utf8(), false),
    
    // NEW: Segmentation fields
    Field.new('segmentIndex', new Int32(), false),
    Field.new('segmentCount', new Int32(), false),
    
    // NEW: Metadata fields (all nullable)
    Field.new('metadataState', new Utf8(), true),
    Field.new('metadataQuality', new Int32(), true),
    Field.new('metadataCreationDate', new Utf8(), true),
    Field.new('metadataChangeDate', new Utf8(), true),
    Field.new('metadataContext', new Utf8(), true),
    Field.new('metadataProperties', new Utf8(), true), // JSON string
    
    Field.new('vector', new FixedSizeList(dimensions, Field.new('item', new Float32(), false)), false),
]);
```

**Note:** Flatten metadata into schema fields for LanceDB compatibility. Serialize `properties` as JSON string.

**Testing:**

- [ ] New database creates successfully
- [ ] All fields accessible via queries
- [ ] NULL metadata fields handled correctly

---

## Phase 2: Import Options and Filtering

### 2.1 Create ImportOptions Interface ⬜

**File:** `ts/importOptions.ts` (NEW)

```typescript
export interface ImportOptions {
    // XLIFF state filtering
    minState?: 'translated' | 'reviewed' | 'final';
    
    // General filtering
    skipEmpty?: boolean;        // Skip empty targets (default: true)
    skipUnconfirmed?: boolean;  // Skip unconfirmed segments (default: true)
    
    // Metadata extraction
    extractMetadata?: boolean;  // Extract and store metadata (default: true)
}

export const DEFAULT_IMPORT_OPTIONS: ImportOptions = {
    minState: 'translated',
    skipEmpty: true,
    skipUnconfirmed: true,
    extractMetadata: true
};
```

**Testing:**

- [ ] Interface compiles
- [ ] Defaults work as expected

---

### 2.2 Update Import Method Signatures ⬜

**File:** `ts/hybridtm.ts`

**Changes:**

```typescript
async importXLIFF(filePath: string, options?: ImportOptions): Promise<void>
async importTMX(filePath: string, options?: ImportOptions): Promise<void>
```

**Testing:**

- [ ] Methods accept options parameter
- [ ] Defaults applied when options omitted
- [ ] Options passed to handlers correctly

---

## Phase 3: XLIFF Handler Enhancement

### 3.1 Update XLIFFHandler for Segment-Level Processing ⬜

**File:** `ts/xliffHandler.ts`

**Key Changes:**

1. **Add options to constructor:**

```typescript
constructor(tempFilePath: string, options: ImportOptions = DEFAULT_IMPORT_OPTIONS)
```

2. **Replace `processUnit()` method:**
   - Extract all `<segment>` elements
   - For each segment:
     - Check `@state` attribute
     - Skip if state < minState
     - Skip if empty target and skipEmpty = true
     - Extract metadata
     - Write segment entry (segmentIndex = 1, 2, 3...)
   - Create merged unit entry (segmentIndex = 0) if segmentCount > 1
   - Set segmentCount on all entries

3. **Add metadata extraction:**

```typescript
private extractMetadata(segment: XMLElement, unit: XMLElement): EntryMetadata {
    const metadata: EntryMetadata = {};
    
    // Extract state
    metadata.state = segment.getAttribute('state')?.getValue() as any;
    metadata.subState = segment.getAttribute('subState')?.getValue();
    
    // Extract dates from unit or segment
    // Extract notes
    // Extract mda:metadata module content
    
    return metadata;
}
```

4. **Update ID generation:**

```typescript
const entryId = `${fileId}:${unitId}:${segmentIndex}:${lang}`;
```

**Testing:**

- [ ] Single-segment units work correctly (segmentIndex = 1, segmentCount = 1)
- [ ] Multi-segment units create individual + merged entries
- [ ] State filtering works (initial segments skipped)
- [ ] Empty targets skipped when configured
- [ ] Metadata extracted correctly
- [ ] ID format correct for all entries

---

### 3.2 Update XLIFFReader ⬜

**File:** `ts/xliffReader.ts`

**Changes:**

- Pass options to XLIFFHandler constructor
- Update any related logic

**Testing:**

- [ ] Options flow through correctly
- [ ] Import completes without errors

---

## Phase 4: TMX Handler Enhancement

### 4.1 Update TMXHandler for Metadata ⬜

**File:** `ts/tmxHandler.ts`

**Key Changes:**

1. **Add options to constructor:**

```typescript
constructor(tempFilePath: string, filename: string, options: ImportOptions = DEFAULT_IMPORT_OPTIONS)
```

2. **Update `endElement()` for TUV processing:**
   - Extract TU-level metadata (dates, usagecount, etc.)
   - Extract TUV-level metadata
   - Extract `<prop>` elements
   - Set segmentIndex = 0, segmentCount = 1 (always)
   - Map TMX metadata to EntryMetadata structure

3. **Add metadata extraction:**

```typescript
private extractTMXMetadata(tu: XMLElement, tuv: XMLElement): EntryMetadata {
    const metadata: EntryMetadata = {};
    
    // Extract from TU attributes
    metadata.creationDate = tu.getAttribute('creationdate')?.getValue();
    metadata.changeDate = tu.getAttribute('changedate')?.getValue();
    metadata.usageCount = parseInt(tu.getAttribute('usagecount')?.getValue() || '0');
    
    // Extract from properties
    const props: Record<string, string> = {};
    tu.getChildren('prop').forEach(prop => {
        const type = prop.getAttribute('type')?.getValue();
        props[type] = Utils.getPureText(prop);
    });
    metadata.properties = props;
    
    // Map common properties to standard fields
    if (props['x-context']) metadata.context = props['x-context'];
    
    return metadata;
}
```

**Testing:**

- [ ] TMX imports work with segmentIndex = 0
- [ ] Metadata extracted from attributes
- [ ] Properties extracted and stored
- [ ] Common properties mapped to standard fields

---

### 4.2 Update TMXReader ⬜

**File:** `ts/tmxReader.ts`

**Changes:**

- Pass options to TMXHandler constructor

**Testing:**

- [ ] Options flow through correctly
- [ ] Import completes without errors

---

## Phase 5: Search Logic Enhancement

### 5.1 Update semanticTranslationSearch() ⬜

**File:** `ts/hybridtm.ts`

**Key Changes:**

1. **Enhanced target matching logic:**

```typescript
// After finding source match
const sourceSegmentIndex = sourceEntry.segmentIndex;

// Strategy 1: Try exact segment match first (if source is a segment)
if (sourceSegmentIndex > 0) {
    const exactId = `${sourceEntry.fileId}:${sourceEntry.unitId}:${sourceSegmentIndex}:${tgtLang}`;
    const exactMatch = await table.query().where(`id = '${exactId}'`).toArray();
    if (exactMatch.length > 0) {
        targetEntry = exactMatch[0];
    }
}

// Strategy 2: If no exact segment match, find any target from same unit
if (!targetEntry) {
    const unitPrefix = `${sourceEntry.fileId}:${sourceEntry.unitId}:`;
    const unitMatches = await table.query()
        .where(`starts_with(id, '${unitPrefix}') AND language = '${tgtLang}'`)
        .toArray();
    
    // Prefer segment-level matches over unit-level (segmentIndex > 0)
    targetEntry = unitMatches.find(e => e.segmentIndex > 0) || unitMatches[0];
}
```

2. **Ranking enhancement:**
   - Boost matches where source and target have same segmentIndex
   - Consider metadata quality in ranking
   - Prefer recent translations (changeDate)

**Testing:**

- [ ] Segment-to-segment matches work
- [ ] Unit-to-unit matches work
- [ ] Mixed matching works (segment source finds any target in unit)
- [ ] Ranking considers segmentIndex alignment
- [ ] No target found handled gracefully

---

### 5.2 Update concordanceSearch() ⬜

**File:** `ts/hybridtm.ts`

**Changes:**

- Ensure works with both segment-level and unit-level entries
- May need to deduplicate if both segment and merged unit contain fragment

**Testing:**

- [ ] Finds matches in individual segments
- [ ] Finds matches in merged units
- [ ] No unwanted duplicates in results

---

## Phase 6: Helper Methods and Utilities

### 6.1 Update storeLangEntry() ⬜

**File:** `ts/hybridtm.ts`

**Changes:**

- Accept metadata parameter
- Update to use new ID format with segmentIndex
- Flatten metadata for storage

**Testing:**

- [ ] Can store entries with metadata
- [ ] Can store entries without metadata (NULL fields)

---

### 6.2 Update storeBatchEntries() ⬜

**File:** `ts/hybridtm.ts`

**Changes:**

- Handle new fields in batch operations
- Ensure metadata serialization works correctly

**Testing:**

- [ ] Batch import works with new structure
- [ ] Performance acceptable with additional fields

---

### 6.3 Add Metadata Helper Methods ⬜

**File:** `ts/utils.ts` (or new `ts/metadataUtils.ts`)

```typescript
export class MetadataUtils {
    static flattenMetadata(metadata: EntryMetadata): Record<string, any> {
        // Flatten for LanceDB storage
    }
    
    static unflattenMetadata(flat: Record<string, any>): EntryMetadata {
        // Reconstruct from LanceDB row
    }
    
    static serializeProperties(props: Record<string, string>): string {
        // Convert to JSON string
    }
    
    static deserializeProperties(json: string): Record<string, string> {
        // Parse JSON string
    }
}
```

**Testing:**

- [ ] Roundtrip flatten/unflatten preserves data
- [ ] Properties serialize/deserialize correctly
- [ ] NULL handling works

---

## Phase 7: PendingEntry Updates

### 7.1 Update PendingEntry Interface ⬜

**File:** `ts/pendingEntry.ts`

**Changes:**

```typescript
export interface PendingEntry {
    language: string;
    fileId: string;
    original: string;
    unitId: string;
    pureText: string;
    element: XMLElement;
    
    // NEW
    segmentIndex: number;
    segmentCount: number;
    metadata: EntryMetadata;
}
```

**Testing:**

- [ ] BatchImporter works with new structure
- [ ] JSONL roundtrip preserves new fields

---

## Phase 8: Documentation and Examples

### 8.1 Update README.md ⬜

**Changes:**

- Document new ImportOptions
- Explain segment-level vs unit-level storage
- Show metadata usage examples
- Update code examples

**Testing:**

- [ ] Examples compile and run
- [ ] Documentation accurate

---

### 8.2 Update Test Files ⬜

**Files:** `ts/xlifftest.ts`, `ts/tmxtest.ts`

**Changes:**

- Add tests for segment-level matching
- Add tests for metadata filtering
- Add tests for state-based import
- Test multi-segment XLIFF files

**Testing:**

- [ ] All test scenarios pass
- [ ] New features demonstrated

---

---

## Phase 9: Migration and Compatibility

### 9.1 Database Version Handling ⬜

**Consideration:** Since we're not maintaining backward compatibility, old databases will need to be reimported.

**Implementation:**

- Add version marker to database
- Detect old schema and provide clear error message
- Guide users to reimport data

**Testing:**

- [ ] Old databases detected correctly
- [ ] Error message helpful
- [ ] New databases work correctly

---

## Implementation Checklist Summary

### Phase 1: Data Model ⬜

- [ ] 1.1 Update LangEntry Interface
- [ ] 1.2 Update Database Schema

### Phase 2: Import Options ⬜

- [ ] 2.1 Create ImportOptions Interface
- [ ] 2.2 Update Import Method Signatures

### Phase 3: XLIFF Handler ⬜

- [ ] 3.1 Update XLIFFHandler for Segment-Level Processing
- [ ] 3.2 Update XLIFFReader

### Phase 4: TMX Handler ⬜

- [ ] 4.1 Update TMXHandler for Metadata
- [ ] 4.2 Update TMXReader

### Phase 5: Search Logic ⬜

- [ ] 5.1 Update semanticTranslationSearch()
- [ ] 5.2 Update concordanceSearch()

### Phase 6: Helper Methods ⬜

- [ ] 6.1 Update storeLangEntry()
- [ ] 6.2 Update storeBatchEntries()
- [ ] 6.3 Add Metadata Helper Methods

### Phase 7: PendingEntry ⬜

- [ ] 7.1 Update PendingEntry Interface

### Phase 8: Documentation ⬜

- [ ] 8.1 Update README.md
- [ ] 8.2 Update Test Files

### Phase 9: Migration ⬜

- [ ] 9.1 Database Version Handling

---

## Testing Strategy

### Unit Tests

- [ ] Metadata extraction (XLIFF and TMX)
- [ ] State filtering
- [ ] Segment-level storage
- [ ] ID generation
- [ ] Target matching logic

### Integration Tests

- [ ] Import single-segment XLIFF
- [ ] Import multi-segment XLIFF
- [ ] Import TMX with properties
- [ ] Search with segment matches
- [ ] Search with metadata filtering
- [ ] Concordance search

### Performance Tests

- [ ] Import speed with metadata
- [ ] Search speed with additional fields
- [ ] Database size comparison

---

## Notes and Decisions

### ID Format Decision

**Format:** `fileId:unitId:segmentIndex:language`

- Consistent across TMX (always :0:) and XLIFF
- Allows prefix matching for unit-level queries
- segmentIndex = 0 for merged units and TMX entries
- segmentIndex > 0 for individual XLIFF segments

### Metadata Storage Decision

**Approach:** Flatten into schema fields

- Better query performance
- Native LanceDB type support
- Serialize `properties` as JSON string only

### State Filtering Decision

**Default:** Skip 'initial' state segments

- Matches professional TM tool behavior
- Ensures quality
- User-configurable via ImportOptions

### Segment Storage Strategy

**Approach:** Store both individual segments AND merged unit

- Maximum flexibility
- Precise matching + context
- ~3x storage cost acceptable for improved matching

---

## Future Enhancements (Out of Scope)

- [ ] UI for metadata display in CAT tools
- [ ] Advanced metadata-based filtering in searches
- [ ] Metadata-based ranking algorithms
- [ ] Export with metadata preservation
- [ ] Metadata editing capabilities
- [ ] Analytics on metadata (usage patterns, quality trends)
- [ ] Direct SDLXLIFF support
- [ ] Other proprietary TM format support (memoQ MQXLZ, Wordfast, etc.)

**Note:** SDLTM import is handled externally using the `sdltm` package to convert SDLTM files to TMX format before importing into HybridTM.

---

## Completion Criteria

This implementation is considered complete when:

1. All checkboxes in Implementation Checklist are marked ✅
2. All tests pass
3. Documentation is updated
4. Example files demonstrate new features
5. Performance is acceptable (< 20% degradation from current)
6. Code review completed
