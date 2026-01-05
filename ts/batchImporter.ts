/*******************************************************************************
 * Copyright (c) 2025-2026 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse   License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/

import { createReadStream, existsSync, ReadStream, unlinkSync } from "node:fs";
import { createInterface, Interface } from 'node:readline';
import { HybridTM } from './hybridtm.js';
import { EntryMetadata, SegmentMetadata } from './langEntry.js';
import { PendingEntry } from './pendingEntry.js';
import { Utils } from './utils.js';

export class BatchImporter {
    private tm: HybridTM;
    private tempFilePath: string;
    private batchSize: number;
    private totalEntries: number;

    constructor(tm: HybridTM, tempFilePath: string, totalEntries: number = 0, batchSize: number = 1000) {
        this.tm = tm;
        this.tempFilePath = tempFilePath;
        this.totalEntries = totalEntries;
        this.batchSize = batchSize;
    }

    async import(): Promise<void> {
        try {
            console.log('Starting batch import from ' + this.tempFilePath + '...');
            if (this.totalEntries > 0) {
                console.log('Total entries to import: ' + this.totalEntries.toLocaleString());
            }

            const fileStream: ReadStream = createReadStream(this.tempFilePath, { encoding: 'utf8' });
            const rl: Interface = createInterface({
                input: fileStream,
                crlfDelay: Infinity
            });

            let batch: PendingEntry[] = [];
            let totalProcessed: number = 0;
            let batchCount: number = 0;
            const startTime: number = Date.now();

            for await (const line of rl) {
                if (!line.trim()) {
                    continue; // Skip empty lines
                }

                try {
                    const jsonEntry: any = JSON.parse(line);

                    const segmentIndex: number = typeof jsonEntry.segmentIndex === 'number' ? jsonEntry.segmentIndex : 0;
                    const segmentCount: number = typeof jsonEntry.segmentCount === 'number' ? jsonEntry.segmentCount : 1;
                    const metadata: EntryMetadata = this.parseMetadata(jsonEntry.metadata);

                    // Convert JSON entry to PendingEntry
                    const entry: PendingEntry = {
                        language: jsonEntry.language,
                        fileId: jsonEntry.fileId,
                        original: jsonEntry.original,
                        unitId: jsonEntry.unitId,
                        pureText: jsonEntry.pureText,
                        element: Utils.buildXMLElement(jsonEntry.element),
                        segmentIndex,
                        segmentCount,
                        metadata
                    };

                    batch.push(entry);

                    // Process batch when it reaches the batch size
                    if (batch.length >= this.batchSize) {
                        batchCount++;
                        await this.tm.storeBatchEntries(batch);
                        totalProcessed += batch.length;

                        // Calculate progress and ETA
                        const elapsed: number = Date.now() - startTime;
                        const rate: number = totalProcessed / (elapsed / 1000); // entries per second

                        if (this.totalEntries > 0) {
                            const progress: number = (totalProcessed / this.totalEntries) * 100;
                            const remaining: number = this.totalEntries - totalProcessed;
                            const etaSeconds: number = remaining / rate;
                            const etaMinutes: number = Math.floor(etaSeconds / 60);
                            const etaSecondsRemainder: number = Math.floor(etaSeconds % 60);

                            console.log('Progress: ' + totalProcessed.toLocaleString() + '/' + this.totalEntries.toLocaleString() + ' (' + progress.toFixed(1) + '%) - ETA: ' + etaMinutes + 'm ' + etaSecondsRemainder + 's - ' + rate.toFixed(1) + ' entries/sec');
                        } else {
                            console.log('Processed: ' + totalProcessed.toLocaleString() + ' entries - ' + rate.toFixed(1) + ' entries/sec');
                        }

                        batch = [];
                    }
                } catch (parseErr) {
                    console.error('Error parsing JSONL line: ' + parseErr);
                    // Continue with next line
                }
            }

            // Process any remaining entries in the final batch
            if (batch.length > 0) {
                batchCount++;
                await this.tm.storeBatchEntries(batch);
                totalProcessed += batch.length;
            }

            const totalTime: number = (Date.now() - startTime) / 1000;
            const minutes: number = Math.floor(totalTime / 60);
            const seconds: number = Math.floor(totalTime % 60);
            const avgRate: number = totalProcessed / totalTime;

            console.log('\nBatch import complete!');
            console.log('Total entries imported: ' + totalProcessed.toLocaleString());
            console.log('Total time: ' + minutes + 'm ' + seconds + 's');
            console.log('Average rate: ' + avgRate.toFixed(1) + ' entries/sec');

            // Clean up the temporary file
            await this.cleanup();
        } catch (err) {
            console.error('Error during batch import:', err);
            throw err;
        }
    }

    private parseMetadata(metadata: unknown): EntryMetadata {
        if (!metadata || typeof metadata !== 'object') {
            return {};
        }
        const result: EntryMetadata = {};
        const source: Record<string, unknown> = metadata as Record<string, unknown>;
        const copyString = (key: keyof EntryMetadata): void => {
            const value: unknown = source[key as string];
            if (typeof value === 'string' && value.length > 0) {
                (result as Record<string, unknown>)[key as string] = value;
            }
        };
        const copyNumber = (key: keyof EntryMetadata): void => {
            const value: unknown = source[key as string];
            if (typeof value === 'number' && !Number.isNaN(value)) {
                (result as Record<string, unknown>)[key as string] = value;
            }
        };

        copyString('state');
        copyString('subState');
        copyNumber('quality');
        copyString('creationDate');
        copyString('creationId');
        copyString('changeDate');
        copyString('changeId');
        copyString('creationTool');
        copyString('creationToolVersion');
        copyString('context');
        copyNumber('usageCount');
        copyString('lastUsageDate');

        const notes: unknown = source.notes;
        if (Array.isArray(notes)) {
            const filtered: string[] = notes.filter((item: unknown): item is string => typeof item === 'string' && item.length > 0);
            if (filtered.length > 0) {
                result.notes = filtered;
            }
        }

        const properties: unknown = source.properties;
        if (properties && typeof properties === 'object') {
            const props: Record<string, string> = {};
            Object.entries(properties as Record<string, unknown>).forEach(([key, value]: [string, unknown]) => {
                if (typeof value === 'string') {
                    props[key] = value;
                }
            });
            if (Object.keys(props).length > 0) {
                result.properties = props;
            }
        }

        const segment: unknown = (source as Record<string, unknown>).segment;
        if (segment && typeof segment === 'object') {
            const segmentSource: Record<string, unknown> = segment as Record<string, unknown>;
            const segmentMetadata: SegmentMetadata = {};
            const copySegmentString = (key: keyof SegmentMetadata): void => {
                const value: unknown = segmentSource[key as string];
                if (typeof value === 'string' && value.length > 0) {
                    (segmentMetadata as Record<string, unknown>)[key as string] = value;
                }
            };
            const copySegmentNumber = (key: keyof SegmentMetadata): void => {
                const value: unknown = segmentSource[key as string];
                if (typeof value === 'number' && !Number.isNaN(value)) {
                    (segmentMetadata as Record<string, unknown>)[key as string] = value;
                }
            };

            copySegmentString('provider');
            copySegmentString('fileHash');
            copySegmentString('fileId');
            copySegmentString('unitId');
            copySegmentString('segmentId');
            copySegmentString('segmentKey');
            copySegmentNumber('segmentIndex');
            copySegmentNumber('segmentCount');

            if (Object.keys(segmentMetadata).length > 0) {
                result.segment = segmentMetadata;
            }
        }

        return Object.keys(result).length > 0 ? result : {};
    }

    private async cleanup(): Promise<void> {
        try {
            if (existsSync(this.tempFilePath)) {
                unlinkSync(this.tempFilePath);
            }
        } catch (err) {
            console.error('Error cleaning up temporary file ' + this.tempFilePath + ':', err);
            // Don't throw - cleanup failure shouldn't fail the import
        }
    }
}
