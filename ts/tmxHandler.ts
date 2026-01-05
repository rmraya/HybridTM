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
import { Catalog, CData, ContentHandler, Grammar, TextNode, XMLAttribute, XMLElement } from "typesxml";
import { DEFAULT_IMPORT_OPTIONS, ImportOptions, ResolvedImportOptions, resolveImportOptions } from './importOptions.js';
import { EntryMetadata } from './langEntry.js';
import { Utils } from './utils.js';

interface SegmentIdentifier {
    fileHash: string;
    fileId: string;
    unitId: string;
    segmentId: string;
}

export class TMXHandler implements ContentHandler {

    inCdData: boolean = false;
    currentCData: CData = new CData('');
    stack: Array<XMLElement> = [];

    original: string = '';
    currentTu: string = '';
    fileId: string = '';
    currentTuElement: XMLElement | null = null;
    private writeStream: WriteStream;
    private readonly completionPromise: Promise<void>;
    private entryCount: number = 0;
    private readonly options: ResolvedImportOptions;

    constructor(tempFilePath: string, filename: string, options: ImportOptions = DEFAULT_IMPORT_OPTIONS) {
        this.fileId = filename;
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
        if ("tu" === name) {
            const tuid: XMLAttribute | undefined = element.getAttribute("tuid");
            if (tuid) {
                this.currentTu = tuid.getValue();
            } else {
                this.currentTu = Date.now().toString();
            }
            this.currentTuElement = element;
        }
        if (this.stack.length > 0) {
            this.stack[this.stack.length - 1].addElement(element);
        }
        this.stack.push(element);
    }

    endElement(name: string): void {
        if ("tuv" === name) {
            const tuv: XMLElement = this.stack[this.stack.length - 1];
            let lang: string = tuv.getAttribute("xml:lang")?.getValue() || '';
            if ('' === lang) {
                lang = tuv.getAttribute("lang")?.getValue() || '';
            }
            if ('' === lang) {
                throw new Error("Missing @xml:lang or @lang attribute in <tuv>");
            }
            const seg: XMLElement | undefined = tuv.getChild("seg");
            if (!seg) {
                throw new Error("Missing <seg> child element in <tuv>");
            }
            const pureText: string = Utils.getPureText(seg);
            if (pureText.trim().length === 0 && this.options.skipEmpty) {
                this.stack.pop();
                return;
            }

            const metadata: EntryMetadata = this.options.extractMetadata
                ? this.extractMetadata(this.currentTuElement, tuv)
                : {};

            const jsonEntry: Record<string, unknown> = {
                language: lang,
                fileId: this.fileId,
                original: this.original,
                unitId: this.currentTu,
                pureText: pureText,
                element: tuv.toString(),
                segmentIndex: 0,
                segmentCount: 1
            };

            if (this.hasMetadata(metadata)) {
                jsonEntry.metadata = metadata;
            }

            this.writeStream.write(JSON.stringify(jsonEntry) + '\n');
            this.entryCount++;
        }
        if ("tu" === name) {
            this.currentTu = '';
            this.currentTuElement = null;
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

    getGrammar(): Grammar | undefined {
        return undefined;
    }

    private extractMetadata(tu: XMLElement | null, tuv: XMLElement): EntryMetadata {
        const metadata: EntryMetadata = {};

        this.assignMetadataString(metadata, 'creationDate', this.readAttribute(tuv, 'creationdate') || (tu ? this.readAttribute(tu, 'creationdate') : undefined));
        this.assignMetadataString(metadata, 'creationId', this.readAttribute(tuv, 'creationid') || (tu ? this.readAttribute(tu, 'creationid') : undefined));
        this.assignMetadataString(metadata, 'changeDate', this.readAttribute(tuv, 'changedate') || (tu ? this.readAttribute(tu, 'changedate') : undefined));
        this.assignMetadataString(metadata, 'changeId', this.readAttribute(tuv, 'changeid') || (tu ? this.readAttribute(tu, 'changeid') : undefined));
        this.assignMetadataString(metadata, 'creationTool', this.readAttribute(tuv, 'creationtool') || (tu ? this.readAttribute(tu, 'creationtool') : undefined));
        this.assignMetadataString(metadata, 'creationToolVersion', this.readAttribute(tuv, 'creationtoolversion') || (tu ? this.readAttribute(tu, 'creationtoolversion') : undefined));

        const usageCount: number | undefined = this.parseNumber(tu ? this.readAttribute(tu, 'usagecount') : undefined);
        if (usageCount !== undefined) {
            metadata.usageCount = usageCount;
        }

        const lastUsage: string | undefined = this.readAttribute(tu, 'lastusagedate');
        if (lastUsage) {
            metadata.lastUsageDate = lastUsage;
        }

        const notes: string[] = [];
        this.collectNotes(tu, notes);
        this.collectNotes(tuv, notes);
        if (notes.length > 0) {
            metadata.notes = notes;
        }

        const properties: Record<string, string> = {};
        this.collectProperties(tu, properties);
        this.collectProperties(tuv, properties);
        const segmentId: string | undefined = this.readSegmentIdProp(properties);
        if (Object.keys(properties).length > 0) {
            metadata.properties = properties;
            const explicitContext: string | undefined = properties['x-context'] || properties['context'] || properties['domain'];
            if (explicitContext) {
                metadata.context = explicitContext;
            }
            const adjacencyContext: string | undefined = this.buildContextFromProperties(properties);
            if (adjacencyContext) {
                metadata.context = metadata.context
                    ? metadata.context + ' | ' + adjacencyContext
                    : adjacencyContext;
            }
        }

        this.attachSegmentMetadata(metadata, segmentId || this.currentTu);

        return metadata;
    }

    private readAttribute(element: XMLElement | null, name: string): string | undefined {
        if (!element) {
            return undefined;
        }
        const attribute: XMLAttribute | undefined = element.getAttribute(name);
        if (!attribute) {
            return undefined;
        }
        const value: string = attribute.getValue();
        return value.length > 0 ? value : undefined;
    }

    private assignMetadataString(metadata: EntryMetadata, key: keyof EntryMetadata, value: string | undefined): void {
        if (value) {
            (metadata as Record<string, unknown>)[key as string] = value;
        }
    }

    private parseNumber(value: string | undefined): number | undefined {
        if (!value) {
            return undefined;
        }
        const parsed: number = Number(value);
        return Number.isNaN(parsed) ? undefined : parsed;
    }

    private collectNotes(element: XMLElement | null, accumulator: string[]): void {
        if (!element) {
            return;
        }
        element.getChildren().forEach((child: XMLElement) => {
            if (child.getName() === 'note') {
                const value: string = Utils.getPureText(child).trim();
                if (value.length > 0) {
                    accumulator.push(value);
                }
            }
        });
    }

    private collectProperties(element: XMLElement | null, accumulator: Record<string, string>): void {
        if (!element) {
            return;
        }
        element.getChildren().forEach((child: XMLElement) => {
            if (child.getName() === 'prop') {
                const typeAttr: string | undefined = child.getAttribute('type')?.getValue();
                const key: string = typeAttr ? typeAttr.trim() : '';
                if (key.length === 0) {
                    return;
                }
                const value: string = Utils.getPureText(child).trim();
                if (value.length > 0) {
                    accumulator[key] = value;
                }
            }
        });
    }

    private hasMetadata(metadata: EntryMetadata | undefined): boolean {
        return !!metadata && Object.keys(metadata).length > 0;
    }

    private buildContextFromProperties(properties: Record<string, string>): string | undefined {
        const prevValue: string | undefined = this.findDirectionalProperty(properties, /^prev-/i);
        const nextValue: string | undefined = this.findDirectionalProperty(properties, /^next-/i);
        const segments: string[] = [];
        if (prevValue) {
            segments.push('prev=' + this.describeSegmentReference(prevValue));
        }
        if (nextValue) {
            segments.push('next=' + this.describeSegmentReference(nextValue));
        }
        return segments.length > 0 ? segments.join('; ') : undefined;
    }

    private findDirectionalProperty(properties: Record<string, string>, pattern: RegExp): string | undefined {
        for (const [key, value] of Object.entries(properties)) {
            if (pattern.test(key) && value.length > 0) {
                return value;
            }
        }
        return undefined;
    }

    private readSegmentIdProp(properties: Record<string, string>): string | undefined {
        const propertyValue: string | undefined = properties['xliff-segment'];
        if (!propertyValue) {
            return undefined;
        }
        const trimmed: string = propertyValue.trim();
        return trimmed.length === 0 ? undefined : trimmed;
    }

    private attachSegmentMetadata(metadata: EntryMetadata, identifier: string | undefined): void {
        if (!identifier) {
            return;
        }
        const parsed: SegmentIdentifier | null = this.parseSegmentIdentifier(identifier);
        if (!parsed) {
            return;
        }
        metadata.segment = {
            provider: 'xliff-segment',
            segmentKey: identifier,
            fileHash: parsed.fileHash,
            fileId: parsed.fileId,
            unitId: parsed.unitId,
            segmentId: parsed.segmentId
        };
    }

    private describeSegmentReference(value: string): string {
        const parsed: SegmentIdentifier | null = this.parseSegmentIdentifier(value);
        if (!parsed) {
            return value;
        }
        return value + ' (file ' + parsed.fileId + ', unit ' + parsed.unitId + ', segment ' + parsed.segmentId + ')';
    }

    private parseSegmentIdentifier(identifier: string | undefined): SegmentIdentifier | null {
        if (!identifier) {
            return null;
        }
        const trimmed: string = identifier.trim();
        if (trimmed.length === 0) {
            return null;
        }
        const parts: string[] = trimmed.split('-');
        if (parts.length < 4) {
            return null;
        }
        const tail: string[] = parts.slice(-3);
        if (!tail.every((part: string) => /^\d+$/.test(part))) {
            return null;
        }
        return {
            fileHash: parts.slice(0, -3).join('-'),
            fileId: tail[0],
            unitId: tail[1],
            segmentId: tail[2]
        };
    }
}