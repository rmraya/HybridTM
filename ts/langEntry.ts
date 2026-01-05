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

export interface SegmentMetadata {
    provider?: string;
    fileHash?: string;
    fileId?: string;
    unitId?: string;
    segmentId?: string;
    segmentIndex?: number;
    segmentCount?: number;
    segmentKey?: string;
}

export interface EntryMetadata {
    state?: 'initial' | 'translated' | 'reviewed' | 'final';
    subState?: string;
    quality?: number;
    creationDate?: string;
    creationId?: string;
    changeDate?: string;
    changeId?: string;
    creationTool?: string;
    creationToolVersion?: string;
    context?: string;
    notes?: string[];
    usageCount?: number;
    lastUsageDate?: string;
    properties?: Record<string, string>;
    segment?: SegmentMetadata;
}

export interface LangEntry {
    id: string;
    language: string;
    pureText: string;
    element: string;
    fileId: string;
    original: string;
    unitId: string;
    vector: number[];
    segmentIndex: number;
    segmentCount: number;
    metadata: EntryMetadata;
    [key: string]: unknown;
}

export interface SearchResult {
    id: string;
    language: string;
    pureText: string;
    element: string;
    fileId: string;
    original: string;
    unitId: string;
    segmentIndex: number;
    segmentCount: number;
    metadata: EntryMetadata;
}