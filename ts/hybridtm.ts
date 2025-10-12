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

import * as lancedb from "@lancedb/lancedb";
import { FeatureExtractionPipeline, pipeline } from "@xenova/transformers";
import { Field, FixedSizeList, Float32, Schema, Utf8 } from "apache-arrow";
import { XMLElement } from "typesxml";
import { LangEntry } from "./langEntry";
import { Match } from "./match";
import { MatchQuality } from "./matchQuality";
import { Utils } from "./utils";
import { XLIFFReader } from "./xliffreader";

export class HybridTM {

    // THREE OPTIMIZED MODELS
    static readonly SPEED_MODEL: string = 'Xenova/bge-small-en-v1.5';           // 384-dim, optimized for real-time
    static readonly QUALITY_MODEL: string = 'Xenova/LaBSE';                     // 768-dim, optimized for accuracy
    static readonly RESOURCE_MODEL: string = 'Xenova/multilingual-e5-small';    // 384-dim, optimized for modest hardware

    private db: lancedb.Connection | null = null;
    private table: lancedb.Table | null = null;
    private dbPath: string;
    private embedder: FeatureExtractionPipeline | null = null;
    private modelName: string;
    private dbInitPromise: Promise<void> | null = null;
    private embedderInitPromise: Promise<void> | null = null;

    // ============================
    // INITIALIZATION METHODS
    // ============================

    private async detectModelDimensions(): Promise<number> {
        try {
            // Generate a test embedding to determine dimensions
            if (!this.embedder) {
                if (this.embedderInitPromise) {
                    await this.embedderInitPromise;
                } else {
                    await this.initializeEmbedder();
                }
            }

            if (!this.embedder) {
                throw new Error('Failed to initialize embedder for dimension detection');
            }

            // Generate a small test embedding
            const testResult = await this.embedder('test', {
                pooling: 'mean',
                normalize: true
            });

            return Array.from(testResult.data).length;
        } catch (err) {
            console.error('Error detecting model dimensions:', err);
            throw new Error(`Unable to detect model dimensions for ${this.modelName}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    constructor(filePath: string, modelName: string = HybridTM.QUALITY_MODEL) {
        this.dbPath = filePath;
        this.modelName = modelName;

        // Initialize asynchronously but don't block constructor
        this.dbInitPromise = this.initializeDatabase().catch(err => {
            console.error('Failed to initialize database:', err);
            throw new Error(`Database initialization failed: ${err instanceof Error ? err.message : String(err)}`);
        });
        this.embedderInitPromise = this.initializeEmbedder().catch(err => {
            console.error('Failed to initialize embedder:', err);
            throw new Error(`Embedder initialization failed: ${err instanceof Error ? err.message : String(err)}`);
        });
    }

    private async initializeDatabase(): Promise<void> {
        try {
            // Connect to LanceDB
            this.db = await lancedb.connect(this.dbPath);

            // Check if table exists, if not create it
            const tableNames = await this.db.tableNames();
            if (!tableNames.includes('langEntry')) {
                // Detect model dimensions first
                const dimensions = await this.detectModelDimensions();

                // Create Arrow schema for the langEntry table
                const schema = new Schema([
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
        } catch (err) {
            console.error('Error initializing LanceDB:', err);
            throw err;
        }
    }

    private async initializeEmbedder(): Promise<void> {
        try {
            this.embedder = await pipeline('feature-extraction', this.modelName);
        } catch (err) {
            console.error('Error initializing embedder:', err);
            throw err;
        }
    }

    private async generateEmbedding(text: string): Promise<number[]> {
        try {
            // Ensure embedder is initialized
            if (!this.embedder) {
                if (this.embedderInitPromise) {
                    await this.embedderInitPromise;
                } else {
                    await this.initializeEmbedder();
                }
            }

            if (!this.embedder) {
                throw new Error('Failed to initialize embedder');
            }

            // Generate embeddings using the transformer model
            const result = await this.embedder(text, {
                pooling: 'mean',
                normalize: true
            });

            // Convert tensor to array
            const embedding = Array.from(result.data) as number[];
            return embedding;
        } catch (err) {
            console.error('Error generating embedding:', err);
            throw err;
        }
    }

    private async ensureInitialized(): Promise<void> {
        // Ensure database is initialized
        if (!this.table) {
            if (this.dbInitPromise) {
                await this.dbInitPromise;
            } else {
                await this.initializeDatabase();
            }
        }

        if (!this.table) {
            throw new Error('Failed to initialize database table');
        }
    }

    private async ensureTable(): Promise<lancedb.Table> {
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
        } catch (err) {
            console.error('Error closing database:', err);
        }
    }

    // ============================
    // SEARCH METHODS
    // ============================

    // Enhanced concordance search: finds text fragments and returns all language variants for matching units
    async concordanceSearch(textFragment: string, language: string, limit: number = 100): Promise<Map<string, XMLElement>[]> {
        try {
            const table = await this.ensureTable();

            // Step 1: Find all entries that contain the text fragment in the given language
            const matchingEntries = await table
                .query()
                .where(`language = '${language}'`)
                .toArray();

            // Filter by text fragment in JavaScript (more reliable for text search)
            const fragmentEntries = matchingEntries.filter((row: any) => {
                if (!row.pureText) return false;
                const text = row.pureText.toLowerCase();
                const fragment = textFragment.toLowerCase();
                return text.includes(fragment);
            }).slice(0, limit);

            if (fragmentEntries.length === 0) {
                return [];
            }

            // Step 2: Extract unique {fileId, unitId} combinations
            const uniqueUnits = new Set<string>();
            fragmentEntries.forEach((entry: any) => {
                const unitKey = `${entry.fileId}:${entry.unitId}`;
                uniqueUnits.add(unitKey);
            });

            // Step 3: For each unique unit, retrieve all language variants
            const result: Map<string, XMLElement>[] = [];

            for (const unitKey of uniqueUnits) {
                const [fileId, unitId] = unitKey.split(':');

                // Get all language variants for this unit using JavaScript filtering
                // This is more reliable than LanceDB WHERE clauses for exact string matching
                const allEntries = await table
                    .query()
                    .toArray();

                const allVariants = allEntries.filter((entry: any) => {
                    return entry.fileId === fileId && entry.unitId === unitId;
                });

                // Create a map of language -> XMLElement for this unit
                const languageMap = new Map<string, XMLElement>();

                allVariants.forEach((variant: any) => {
                    try {
                        // Create XMLElement with the text content
                        const xmlElement: XMLElement = Utils.buildXMLElement(variant.element);
                        languageMap.set(variant.language, xmlElement);
                    } catch (parseErr) {
                        const errorMessage = parseErr instanceof Error ? parseErr.message : String(parseErr);
                        throw new Error(`Failed to create XML element for ${variant.id}: ${errorMessage}`);
                    }
                });

                // Only add to result if we have at least one language variant
                if (languageMap.size > 0) {
                    result.push(languageMap);
                }
            }

            return result;

        } catch (err) {
            console.error('Error performing concordance search:', err);
            throw err;
        }
    }

    async fuzzyTranslationSearch(searchStr: string, srcLang: string, tgtLang: string, similarity: number, caseSensitive: boolean, limit: number = 100): Promise<Array<Match>> {
        try {
            const table = await this.ensureTable();

            // Get all entries for the source language
            const sourceEntries = await table
                .query()
                .where(`language = '${srcLang}'`)
                .toArray();

            const matches: Array<Match> = [];

            for (const sourceEntry of sourceEntries) {
                if (!sourceEntry.pureText) continue;

                // Calculate quality based on text similarity
                const sourceText = caseSensitive ? sourceEntry.pureText : sourceEntry.pureText.toLowerCase();
                const queryText = caseSensitive ? searchStr : searchStr.toLowerCase();
                const quality = MatchQuality.similarity(sourceText, queryText);

                // Only include matches that meet the minimum similarity threshold
                if (quality >= similarity) {
                    // Find corresponding target language entry for the same unit
                    const targetEntryId = `${sourceEntry.fileId}:${sourceEntry.unitId}:${tgtLang}`;
                    const targetEntries = await table
                        .query()
                        .where(`id = '${targetEntryId}'`)
                        .toArray();

                    if (targetEntries.length > 0) {
                        const targetEntry = targetEntries[0];

                        try {
                            // Create XMLElements from stored strings
                            const sourceElement = Utils.buildXMLElement(sourceEntry.element);
                            const targetElement = Utils.buildXMLElement(targetEntry.element);

                            // Create Match object with quality score
                            const match = new Match(
                                sourceElement,
                                targetElement,
                                this.dbPath, // origin is the translation memory name
                                quality
                            );

                            matches.push(match);
                        } catch (parseErr) {
                            console.error(`Error creating XMLElements for match: ${parseErr}`);
                            // Skip this match if XML parsing fails
                        }
                    }
                }
            }

            // Sort matches by quality (highest first) and apply limit
            matches.sort((a, b) => b.quality - a.quality);

            return matches.slice(0, limit);
        } catch (err) {
            console.error('Error performing translation search:', err);
            return [];
        }
    }

    async searchAll(searchStr: string, srcLang: string, similarity: number, caseSensitive: boolean): Promise<Array<{ element: XMLElement, quality: number, metadata: any }>> {
        try {
            const table = await this.ensureTable();

            // Get all entries for the source language
            const sourceEntries = await table
                .query()
                .where(`language = '${srcLang}'`)
                .toArray();

            const matches: Array<{ element: XMLElement, quality: number, metadata: any }> = [];

            for (const sourceEntry of sourceEntries) {
                if (!sourceEntry.pureText) continue;

                // Calculate quality based on text similarity
                const sourceText = caseSensitive ? sourceEntry.pureText : sourceEntry.pureText.toLowerCase();
                const queryText = caseSensitive ? searchStr : searchStr.toLowerCase();
                const quality = MatchQuality.similarity(sourceText, queryText);

                // Only include matches that meet the minimum similarity threshold
                if (quality >= similarity) {
                    try {
                        // Create XMLElement from stored string
                        const sourceElement = Utils.buildXMLElement(sourceEntry.element);

                        matches.push({
                            element: sourceElement,
                            quality: quality,
                            metadata: {
                                fileId: sourceEntry.fileId,
                                unitId: sourceEntry.unitId,
                                language: sourceEntry.language,
                                text: sourceEntry.pureText,
                                original: sourceEntry.original
                            }
                        });
                    } catch (parseErr) {
                        console.error(`Error creating XMLElement for searchAll: ${parseErr}`);
                        // Skip this match if XML parsing fails
                    }
                }
            }

            // Sort matches by quality (highest first)
            matches.sort((a, b) => b.quality - a.quality);

            return matches;
        } catch (err) {
            console.error('Error performing searchAll:', err);
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
            const queryEmbedding = await this.generateEmbedding(queryText);

            // Perform vector search with the generated embedding
            const results = await this.table
                .vectorSearch(queryEmbedding)
                .limit(limit)
                .toArray();

            // Filter by language in JavaScript for now
            const filteredResults = results.filter((row: any) => row.language === language);

            return filteredResults as LangEntry[];
        } catch (err) {
            console.error('Error performing semantic search:', err);
            throw err;
        }
    }

    // Manhattan-based similarity (DEFAULT - gives more intuitive scores)
    // Manhattan similarity is to cosine what MatchQuality is to Levenshtein:
    // a more practical algorithm that provides better user experience
    private manhattanSimilarity(vecA: number[], vecB: number[]): number {
        const a = Array.from(vecA);
        const b = Array.from(vecB);

        if (a.length !== b.length) {
            throw new Error('Vectors must have the same length');
        }

        let sumAbsDiff = 0;
        for (let i = 0; i < a.length; i++) {
            sumAbsDiff += Math.abs(a[i] - b[i]);
        }

        // Convert to similarity using exponential decay
        // This typically gives higher, more intuitive scores
        return Math.exp(-sumAbsDiff / a.length);
    }

    // Semantic similarity using Manhattan distance (default method)
    private semanticSimilarity(vecA: number[], vecB: number[]): number {
        return this.manhattanSimilarity(vecA, vecB);
    }

    async semanticTranslationSearch(searchStr: string, srcLang: string, tgtLang: string, similarity: number, limit: number = 100): Promise<Array<Match>> {
        try {
            const table = await this.ensureTable();

            // Generate embedding for the search string
            const queryEmbedding = await this.generateEmbedding(searchStr);

            // Get all entries for the source language
            const sourceEntries = await table
                .query()
                .where(`language = '${srcLang}'`)
                .toArray();

            const matches: Array<Match> = [];

            for (const sourceEntry of sourceEntries) {
                if (!sourceEntry.pureText || !sourceEntry.vector) continue;

                // Calculate semantic similarity using Manhattan distance
                const semanticScore = this.semanticSimilarity(queryEmbedding, sourceEntry.vector);

                // Convert similarity to percentage (0-100)
                const qualityPercent = Math.round(semanticScore * 100);

                // Only include matches that meet the minimum similarity threshold
                if (qualityPercent >= similarity) {
                    // Find corresponding target language entry for the same unit
                    const targetEntryId = `${sourceEntry.fileId}:${sourceEntry.unitId}:${tgtLang}`;
                    const targetEntries = await table
                        .query()
                        .where(`id = '${targetEntryId}'`)
                        .toArray();

                    if (targetEntries.length > 0) {
                        const targetEntry = targetEntries[0];

                        try {
                            // Create XMLElements from stored strings
                            const sourceElement = Utils.buildXMLElement(sourceEntry.element);
                            const targetElement = Utils.buildXMLElement(targetEntry.element);

                            // Create Match object with semantic similarity quality score
                            const match = new Match(
                                sourceElement,
                                targetElement,
                                this.dbPath, // origin is the translation memory name
                                qualityPercent
                            );

                            matches.push(match);
                        } catch (parseErr) {
                            console.error(`Error creating XMLElements for semantic match: ${parseErr}`);
                            // Skip this match if XML parsing fails
                        }
                    }
                }
            }

            // Sort matches by quality (highest semantic similarity first) and apply limit
            matches.sort((a, b) => b.quality - a.quality);

            return matches.slice(0, limit);
        } catch (err) {
            console.error('Error performing semantic search with quality:', err);
            return [];
        }
    }

    // Compute hybrid score combining fuzzy and semantic similarity
    private computeHybridScore(fuzzyScore: number, semanticScore: number, alpha: number): number {
        const normalizedFuzzy = fuzzyScore / 100;
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
            const table = await this.ensureTable();

            // Generate embedding for the search string once
            const queryEmbedding = await this.generateEmbedding(searchStr);

            // Get all entries for the source language
            const sourceEntries = await table
                .query()
                .where(`language = '${srcLang}'`)
                .toArray();

            const matches: Array<Match> = [];

            for (const sourceEntry of sourceEntries) {
                if (!sourceEntry.pureText || !sourceEntry.vector) continue;

                // Calculate fuzzy similarity using MatchQuality
                const sourceText = caseSensitive ? sourceEntry.pureText : sourceEntry.pureText.toLowerCase();
                const queryText = caseSensitive ? searchStr : searchStr.toLowerCase();
                const fuzzyScore = MatchQuality.similarity(sourceText, queryText);

                // Calculate semantic similarity using Manhattan distance
                const semanticScore = this.semanticSimilarity(queryEmbedding, sourceEntry.vector);

                // Get optimal alpha based on fuzzy score
                const alpha = this.getOptimalAlpha(fuzzyScore);

                // Compute hybrid score
                const hybridScore = this.computeHybridScore(fuzzyScore, semanticScore, alpha);
                const hybridScorePercent = Math.round(hybridScore * 100);

                // Only include matches that meet the minimum similarity threshold
                if (hybridScorePercent >= similarity) {
                    // Find corresponding target language entry for the same unit
                    const targetEntryId = `${sourceEntry.fileId}:${sourceEntry.unitId}:${tgtLang}`;
                    const targetEntries = await table
                        .query()
                        .where(`id = '${targetEntryId}'`)
                        .toArray();

                    if (targetEntries.length > 0) {
                        const targetEntry = targetEntries[0];

                        try {
                            // Create XMLElements from stored strings
                            const sourceElement = Utils.buildXMLElement(sourceEntry.element);
                            const targetElement = Utils.buildXMLElement(targetEntry.element);

                            // Create Match object with hybrid quality score
                            const match = new Match(
                                sourceElement,
                                targetElement,
                                this.dbPath, // origin is the translation memory name
                                hybridScorePercent
                            );

                            matches.push(match);
                        } catch (parseErr) {
                            console.error(`Error creating XMLElements for hybrid match: ${parseErr}`);
                            // Skip this match if XML parsing fails
                        }
                    }
                }
            }

            // Sort matches by hybrid quality (highest first) and apply limit
            matches.sort((a, b) => b.quality - a.quality);

            return matches.slice(0, limit);
        } catch (err) {
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
            const allResults = await this.table
                .query()
                .where(`language = '${language}'`)
                .toArray();

            // Perform fuzzy text matching in JavaScript
            const filteredResults = allResults.filter((row: any) => {
                if (!row.pureText) return false;
                const text = row.pureText.toLowerCase();
                const query = queryText.toLowerCase();
                return text.includes(query);
            }).slice(0, limit);

            console.log(`Text search found ${filteredResults.length} matches for "${queryText}"`);
            return filteredResults as LangEntry[];

        } catch (err) {
            console.error('Error performing text search:', err);
            return [];
        }
    }

    async hybridSearch(queryText: string, language: string, limit: number = 10): Promise<{
        textMatches: LangEntry[];
        vectorMatches: LangEntry[];
        combinedMatches: LangEntry[];
    }> {
        try {
            // Perform both searches in parallel
            const [textMatches, vectorMatches] = await Promise.all([
                this.textSearch(queryText, language, limit),
                this.semanticSearch(queryText, language, limit)
            ]);

            // Combine and deduplicate results
            const seen = new Set<string>();
            const combinedMatches: LangEntry[] = [];

            // Add text matches first (exact/substring matches are often more relevant)
            for (const match of textMatches) {
                if (!seen.has(match.id)) {
                    seen.add(match.id);
                    combinedMatches.push(match);
                }
            }

            // Add vector matches that weren't already included
            for (const match of vectorMatches) {
                if (!seen.has(match.id)) {
                    seen.add(match.id);
                    combinedMatches.push(match);
                }
            }

            return {
                textMatches,
                vectorMatches,
                combinedMatches: combinedMatches.slice(0, limit)
            };
        } catch (err) {
            console.error('Error performing hybrid search:', err);
            throw err;
        }
    }

    // Improved hybrid search that takes a query string and handles embedding generation internally
    async smartSearch(queryText: string, language: string, limit: number = 10): Promise<{
        textMatches: LangEntry[];
        vectorMatches: LangEntry[];
        combinedMatches: LangEntry[];
    }> {
        try {
            return this.hybridSearch(queryText, language, limit);
        } catch (err) {
            console.error('Error performing smart search:', err);
            throw err;
        }
    }

    // ============================
    // DATA MANAGEMENT METHODS
    // ============================

    async storeLangEntry(fileId: string, original: string, unitId: string, lang: string, pureText: string, element: XMLElement, embeddings?: number[]): Promise<void> {
        try {
            const table = await this.ensureTable();

            // Generate deterministic ID based on fileId, unitId, and language
            const entryId = `${fileId}:${unitId}:${lang}`;

            // Check if entry already exists and if content has changed
            const existingEntries = await table
                .query()
                .where(`id = '${entryId}'`)
                .toArray();

            if (existingEntries.length > 0) {
                const existingEntry = existingEntries[0];

                // Compare content to see if it has changed
                const contentChanged = (
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
                await table.delete(`id = '${entryId}'`);
            } catch (deleteErr) {
                // Entry might not exist, which is fine
            }

            await table.add([entry]);
        } catch (err) {
            console.error('Error storing language entry:', err);
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

            const entryId = `${fileId}:${unitId}:${lang}`;
            const existingEntries = await this.table
                .query()
                .where(`id = '${entryId}'`)
                .toArray();

            return existingEntries.length > 0;
        } catch (err) {
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

            const entryId = `${fileId}:${unitId}:${lang}`;
            const existingEntries = await this.table
                .query()
                .where(`id = '${entryId}'`)
                .toArray();

            return existingEntries.length > 0 ? existingEntries[0] as LangEntry : null;
        } catch (err) {
            console.error('Error retrieving language entry:', err);
            return null;
        }
    }

    // Method to delete a specific language entry
    async deleteLangEntry(fileId: string, unitId: string, lang: string): Promise<boolean> {
        try {
            if (!this.table) {
                await this.initializeDatabase();
            }

            if (!this.table) {
                throw new Error('Failed to initialize database table');
            }

            const entryId = `${fileId}:${unitId}:${lang}`;

            // Check if entry exists first
            const exists = await this.entryExists(fileId, unitId, lang);
            if (!exists) {
                return false;
            }

            // Delete the entry
            await this.table.delete(`id = '${entryId}'`);
            return true;
        } catch (err) {
            console.error('Error deleting language entry:', err);
            return false;
        }
    }

    // ============================
    // UTILITY METHODS
    // ============================

    // ============================
    // DATA IMPORT METHODS
    // ============================

    importXLIFF(filePath: string): void {
        let reader: XLIFFReader = new XLIFFReader(filePath, this);
        reader.parse();
    }
}
