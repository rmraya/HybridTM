/*******************************************************************************
 * Copyright (c) 2025 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse   License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/

import { connect, Connection, Table } from "@lancedb/lancedb";
import { FeatureExtractionPipeline, pipeline, Tensor } from "@xenova/transformers";
import { Field, FixedSizeList, Float32, Schema, Utf8 } from "apache-arrow";
import { XMLElement } from "typesxml";
import { BatchImporter } from "./batchImporter";
import { LangEntry } from "./langEntry";
import { Match } from "./match";
import { MatchQuality } from "./matchQuality";
import { PendingEntry } from "./pendingEntry";
import { TMXReader } from "./tmxReader";
import { Utils } from "./utils";
import { XLIFFReader } from "./xliffReader";

export class HybridTM {

    // OPTIMIZED MODELS
    static readonly SPEED_MODEL: string = 'Xenova/bge-small-en-v1.5';           // 384-dim, optimized for real-time
    static readonly QUALITY_MODEL: string = 'Xenova/LaBSE';                     // 768-dim, optimized for accuracy
    static readonly RESOURCE_MODEL: string = 'Xenova/multilingual-e5-small';    // 384-dim, optimized for modest hardware

    private db: Connection | null = null;
    private table: Table | null = null;
    private dbPath: string = '';
    private embedder: FeatureExtractionPipeline | null = null;
    private modelName: string = '';
    private initialized: boolean = false;
    private initializationPromise: Promise<void> | null = null;

    constructor(filePath: string, modelName: string = HybridTM.QUALITY_MODEL) {
        this.dbPath = filePath;
        this.modelName = modelName;
    }

    // ============================
    // INITIALIZATION METHODS
    // ============================

    private async detectModelDimensions(): Promise<number> {
        try {
            // Ensure embedder is initialized
            if (!this.embedder) {
                await this.initializeEmbedder();
            }

            if (!this.embedder) {
                throw new Error('Failed to initialize embedder for dimension detection');
            }

            // Generate a small test embedding
            const testResult: Tensor = await this.embedder('test', {
                pooling: 'mean',
                normalize: true
            });
            return Array.from(testResult.data).length;
        } catch (err: unknown) {
            console.error('Error detecting model dimensions:', err);
            throw new Error('Unable to detect model dimensions for ' + this.modelName + ': ' + (err instanceof Error ? err.message : String(err)));
        }
    }

    private async initialize(): Promise<void> {
        try {
            // Initialize database and embedder in parallel
            await Promise.all([
                this.initializeDatabase(),
                this.initializeEmbedder()
            ]);
        } catch (err: unknown) {
            console.error('Failed to initialize HybridTM:', err);
            throw new Error('HybridTM initialization failed: ' + (err instanceof Error ? err.message : String(err)));
        }
    }

    private async initializeDatabase(): Promise<void> {
        try {
            // Connect to LanceDB
            this.db = await connect(this.dbPath);

            // Check if table exists, if not create it
            const tableNames: string[] = await this.db.tableNames();
            if (!tableNames.includes('langEntry')) {
                // Detect model dimensions first
                const dimensions: number = await this.detectModelDimensions();

                // Create Arrow schema for the langEntry table
                const schema: Schema = new Schema([
                    Field.new('id', new Utf8(), false),           // String ID for LanceDB compatibility
                    Field.new('language', new Utf8(), false),     // Language code
                    Field.new('pureText', new Utf8(), false),     // Plain text content
                    Field.new('element', new Utf8(), false),      // XML element as string
                    Field.new('fileId', new Utf8(), false),       // File identifier
                    Field.new('original', new Utf8(), false),     // Original file name
                    Field.new('unitId', new Utf8(), false),       // Translation unit ID
                    Field.new('vector', new FixedSizeList(dimensions, Field.new('item', new Float32(), false)), false), // Vector embeddings with dynamic dimensions
                ]);

                // Create table with the schema
                this.table = await this.db.createEmptyTable('langEntry', schema);
            } else {
                this.table = await this.db.openTable('langEntry');
            }
        } catch (err: unknown) {
            console.error('Error initializing LanceDB:', err);
            throw err;
        }
    }

    private async initializeEmbedder(): Promise<void> {
        try {
            this.embedder = await pipeline('feature-extraction', this.modelName);
        } catch (err: unknown) {
            console.error('Error initializing embedder:', err);
            throw err;
        }
    }

    private async generateEmbedding(text: string): Promise<number[]> {
        try {
            // Ensure embedder is initialized
            if (!this.embedder) {
                await this.initializeEmbedder();
            }

            if (!this.embedder) {
                throw new Error('Failed to initialize embedder');
            }

            // Generate embeddings using the transformer model
            const result: Tensor = await this.embedder(text, {
                pooling: 'mean',
                normalize: true
            });

            // Convert tensor to array
            const embedding: number[] = Array.from(result.data);
            return embedding;
        } catch (err: unknown) {
            console.error('Error generating embedding:', err);
            throw err;
        }
    }

    private async ensureInitialized(): Promise<void> {
        if (this.initialized) {
            return;
        }

        if (this.initializationPromise) {
            await this.initializationPromise;
            return;
        }

        this.initializationPromise = this.initialize();
        await this.initializationPromise;
        this.initialized = true;
    }

    private async ensureTable(): Promise<Table> {
        await this.ensureInitialized();
        if (!this.table) {
            throw new Error('Database table is not available');
        }
        return this.table;
    }

    async close(): Promise<void> {
        try {
            if (this.db) {
                // LanceDB connections are automatically managed
            }
        } catch (err: unknown) {
            console.error('Error closing database:', err);
        }
    }

    // ============================
    // SEARCH METHODS
    // ============================

    async concordanceSearch(textFragment: string, language: string, limit: number = 100): Promise<Map<string, XMLElement>[]> {
        // Enhanced concordance search: finds text fragments and returns all language variants for matching units
        try {
            const table: Table = await this.ensureTable();

            // Step 1: Find all entries that contain the text fragment in the given language
            const matchingEntries: LangEntry[] = (await table
                .query()
                .where('language = ' + '\'' + language + '\'')
                .toArray()) as LangEntry[];

            // Filter by text fragment in JavaScript (more reliable for text search)
            const fragmentEntries: LangEntry[] = matchingEntries.filter((row: LangEntry) => {
                if (!row.pureText) return false;
                const text: string = row.pureText.toLowerCase();
                const fragment: string = textFragment.toLowerCase();
                return text.includes(fragment);
            }).slice(0, limit);

            if (fragmentEntries.length === 0) {
                return [];
            }

            // Step 2: Extract unique {fileId, unitId} combinations
            const uniqueUnits = new Set<string>();
            fragmentEntries.forEach((entry: LangEntry) => {
                const unitKey: string = entry.fileId + ':' + entry.unitId;
                uniqueUnits.add(unitKey);
            });

            // Step 3: For each unique unit, retrieve all language variants
            const result: Map<string, XMLElement>[] = [];

            for (const unitKey of uniqueUnits) {
                const [fileId, unitId]: string[] = unitKey.split(':');

                // Get all language variants for this unit using JavaScript filtering
                // This is more reliable than LanceDB WHERE clauses for exact string matching
                const allEntries: LangEntry[] = (await table
                    .query()
                    .toArray()) as LangEntry[];

                const allVariants: LangEntry[] = allEntries.filter((entry: LangEntry) => {
                    return entry.fileId === fileId && entry.unitId === unitId;
                });

                // Create a map of language -> XMLElement for this unit
                const languageMap: Map<string, XMLElement> = new Map<string, XMLElement>();

                allVariants.forEach((variant: LangEntry) => {
                    try {
                        // Create XMLElement with the text content
                        const xmlElement: XMLElement = Utils.buildXMLElement(variant.element);
                        languageMap.set(variant.language, xmlElement);
                    } catch (parseErr: unknown) {
                        const errorMessage: string = parseErr instanceof Error ? parseErr.message : String(parseErr);
                        throw new Error('Failed to create XML element for ' + variant.id + ': ' + errorMessage);
                    }
                });

                // Only add to result if we have at least one language variant
                if (languageMap.size > 0) {
                    result.push(languageMap);
                }
            }
            return result;
        } catch (err: unknown) {
            console.error('Error performing concordance search:', err);
            throw err;
        }
    }

    async fuzzyTranslationSearch(searchStr: string, srcLang: string, tgtLang: string, similarity: number, caseSensitive: boolean, limit: number = 100): Promise<Array<Match>> {
        try {
            const table: Table = await this.ensureTable();

            // Get all entries for the source language
            const sourceEntries: LangEntry[] = (await table
                .query()
                .where('language = \'' + srcLang + '\'')
                .toArray()) as LangEntry[];

            const matches: Array<Match> = [];

            for (const sourceEntry of sourceEntries) {
                if (!sourceEntry.pureText) {
                    continue;
                }

                // Calculate quality based on text similarity
                const sourceText: string = caseSensitive ? sourceEntry.pureText : sourceEntry.pureText.toLowerCase();
                const queryText: string = caseSensitive ? searchStr : searchStr.toLowerCase();
                const quality: number = MatchQuality.similarity(sourceText, queryText);

                // Only include matches that meet the minimum similarity threshold
                if (quality >= similarity) {
                    // Find corresponding target language entry for the same unit
                    const targetEntryId: string = sourceEntry.fileId + ':' + sourceEntry.unitId + ':' + tgtLang;
                    const targetEntries: LangEntry[] = (await table
                        .query()
                        .where('id = \'' + targetEntryId + '\'')
                        .toArray()) as LangEntry[];

                    if (targetEntries.length > 0) {
                        const targetEntry: LangEntry = targetEntries[0];

                        try {
                            // Create XMLElements from stored strings
                            const sourceElement: XMLElement = Utils.buildXMLElement(sourceEntry.element);
                            const targetElement: XMLElement = Utils.buildXMLElement(targetEntry.element);

                            // Create Match object with quality score
                            const match: Match = new Match(
                                sourceElement,
                                targetElement,
                                this.dbPath, // origin is the translation memory name
                                quality
                            );

                            matches.push(match);
                        } catch (parseErr: unknown) {
                            console.error('Error creating XMLElements for match: ' + (parseErr instanceof Error ? parseErr.message : String(parseErr)));
                            // Skip this match if XML parsing fails
                        }
                    }
                }
            }

            // Sort matches by quality (highest first) and apply limit
            matches.sort((a, b) => b.quality - a.quality);
            return matches.slice(0, limit);
        } catch (err: unknown) {
            console.error('Error performing translation search:', err);
            return [];
        }
    }

    async semanticSearch(queryText: string, language: string, limit: number = 10): Promise<LangEntry[]> {
        try {
            if (!this.table) {
                await this.initializeDatabase();
            }

            if (!this.table) {
                throw new Error('Failed to initialize database table');
            }

            // Generate embedding for the query text
            const queryEmbedding: number[] = await this.generateEmbedding(queryText);

            // Perform vector search with the generated embedding
            const results: LangEntry[] = (await this.table
                .vectorSearch(queryEmbedding)
                .limit(limit)
                .toArray()) as LangEntry[];

            // Filter by language in JavaScript for now
            const filteredResults: LangEntry[] = results.filter((row: LangEntry) => row.language === language);

            return filteredResults;
        } catch (err: unknown) {
            console.error('Error performing semantic search:', err);
            throw err;
        }
    }

    private manhattanSimilarity(vecA: number[], vecB: number[]): number {
        const a: number[] = Array.from(vecA);
        const b: number[] = Array.from(vecB);

        if (a.length !== b.length) {
            throw new Error('Vectors must have the same length');
        }

        let sumAbsDiff: number = 0;
        for (let i: number = 0; i < a.length; i++) {
            sumAbsDiff += Math.abs(a[i] - b[i]);
        }

        // Convert to similarity using exponential decay
        // This typically gives higher, more intuitive scores
        return Math.exp(-sumAbsDiff / a.length);
    }

    async semanticTranslationSearch(searchStr: string, srcLang: string, tgtLang: string, similarity: number, limit: number = 100): Promise<Array<Match>> {
        try {
            const table: Table = await this.ensureTable();

            // Generate embedding for the search string
            const queryEmbedding: number[] = await this.generateEmbedding(searchStr);

            // Get all entries for the source language
            const sourceEntries: LangEntry[] = (await table
                .query()
                .where('language = ' + '\'' + srcLang + '\'')
                .toArray()) as LangEntry[];

            const matches: Array<Match> = [];

            for (const sourceEntry of sourceEntries) {
                if (!sourceEntry.pureText || !sourceEntry.vector) {
                    continue;
                }

                // Calculate semantic similarity using Manhattan distance
                const semanticScore: number = this.manhattanSimilarity(queryEmbedding, sourceEntry.vector);

                // Convert similarity to percentage (0-100)
                const qualityPercent: number = Math.round(semanticScore * 100);

                // Only include matches that meet the minimum similarity threshold
                if (qualityPercent >= similarity) {
                    // Find corresponding target language entry for the same unit
                    const targetEntryId: string = sourceEntry.fileId + ':' + sourceEntry.unitId + ':' + tgtLang;
                    const targetEntries: LangEntry[] = (await table
                        .query()
                        .where('id = ' + '\'' + targetEntryId + '\'')
                        .toArray()) as LangEntry[];

                    if (targetEntries.length > 0) {
                        const targetEntry: LangEntry = targetEntries[0];
                        try {
                            // Create XMLElements from stored strings
                            const sourceElement: XMLElement = Utils.buildXMLElement(sourceEntry.element);
                            const targetElement: XMLElement = Utils.buildXMLElement(targetEntry.element);

                            // Create Match object with semantic similarity quality score
                            const match: Match = new Match(
                                sourceElement,
                                targetElement,
                                this.dbPath, // origin is the translation memory name
                                qualityPercent
                            );

                            matches.push(match);
                        } catch (parseErr: unknown) {
                            console.error('Error creating XMLElements for semantic match: ' + (parseErr instanceof Error ? parseErr.message : String(parseErr)));
                            // Skip this match if XML parsing fails
                        }
                    }
                }
            }

            // Sort matches by quality (highest semantic similarity first) and apply limit
            matches.sort((a, b) => b.quality - a.quality);
            return matches.slice(0, limit);
        } catch (err: unknown) {
            console.error('Error performing semantic search with quality:', err);
            return [];
        }
    }

    // Compute hybrid score combining fuzzy and semantic similarity
    private computeHybridScore(fuzzyScore: number, semanticScore: number, alpha: number): number {
        const normalizedFuzzy: number = fuzzyScore / 100;
        return alpha * normalizedFuzzy + (1 - alpha) * semanticScore;
    }

    // Get optimal alpha value based on fuzzy score
    private getOptimalAlpha(fuzzyScore: number): number {
        if (fuzzyScore >= 90) return 0.85;      // 90-100: high weight on fuzzy
        if (fuzzyScore >= 70) return 0.65;      // 70-89: medium-high weight on fuzzy
        if (fuzzyScore >= 50) return 0.45;      // 50-69: balanced
        return 0.25;                            // < 50: high weight on semantic
    }

    async hybridTranslationSearch(searchStr: string, srcLang: string, tgtLang: string, similarity: number, caseSensitive: boolean, limit: number = 100): Promise<Array<Match>> {
        try {
            const table: Table = await this.ensureTable();

            // Generate embedding for the search string once
            const queryEmbedding: number[] = await this.generateEmbedding(searchStr);

            // Get all entries for the source language
            const sourceEntries: LangEntry[] = (await table
                .query()
                .where('language = ' + '\'' + srcLang + '\'')
                .toArray()) as LangEntry[];

            const matches: Array<Match> = [];

            for (const sourceEntry of sourceEntries) {
                if (!sourceEntry.pureText || !sourceEntry.vector) continue;

                // Calculate fuzzy similarity using MatchQuality
                const sourceText: string = caseSensitive ? sourceEntry.pureText : sourceEntry.pureText.toLowerCase();
                const queryText: string = caseSensitive ? searchStr : searchStr.toLowerCase();
                const fuzzyScore: number = MatchQuality.similarity(sourceText, queryText);

                // Calculate semantic similarity using Manhattan distance
                const semanticScore: number = this.manhattanSimilarity(queryEmbedding, sourceEntry.vector);

                // Get optimal alpha based on fuzzy score
                const alpha: number = this.getOptimalAlpha(fuzzyScore);

                // Compute hybrid score
                const hybridScore: number = this.computeHybridScore(fuzzyScore, semanticScore, alpha);
                const hybridScorePercent: number = Math.round(hybridScore * 100);

                // Only include matches that meet the minimum similarity threshold
                if (hybridScorePercent >= similarity) {
                    // Find corresponding target language entry for the same unit
                    const targetEntryId: string = sourceEntry.fileId + ':' + sourceEntry.unitId + ':' + tgtLang;
                    const targetEntries: LangEntry[] = (await table
                        .query()
                        .where('id = ' + '\'' + targetEntryId + '\'')
                        .toArray()) as LangEntry[];

                    if (targetEntries.length > 0) {
                        const targetEntry: LangEntry = targetEntries[0];

                        try {
                            // Create XMLElements from stored strings
                            const sourceElement: XMLElement = Utils.buildXMLElement(sourceEntry.element);
                            const targetElement: XMLElement = Utils.buildXMLElement(targetEntry.element);

                            // Create Match object with hybrid quality score
                            const match: Match = new Match(
                                sourceElement,
                                targetElement,
                                this.dbPath, // origin is the translation memory name
                                hybridScorePercent
                            );

                            matches.push(match);
                        } catch (parseErr: unknown) {
                            console.error('Error creating XMLElements for hybrid match: ' + (parseErr instanceof Error ? parseErr.message : String(parseErr)));
                            // Skip this match if XML parsing fails
                        }
                    }
                }
            }

            // Sort matches by hybrid quality (highest first) and apply limit
            matches.sort((a, b) => b.quality - a.quality);

            return matches.slice(0, limit);
        } catch (err: unknown) {
            console.error('Error performing hybrid translation search:', err);
            return [];
        }
    }

    async textSearch(queryText: string, language: string, limit: number = 10): Promise<LangEntry[]> {
        try {
            if (!this.table) {
                await this.initializeDatabase();
            }

            if (!this.table) {
                throw new Error('Failed to initialize database table');
            }

            // Get all entries for the language and filter in JavaScript (more reliable for text search)
            const allResults: LangEntry[] = (await this.table
                .query()
                .where('language = ' + '\'' + language + '\'')
                .toArray()) as LangEntry[];

            // Perform fuzzy text matching in JavaScript
            const filteredResults: LangEntry[] = allResults.filter((row: LangEntry) => {
                if (!row.pureText) return false;
                const text: string = row.pureText.toLowerCase();
                const query: string = queryText.toLowerCase();
                return text.includes(query);
            }).slice(0, limit);

            return filteredResults as LangEntry[];

        } catch (err: unknown) {
            console.error('Error performing text search:', err);
            return [];
        }
    }

    // ============================
    // DATA MANAGEMENT METHODS
    // ============================

    async storeLangEntry(fileId: string, original: string, unitId: string, lang: string, pureText: string, element: XMLElement, embeddings?: number[]): Promise<void> {
        try {
            const table: Table = await this.ensureTable();

            // Generate deterministic ID based on fileId, unitId, and language
            const entryId: string = fileId + ':' + unitId + ':' + lang;

            // Check if entry already exists and if content has changed
            const existingEntries: LangEntry[] = (await table
                .query()
                .where('id = ' + '\'' + entryId + '\'')
                .toArray()) as LangEntry[];

            if (existingEntries.length > 0) {
                const existingEntry: LangEntry = existingEntries[0];

                // Compare content to see if it has changed
                const contentChanged: boolean = (
                    existingEntry.pureText !== pureText ||
                    existingEntry.element !== element.toString() ||
                    existingEntry.original !== original
                );

                if (!contentChanged) {
                    // Content is identical, skip update to avoid unnecessary work
                    return;
                }
            }

            // Generate embeddings if not provided
            let vectorEmbeddings: number[];
            if (embeddings && embeddings.length > 0) {
                vectorEmbeddings = embeddings;
            } else {
                vectorEmbeddings = await this.generateEmbedding(pureText);
            }

            const entry: LangEntry = {
                id: entryId,
                language: lang,
                pureText: pureText,
                element: element.toString(),
                fileId: fileId,
                original: original,
                unitId: unitId,
                vector: vectorEmbeddings
            };

            // Delete existing entry first (LanceDB upsert approach)
            try {
                await table.delete('id = ' + '\'' + entryId + '\'');
            } catch (deleteErr: unknown) {
                // Entry might not exist, which is fine
            }

            await table.add([entry]);
        } catch (err: unknown) {
            console.error('Error storing language entry:', err);
            throw err;
        }
    }

    async storeBatchEntries(entries: PendingEntry[]): Promise<void> {
        try {
            const table: Table = await this.ensureTable();
            const langEntries: LangEntry[] = [];

            // Collect all entry IDs for bulk deletion
            const entryIds: string[] = [];

            // Generate embeddings one by one and build LangEntry objects
            for (const entry of entries) {
                const vectorEmbeddings: number[] = await this.generateEmbedding(entry.pureText);
                const entryId: string = entry.fileId + ':' + entry.unitId + ':' + entry.language;

                const langEntry: LangEntry = {
                    id: entryId,
                    language: entry.language,
                    pureText: entry.pureText,
                    element: entry.element.toString(),
                    fileId: entry.fileId,
                    original: entry.original,
                    unitId: entry.unitId,
                    vector: vectorEmbeddings
                };

                langEntries.push(langEntry);
                entryIds.push(entryId);
            }

            // Delete any existing entries with these IDs to prevent duplicates
            // This ensures that if the same file is imported twice, entries are overwritten
            if (entryIds.length > 0) {
                const idsFilter: string = entryIds.map(id => '\'' + id + '\'').join(',');
                try {
                    await table.delete('id IN (' + idsFilter + ')');
                } catch (deleteErr: unknown) {
                    // Entries might not exist, which is fine for first import
                }
            }

            // Bulk insert all entries at once
            await table.add(langEntries);
        } catch (err: unknown) {
            console.error('Error storing batch entries:', err);
            throw err;
        }
    }

    // Method to check if an entry exists
    async entryExists(fileId: string, unitId: string, lang: string): Promise<boolean> {
        try {
            if (!this.table) {
                await this.initializeDatabase();
            }

            if (!this.table) {
                throw new Error('Failed to initialize database table');
            }

            const entryId: string = fileId + ':' + unitId + ':' + lang;
            const existingEntries: LangEntry[] = (await this.table
                .query()
                .where('id = ' + '\'' + entryId + '\'')
                .toArray()) as LangEntry[];

            return existingEntries.length > 0;
        } catch (err: unknown) {
            console.error('Error checking entry existence:', err);
            return false;
        }
    }

    // Method to get a specific entry
    async getLangEntry(fileId: string, unitId: string, lang: string): Promise<LangEntry | null> {
        try {
            if (!this.table) {
                await this.initializeDatabase();
            }

            if (!this.table) {
                throw new Error('Failed to initialize database table');
            }

            const entryId: string = fileId + ':' + unitId + ':' + lang;
            const existingEntries: LangEntry[] = (await this.table
                .query()
                .where('id = ' + '\'' + entryId + '\'')
                .toArray()) as LangEntry[];

            return existingEntries.length > 0 ? existingEntries[0] : null;
        } catch (err: unknown) {
            console.error('Error retrieving language entry:', err);
            return null;
        }
    }

    async deleteLangEntry(fileId: string, unitId: string, lang: string): Promise<boolean> {
        try {
            if (!this.table) {
                await this.initializeDatabase();
            }
            if (!this.table) {
                throw new Error('Failed to initialize database table');
            }

            const entryId: string = fileId + ':' + unitId + ':' + lang;

            // Check if entry exists first
            const exists: boolean = await this.entryExists(fileId, unitId, lang);
            if (!exists) {
                return false;
            }

            // Delete the entry
            await this.table.delete('id = \'' + entryId + '\'');
            return true;
        } catch (err: unknown) {
            console.error('Error deleting language entry:', err);
            return false;
        }
    }

    // ============================
    // DATA IMPORT METHODS
    // ============================

    async importXLIFF(filePath: string): Promise<void> {
        // Phase 1: Parse XLIFF and write to temporary JSONL file
        const reader: XLIFFReader = new XLIFFReader(filePath);
        await reader.parse();

        // Phase 2: Batch import from JSONL file (asynchronous)
        const importer: BatchImporter = new BatchImporter(this, reader.getTempFilePath(), reader.getEntryCount());
        await importer.import();
    }

    async importTMX(filePath: string): Promise<void> {
        // Phase 1: Parse TMX and write to temporary JSONL file
        const reader: TMXReader = new TMXReader(filePath);
        await reader.parse();

        // Phase 2: Batch import from JSONL file (asynchronous)
        const importer: BatchImporter = new BatchImporter(this, reader.getTempFilePath(), reader.getEntryCount());
        await importer.import();
    }
}
