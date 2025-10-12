# HybridTM

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![AI/ML](https://img.shields.io/badge/AI%2FML-FF6F00?style=for-the-badge&logo=tensorflow&logoColor=white)

A Translation Memory (TM) engine that combines traditional fuzzy matching with semantic similarity using transformer-based embeddings. HybridTM provides improved translation memory matching for CAT tools and supports multiple languages and writing systems.

## Features

### Hybrid Search Technology

- **MatchQuality Algorithm**: Improved fuzzy matching based on Longest Common Subsequence
- **Semantic Similarity**: Manhattan distance calculation for semantic understanding  
- **Adaptive Weighting**: Dynamic combination of fuzzy and semantic approaches
- **Cross-linguistic Support**: Works across Latin, Cyrillic, Arabic, and CJK scripts

## Model Selection Guide

HybridTM offers **three optimized models** for different use cases:

| Model | Pros | Cons |
|-------|------|------|
| **SPEED** (`Xenova/bge-small-en-v1.5`) | 30-40% faster inference, ultra-low memory (384D), real-time performance | Less semantic depth than larger models |
| **QUALITY** (`Xenova/LaBSE`) | 109 languages, excellent cross-language matching, superior accuracy (768D) | Higher memory usage, moderate speed |
| **RESOURCE** (`Xenova/multilingual-e5-small`) | Minimal hardware requirements (384D), battery efficient, mobile-friendly | Limited compared to full-size models |
| **BGE-M3** (`Xenova/bge-m3`) | State-of-the-art multilingual, 100+ languages, research-grade (1024D) | High memory usage, slower inference |
| **BGE-Base-EN** (`Xenova/bge-base-en-v1.5`) | High quality English, good speed, balanced performance (768D) | English-focused, limited multilingual |
| **E5-Large-v2** (`Xenova/e5-large-v2`) | Research-grade quality, excellent multilingual (1024D) | High resource usage, slower |
| **All-MiniLM-L6** (`Xenova/all-MiniLM-L6-v2`) | Ultra-fast, very small, minimal resources (384D) | Limited quality, basic performance |
| **Paraphrase-MPNet** (`Xenova/paraphrase-multilingual-mpnet-base-v2`) | Good multilingual balance, proven TM performance (768D) | Medium performance, moderate speed |
| **DistilUSE-v2** (`Xenova/distiluse-base-multilingual-cased-v2`) | Improved efficiency, compact size (512D) | Limited availability, moderate quality |

### Three Model Options

### Technical Capabilities

- **Multilingual Embeddings**: Uses transformer-based semantic understanding
- **Vector Database**: LanceDB for efficient similarity search
- **XLIFF Integration**: Standard translation industry file format support
- **Concordance Search**: Text fragment matching across translation units
- **Duplicate Prevention**: Content change detection to avoid redundant entries
- **Dynamic Dimensions**: Automatically detects model embedding dimensions

## Performance Data

| Search Method | Quality Score | Description |
|--------------|---------------|-------------|
| Hybrid Search | 96.1% | Combined fuzzy and semantic matching |
| Semantic Only | 95.6% | Transformer-based similarity |
| Fuzzy Only | 93.4% | Traditional string matching |

## Installation and Usage

### Installation

```bash
npm install hybridtm
# or
git clone https://github.com/rmraya/HybridTM.git
cd HybridTM
npm install
```

### Basic Usage

```typescript
import { HybridTM } from 'hybridtm';

// Create a translation memory with your choice of model
const tm = new HybridTM('./my-tm.lancedb', HybridTM.QUALITY_MODEL);

// Import XLIFF files to populate the TM
tm.importXLIFF('./translations/project1.xlf');

// Or manually store translation pairs
await tm.storeLangEntry(
    'project1',      // File ID
    'file.xlf',      // Original file name
    'unit1',         // Unit ID
    'en',            // Language
    'Hello world',   // Text
    xmlElement       // XML element
);

// Search for translations using hybrid approach (fuzzy + semantic)
const matches = await tm.hybridTranslationSearch(
    'Hello universe',  // Query text
    'en',             // Source language
    'fr',             // Target language
    50,               // Minimum quality threshold (0-100)
    false,            // Case sensitive
    5                 // Maximum results
);

// Process results
matches.forEach(match => {
    console.log(`${match.quality}% match: ${match.target.toString()}`);
});

await tm.close();
```

### Model Selection

```typescript
// Choose the model that fits your needs:

// For real-time CAT tools (fastest)
const speedTM = new HybridTM('./tm.lancedb', HybridTM.SPEED_MODEL);

// For maximum accuracy (default, recommended)
const qualityTM = new HybridTM('./tm.lancedb', HybridTM.QUALITY_MODEL);

// For resource-constrained environments
const resourceTM = new HybridTM('./tm.lancedb', HybridTM.RESOURCE_MODEL);

// Use any alternative model by ID
const customTM = new HybridTM('./tm.lancedb', 'Xenova/bge-m3');
```

### Model Constants

```typescript
// Available model constants for external applications
HybridTM.SPEED_MODEL    // 'Xenova/bge-small-en-v1.5' - Real-time optimized
HybridTM.QUALITY_MODEL  // 'Xenova/LaBSE' - Maximum accuracy
HybridTM.RESOURCE_MODEL // 'Xenova/multilingual-e5-small' - Minimal hardware
```

### Error Handling

```typescript
try {
    // If model doesn't exist or can't be loaded, initialization will fail
    const tm = new HybridTM('./db.lancedb', 'Xenova/nonexistent-model');
} catch (error) {
    console.error('Model initialization failed:', error.message);
    // Use a working model instead
    const fallbackTM = new HybridTM('./db.lancedb', HybridTM.QUALITY_MODEL);
}
```

## Technical Architecture

### Core Technologies

- **Vector Database**: LanceDB for efficient similarity search
- **Embedding Model**: Multilingual transformer (BAAI/bge-m3)
- **Fuzzy Algorithm**: MatchQuality with Longest Common Subsequence
- **Semantic Algorithm**: Manhattan distance with 97% correlation to cosine
- **File Format**: XLIFF standard with complete metadata preservation

## Language Support

Tested and validated across multiple language families:

- **Latin Scripts**: English, French, German, Spanish, Italian
- **Cyrillic**: Russian, Bulgarian  
- **Arabic**: Arabic, Persian, Urdu
- **CJK**: Chinese (Simplified/Traditional), Japanese, Korean

The system provides consistent exact matching (100% accuracy) across all scripts and maintains semantic matching quality above 95% for related concepts within and across languages.

## API Methods

### 1. Fuzzy Translation Search

```typescript
const matches = await tm.fuzzyTranslationSearch(query, sourceLang, targetLang, threshold, caseSensitive, maxResults);
```

- Uses MatchQuality algorithm (LCS-based)
- Traditional edit-distance approach
- Consistent across all languages

### 2. Semantic Translation Search

```typescript
const matches = await tm.semanticTranslationSearch(query, sourceLang, targetLang, threshold, caseSensitive, maxResults);
```

- Transformer-based semantic understanding
- Cross-linguistic concept matching
- Context-aware similarity

### 3. Hybrid Translation Search

```typescript
const matches = await tm.hybridTranslationSearch(query, sourceLang, targetLang, threshold, caseSensitive, maxResults);
```

- Adaptive combination of fuzzy and semantic
- Optimized weighting based on query characteristics
- Best overall performance (96.1% quality)

### 4. Concordance Search

```typescript
const results = await tm.concordanceSearch(fragment, language, maxResults);
```

- Finds text fragments across translation units
- Supports partial word matching
- Useful for terminology research

## Use Cases

### CAT Tool Integration

- Translation Memory replacement for existing tools
- Improved match quality for translator productivity
- Cross-linguistic matching capabilities

### Enterprise Applications

- Large translation database management (100K+ units)
- Scalable architecture for different deployment sizes
- Multiple performance tiers for various requirements

### Development and Research

- Semantic similarity analysis for linguistic research
- Cross-linguistic embedding space exploration  
- Translation quality assessment and benchmarking

### Integration Scenarios

- Desktop CAT tool engines
- Cloud-based translation platforms
- API services for translation workflows

## Testing and Validation

Testing performed across 7 languages with 35 test scenarios:

- **768-dimensional baseline**: 97.5% average quality
- **384-dimensional optimized**: 96.1% quality (1.4% quality trade-off)
- **Resource efficiency**: 50% memory reduction compared to 768-dim
- **Performance improvement**: 40% faster search operations

Model selection based on empirical testing showing 384-dimensional embeddings provide the optimal balance of quality and resource usage for most applications.

## Development

### Building from Source

```bash
git clone https://github.com/rmraya/HybridTM.git
cd HybridTM
npm install
npm run build
npm test
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Implement changes with appropriate tests
4. Submit a pull request

## License

Eclipse Public License 1.0 - See [LICENSE](LICENSE) file for details

## Related Projects

- **OpenXLIFF Filters**: XLIFF file processing and validation tools
- **TMXEditor**: Translation Memory eXchange format editor
- **Swordfish Translation Suite**: CAT tool that will integrate HybridTM

---

Part of the Maxprograms Suite of Translation Tools
