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

import { Catalog, CData, ContentHandler, TextNode, XMLAttribute, XMLElement } from "typesxml/dist";
import { Utils } from "./utils";
import { createWriteStream, WriteStream } from 'fs';

export class TMXHandler implements ContentHandler {

    inCdData: boolean = false;
    currentCData: CData = new CData('');
    stack: Array<XMLElement> = [];

    original: string = '';
    currentTu: string = '';
    fileId: string = '';
    private writeStream: WriteStream;
    private completionCallback: (() => void) | null = null;
    private entryCount: number = 0;

    constructor(tempFilePath: string, filename: string) {
        this.fileId = filename;
        this.writeStream = createWriteStream(tempFilePath, { encoding: 'utf8' });
    }

    onComplete(callback: () => void): void {
        this.completionCallback = callback;
    }

    getEntryCount(): number {
        return this.entryCount;
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
        this.writeStream.end(() => {
            // Call completion callback after stream is fully closed
            if (this.completionCallback) {
                this.completionCallback();
            }
        });
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
            
            // Write entry as JSONL (one JSON object per line)
            const jsonEntry = {
                language: lang,
                fileId: this.fileId,
                original: this.original,
                unitId: this.currentTu,
                pureText: pureText,
                element: tuv.toString()
            };
            this.writeStream.write(JSON.stringify(jsonEntry) + '\n');
            this.entryCount++;
        }
        if ("tu" === name) {
            this.currentTu = '';
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
}