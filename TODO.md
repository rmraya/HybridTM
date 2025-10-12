# HybridTM TODO List

## Current Progress

> **Note**: All items are in design/planning phase - no code implementation yet

## Glossary Integration

- [ ] **Design Glossary Table Schema**
  - Create Arrow Schema for terminology management table with fields: term_id, source_term, target_term, source_lang, target_lang, domain, definition, notes, confidence. Support TBX, GlossML, and CSV import formats.
  - **Status**: Schema designed conceptually, not yet implemented in code

- [ ] **Implement Glossary Management**
  - Add glossary table creation, CRUD operations, and terminology lookup methods to HybridTM class. Include exact match and fuzzy matching for terminology.

- [ ] **Create Glossary Import Pipeline**
  - Build parsers for TBX (XML), GlossML (XML), and CSV formats. Handle terminology extraction, validation, and batch import with conflict resolution.

## RAG Translation System

- [ ] **Enhance Metadata for RAG Context**
  - Enhance LangEntry metadata for RAG context: add document_type, subject_domain, creation_date, approval_status, translator_notes, context_before/after, formatting_tags, quality_scores. Improve searchAll() to return comprehensive metadata that helps LLMs understand translation context, source material type, and quality indicators.

- [ ] **Implement Context Compression for RAG**
  - Implement intelligent context compression for RAG: token counting, relevance scoring, duplicate detection, summarization of similar matches, hierarchical compression (high/medium/low priority content), XML tag simplification, and adaptive context windowing based on LLM limits. Optimize information density while preserving translation quality indicators.

- [ ] **Design RAG Translation Architecture**
  - Design integration layer between HybridTM retrieval system and LLM translation service. Define context preparation, prompt engineering, and response handling patterns.

- [ ] **Implement Translation Context Builder**
  - Create service to combine TM matches, glossary terms, and source text into optimized LLM prompts. Handle context windowing and relevance scoring.

- [ ] **Build LLM Integration Layer**
  - Create abstraction layer supporting OpenAI, Claude, local models (Ollama), and Azure OpenAI. Handle API calls, error handling, and response parsing.

- [ ] **Implement Translation Feedback Loop**
  - Create system to capture approved translations, quality ratings, and user corrections. Feed back into HybridTM as new translation pairs with metadata.

- [ ] **Create Unified Translation API**
  - Build high-level API that orchestrates: glossary lookup → TM retrieval → LLM translation → feedback capture. Provide simple interface for translation workflows.

## Implementation Notes

### Glossary System

- Support industry-standard formats (TBX, GlossML, CSV)
- Implement fuzzy terminology matching alongside exact matches
- Design for multi-domain terminology management

### RAG Enhancement Strategy

- **Enhanced Metadata**: Rich context for LLM understanding
- **Context Compression**: Optimize token usage and costs
- **Intelligent Retrieval**: Combine TM + glossary + semantic search
- **Feedback Integration**: Learn from user corrections and approvals

### Technical Architecture

- **Modular Design**: Each component can be used independently
- **LLM Agnostic**: Support multiple LLM providers
- **Production Ready**: Error handling, logging, performance optimization
- **Extensible**: Plugin architecture for custom workflows

## Vision

Transform HybridTM from a traditional translation memory into a comprehensive AI-enhanced translation ecosystem that combines:

- Traditional fuzzy matching
- Semantic similarity
- Terminology management  
- RAG-powered LLM translation
- Continuous learning from feedback

The goal is to provide the most accurate, context-aware, and efficient translation assistance available.
