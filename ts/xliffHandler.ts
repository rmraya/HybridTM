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

import { createWriteStream, WriteStream } from "node:fs";
import { Catalog, CData, ContentHandler, Grammar, TextNode, XMLAttribute, XMLElement, XMLNode } from "typesxml";
import { DEFAULT_IMPORT_OPTIONS, ImportOptions, ResolvedImportOptions, resolveImportOptions, TranslationState } from './importOptions.js';
import { EntryMetadata } from './langEntry.js';
import { Utils } from './utils.js';

interface SegmentData {
    source: XMLElement;
    target: XMLElement;
    pureSource: string;
    pureTarget: string;
    metadata?: EntryMetadata;
    segmentId?: string;
}

interface HandlerEntry {
    language: string;
    fileId: string;
    unitId: string;
    original: string;
    pureText: string;
    element: string;
    segmentIndex: number;
    segmentCount: number;
    metadata?: EntryMetadata;
}

export class XLIFFHandler implements ContentHandler {

    inCdData: boolean = false;
    currentCData: CData = new CData('');
    stack: Array<XMLElement> = [];

    srcLang: string = '';
    tgtLang: string = '';
    original: string = '';
    fileId: string = '';
    private writeStream: WriteStream;
    private readonly completionPromise: Promise<void>;
    private entryCount: number = 0;
    private readonly options: ResolvedImportOptions;

    constructor(tempFilePath: string, options: ImportOptions = DEFAULT_IMPORT_OPTIONS) {
        this.writeStream = createWriteStream(tempFilePath, { encoding: 'utf8' });
        this.completionPromise = new Promise<void>((resolve, reject) => {
            this.writeStream.once('finish', resolve);
            this.writeStream.once('error', reject);
        });
        this.options = resolveImportOptions(options);
    }

    setGrammar(grammar: Grammar | undefined): void {
        // do nothing
    }

    getEntryCount(): number {
        return this.entryCount;
    }

    waitForCompletion(): Promise<void> {
        return this.completionPromise;
    }

    initialize(): void {
        this.stack = new Array();
        this.inCdData = false;
    }

    setCatalog(catalog: Catalog): void {
        // do nothing
    }

    startDocument(): void {
        // do nothing
    }

    endDocument(): void {
        // Close the write stream when document ends
        this.writeStream.end();
    }

    xmlDeclaration(version: string, encoding: string, standalone: string | undefined): void {
        // do nothing
    }

    startElement(name: string, atts: Array<XMLAttribute>): void {
        const element: XMLElement = new XMLElement(name);
        atts.forEach((att: XMLAttribute) => {
            element.setAttribute(att);
        });
        if ("xliff" === name) {
            const version: XMLAttribute | undefined = element.getAttribute("version");
            if (!version || !version.getValue().startsWith("2.")) {
                throw new Error("Unsupported XLIFF version");
            }
            const srcLang: XMLAttribute | undefined = element.getAttribute("srcLang");
            if (!srcLang) {
                throw new Error("Missing @srcLang attribute in <xliff>");
            }
            const trgLang: XMLAttribute | undefined = element.getAttribute("trgLang");
            if (!trgLang) {
                throw new Error("Missing @trgLang attribute in <xliff>");
            }
            this.srcLang = srcLang.getValue();
            this.tgtLang = trgLang.getValue();
        }
        if ("file" === name) {
            const original: XMLAttribute | undefined = element.getAttribute("original");
            this.original = original ? original.getValue() : '';
            const id: XMLAttribute | undefined = element.getAttribute("id");
            if (!id) {
                throw new Error("Missing @id attribute in <file>");
            }
            this.fileId = id.getValue();
        }
        if (this.stack.length > 0) {
            this.stack[this.stack.length - 1].addElement(element);
        }
        this.stack.push(element);
    }

    endElement(name: string): void {
        if ("unit" === name) {
            const unit: XMLElement = this.stack[this.stack.length - 1];
            this.processUnit(unit);
        }
        this.stack.pop();
    }

    internalSubset(declaration: string): void {
        // do nothing
    }

    characters(ch: string): void {
        if (this.inCdData) {
            this.currentCData.setValue(this.currentCData.getValue() + ch);
            return;
        }
        const textNode: TextNode = new TextNode(ch);
        // ignore characters outside of elements
        if (this.stack.length > 0) {
            this.stack[this.stack.length - 1].addTextNode(textNode);
        }
    }

    ignorableWhitespace(ch: string): void {
        const textNode: TextNode = new TextNode(ch);
        // ignore characters outside of elements
        if (this.stack.length > 0) {
            this.stack[this.stack.length - 1].addTextNode(textNode);
        }
    }

    comment(ch: string): void {
        // do nothing
    }

    processingInstruction(target: string, data: string): void {
        // do nothing
    }

    startCDATA(): void {
        this.inCdData = true;
    }

    endCDATA(): void {
        this.inCdData = false;
    }

    startDTD(name: string, publicId: string, systemId: string): void {
        // do nothing
    }

    endDTD(): void {
        // do nothing
    }

    skippedEntity(name: string): void {
        // do nothing
    }

    processUnit(unit: XMLElement): void {
        const id: XMLAttribute | undefined = unit.getAttribute('id');
        if (!id) {
            throw new Error('Missing @id attribute in <unit>');
        }
        const unitId: string = id.getValue();
        const segmentElements: XMLElement[] = unit.getChildren().filter((child: XMLElement) => child.getName() === 'segment');

        let segments: SegmentData[] = [];
        if (segmentElements.length > 0) {
            segments = this.buildSegments(unitId, unit, segmentElements);
            if (segments.length === 0) {
                return;
            }
        } else {
            const fallback: SegmentData | null = this.buildSingleSegment(unitId, unit);
            if (!fallback) {
                return;
            }
            segments = [fallback];
        }

        const segmentCount: number = segments.length;
        segments.forEach((segment: SegmentData, index: number) => {
            const segmentIndex: number = index + 1;
            this.writeSegmentEntries(unitId, segmentIndex, segmentCount, segment);
        });

        if (segmentCount > 1) {
            this.writeMergedEntry(unitId, segments);
        }
    }

    private buildSegments(unitId: string, unit: XMLElement, segmentElements: XMLElement[]): SegmentData[] {
        const segments: SegmentData[] = [];
        segmentElements.forEach((segment: XMLElement) => {
            const processed: SegmentData | null = this.buildSegmentData(unitId, unit, segment);
            if (processed) {
                segments.push(processed);
            }
        });
        return segments;
    }

    private buildSegmentData(unitId: string, unit: XMLElement, segment: XMLElement): SegmentData | null {
        const sourceElement: XMLElement | undefined = segment.getChild('source');
        const targetElement: XMLElement | undefined = segment.getChild('target');
        if (!sourceElement || !targetElement) {
            return null;
        }

        const pureSource: string = Utils.getPureText(sourceElement);
        const pureTarget: string = Utils.getPureText(targetElement);
        if (pureSource.trim().length === 0) {
            return null;
        }
        if (this.options.skipEmpty && pureTarget.trim().length === 0) {
            return null;
        }

        const rawState: string | undefined = segment.getAttribute('state')?.getValue();
        const stateRank: number = this.getStateRank(rawState);
        const minRank: number = this.getStateRankFromOption(this.options.minState);

        if (stateRank > 0 && stateRank < minRank) {
            return null;
        }
        if (stateRank === 0 && this.options.skipUnconfirmed) {
            return null;
        }

        const segmentId: string | undefined = segment.getAttribute('id')?.getValue();
        const metadata: EntryMetadata | undefined = this.options.extractMetadata
            ? this.extractMetadata(unitId, unit, segment, rawState, segmentId)
            : undefined;

        return {
            source: sourceElement,
            target: targetElement,
            pureSource,
            pureTarget,
            metadata,
            segmentId
        };
    }

    private buildSingleSegment(unitId: string, unit: XMLElement): SegmentData | null {
        const combinedSource: XMLElement = new XMLElement('source');
        const combinedTarget: XMLElement = new XMLElement('target');
        unit.getChildren().forEach((child: XMLElement) => {
            if (child.getName() === 'segment' || child.getName() === 'ignorable') {
                const source: XMLElement | undefined = child.getChild('source');
                if (source) {
                    this.appendElementContent(combinedSource, source);
                }
                const target: XMLElement | undefined = child.getChild('target');
                if (target) {
                    this.appendElementContent(combinedTarget, target);
                }
            }
        });

        const pureSource: string = Utils.getPureText(combinedSource);
        const pureTarget: string = Utils.getPureText(combinedTarget);
        if (pureSource.trim().length === 0) {
            return null;
        }
        if (this.options.skipEmpty && pureTarget.trim().length === 0) {
            return null;
        }

        const metadata: EntryMetadata | undefined = this.options.extractMetadata
            ? this.extractMetadata(unitId, unit, unit)
            : undefined;

        return {
            source: combinedSource,
            target: combinedTarget,
            pureSource,
            pureTarget,
            metadata
        };
    }

    private writeSegmentEntries(unitId: string, segmentIndex: number, segmentCount: number, segment: SegmentData): void {
        const metadata: EntryMetadata | undefined = this.applySegmentPosition(
            segment.metadata,
            unitId,
            segment.segmentId,
            segmentIndex,
            segmentCount
        );

        this.writeEntry({
            language: this.srcLang,
            fileId: this.fileId,
            unitId,
            original: this.original,
            pureText: segment.pureSource,
            element: segment.source.toString(),
            segmentIndex,
            segmentCount,
            metadata
        });

        this.writeEntry({
            language: this.tgtLang,
            fileId: this.fileId,
            unitId,
            original: this.original,
            pureText: segment.pureTarget,
            element: segment.target.toString(),
            segmentIndex,
            segmentCount,
            metadata
        });
    }

    private applySegmentPosition(
        metadata: EntryMetadata | undefined,
        unitId: string,
        explicitSegmentId: string | undefined,
        segmentIndex: number,
        segmentCount: number
    ): EntryMetadata | undefined {
        if (!metadata) {
            return undefined;
        }

        if (!metadata.segment) {
            metadata.segment = {
                provider: 'xliff',
                fileId: this.fileId,
                unitId,
                segmentId: explicitSegmentId
            };
        } else {
            metadata.segment.provider = metadata.segment.provider || 'xliff';
            metadata.segment.fileId = metadata.segment.fileId || this.fileId;
            metadata.segment.unitId = metadata.segment.unitId || unitId;
            if (!metadata.segment.segmentId && explicitSegmentId) {
                metadata.segment.segmentId = explicitSegmentId;
            }
        }

        if (!metadata.segment.segmentId && segmentIndex > 0) {
            metadata.segment.segmentId = explicitSegmentId || segmentIndex.toString();
        }

        metadata.segment.segmentIndex = segmentIndex;
        metadata.segment.segmentCount = segmentCount;
        return metadata;
    }

    private writeMergedEntry(unitId: string, segments: SegmentData[]): void {
        const mergedSource: XMLElement = new XMLElement('source');
        const mergedTarget: XMLElement = new XMLElement('target');

        segments.forEach((segment: SegmentData) => {
            this.appendElementContent(mergedSource, segment.source);
            this.appendElementContent(mergedTarget, segment.target);
        });

        const pureSource: string = Utils.getPureText(mergedSource);
        const pureTarget: string = Utils.getPureText(mergedTarget);
        if (pureSource.trim().length === 0) {
            return;
        }
        if (this.options.skipEmpty && pureTarget.trim().length === 0) {
            return;
        }

        this.writeEntry({
            language: this.srcLang,
            fileId: this.fileId,
            unitId,
            original: this.original,
            pureText: pureSource,
            element: mergedSource.toString(),
            segmentIndex: 0,
            segmentCount: segments.length
        });

        this.writeEntry({
            language: this.tgtLang,
            fileId: this.fileId,
            unitId,
            original: this.original,
            pureText: pureTarget,
            element: mergedTarget.toString(),
            segmentIndex: 0,
            segmentCount: segments.length
        });
    }

    private writeEntry(entry: HandlerEntry): void {
        const payload: Record<string, unknown> = {
            language: entry.language,
            fileId: entry.fileId,
            original: entry.original,
            unitId: entry.unitId,
            pureText: entry.pureText,
            element: entry.element,
            segmentIndex: entry.segmentIndex,
            segmentCount: entry.segmentCount
        };

        if (this.hasMetadata(entry.metadata)) {
            payload.metadata = entry.metadata;
        }

        this.writeStream.write(JSON.stringify(payload) + '\n');
        this.entryCount++;
    }

    private hasMetadata(metadata: EntryMetadata | undefined): boolean {
        return !!metadata && Object.keys(metadata).length > 0;
    }

    private appendElementContent(target: XMLElement, element: XMLElement): void {
        const content: XMLNode[] = element.getContent();
        content.forEach((node: XMLNode) => {
            if (node instanceof TextNode) {
                target.addTextNode(node);
            } else if (node instanceof XMLElement) {
                target.addElement(node);
            }
        });
    }

    private extractMetadata(
        unitId: string,
        unit: XMLElement,
        segment: XMLElement,
        rawState?: string,
        segmentId?: string
    ): EntryMetadata {
        const metadata: EntryMetadata = {};

        if (this.isTranslationState(rawState)) {
            metadata.state = rawState;
        }

        const subState: string | undefined = this.readSubState(segment);
        if (subState) {
            metadata.subState = subState;
        }

        this.assignMetadataString(metadata, 'creationDate', this.readAttribute(segment, 'creationDate') || this.readAttribute(unit, 'creationDate'));
        this.assignMetadataString(metadata, 'creationId', this.readAttribute(segment, 'creationId') || this.readAttribute(unit, 'creationId'));
        this.assignMetadataString(metadata, 'changeDate', this.readAttribute(segment, 'changeDate') || this.readAttribute(unit, 'changeDate'));
        this.assignMetadataString(metadata, 'changeId', this.readAttribute(segment, 'changeId') || this.readAttribute(unit, 'changeId'));
        this.assignMetadataString(metadata, 'creationTool', this.readAttribute(segment, 'creationTool') || this.readAttribute(unit, 'creationTool'));
        this.assignMetadataString(metadata, 'creationToolVersion', this.readAttribute(segment, 'creationToolVersion') || this.readAttribute(unit, 'creationToolVersion'));
        this.assignMetadataString(metadata, 'context', this.readAttribute(segment, 'context') || this.readAttribute(unit, 'context'));

        const notes: string[] = [];
        this.collectNotes(unit, notes);
        this.collectNotes(segment, notes);
        if (notes.length > 0) {
            metadata.notes = notes;
        }

        const properties: Record<string, string> = {};
        this.collectMetadataProperties(unit, properties);
        this.collectMetadataProperties(segment, properties);
        if (Object.keys(properties).length > 0) {
            metadata.properties = properties;
            if (!metadata.context) {
                const contextKey: string | undefined = Object.keys(properties).find((key: string) => key.toLowerCase().includes('context'));
                if (contextKey) {
                    metadata.context = properties[contextKey];
                }
            }
        }

        metadata.segment = {
            provider: 'xliff',
            fileId: this.fileId,
            unitId,
            segmentId
        };

        return metadata;
    }

    private assignMetadataString(metadata: EntryMetadata, key: keyof EntryMetadata, value: string | undefined): void {
        if (value && value.length > 0) {
            (metadata as Record<string, unknown>)[key as string] = value;
        }
    }

    private readAttribute(element: XMLElement, name: string): string | undefined {
        const attribute: XMLAttribute | undefined = element.getAttribute(name);
        if (!attribute) {
            return undefined;
        }
        const value: string = attribute.getValue();
        return value && value.length > 0 ? value : undefined;
    }

    private readSubState(segment: XMLElement): string | undefined {
        const direct: string | undefined = this.readAttribute(segment, 'subState');
        if (direct) {
            return direct;
        }
        const target: XMLElement | undefined = segment.getChild('target');
        if (target) {
            const targetValue: string | undefined = this.readAttribute(target, 'subState');
            if (targetValue) {
                return targetValue;
            }
        }
        const source: XMLElement | undefined = segment.getChild('source');
        if (source) {
            const sourceValue: string | undefined = this.readAttribute(source, 'subState');
            if (sourceValue) {
                return sourceValue;
            }
        }
        return undefined;
    }

    private collectNotes(element: XMLElement, accumulator: string[]): void {
        element.getChildren().forEach((child: XMLElement) => {
            if (child.getName() === 'notes') {
                child.getChildren().forEach((noteElement: XMLElement) => {
                    if (noteElement.getName() === 'note') {
                        const value: string = Utils.getPureText(noteElement).trim();
                        if (value.length > 0) {
                            accumulator.push(value);
                        }
                    }
                });
            }
        });
    }

    private collectMetadataProperties(element: XMLElement, properties: Record<string, string>): void {
        element.getChildren().forEach((child: XMLElement) => {
            const name: string = child.getName();
            if (name.endsWith('metadata')) {
                child.getChildren().forEach((metaGroup: XMLElement) => {
                    if (!metaGroup.getName().endsWith('metaGroup')) {
                        return;
                    }
                    const category: string | undefined = metaGroup.getAttribute('category')?.getValue();
                    metaGroup.getChildren().forEach((meta: XMLElement) => {
                        if (!meta.getName().endsWith('meta')) {
                            return;
                        }
                        const typeValue: string | undefined = meta.getAttribute('type')?.getValue();
                        const key: string = category ? category + ':' + (typeValue || '') : (typeValue || '');
                        const content: string = Utils.getPureText(meta).trim();
                        if (key.length > 0 && content.length > 0) {
                            properties[key] = content;
                        }
                    });
                });
            }
        });
    }

    private getStateRank(rawState: string | undefined): number {
        if (!this.isTranslationState(rawState)) {
            return 0;
        }
        return this.getStateRankFromOption(rawState);
    }

    private getStateRankFromOption(state: TranslationState | undefined): number {
        if (!state) {
            return 0;
        }
        switch (state) {
            case 'initial':
                return 0;
            case 'translated':
                return 1;
            case 'reviewed':
                return 2;
            case 'final':
                return 3;
            default:
                return 0;
        }
    }

    private isTranslationState(value: string | undefined): value is TranslationState {
        return value === 'initial'
            || value === 'translated'
            || value === 'reviewed'
            || value === 'final';
    }

    getGrammar(): Grammar | undefined {
        return undefined;
    }
}