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

import { createWriteStream, WriteStream } from 'node:fs';
import { Catalog, CData, ContentHandler, TextNode, XMLAttribute, XMLElement, XMLNode } from "typesxml/dist";
import { Utils } from "./utils";

export class XLIFFHandler implements ContentHandler {

    inCdData: boolean = false;
    currentCData: CData = new CData('');
    stack: Array<XMLElement> = [];

    srcLang: string = '';
    tgtLang: string = '';
    original: string = '';
    fileId: string = '';
    private writeStream: WriteStream;
    private completionCallback: (() => void) | null = null;
    private entryCount: number = 0;

    constructor(tempFilePath: string) {
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
        const id: XMLAttribute | undefined = unit.getAttribute("id");
        if (!id) {
            throw new Error("Missing @id attribute in <unit>");
        }
        const combinedSource: XMLElement = new XMLElement("source");
        const combinedTarget: XMLElement = new XMLElement("target");
        const children: XMLElement[] = unit.getChildren();
        children.forEach((child: XMLElement) => {
            if ("segment" === child.getName() || "ignorable" === child.getName()) {
                const source: XMLElement | undefined = child.getChild("source");
                if (source) {
                    const content: XMLNode[] = source.getContent();
                    content.forEach((node: XMLNode) => {
                        if (node instanceof TextNode) {
                            combinedSource.addTextNode(node);
                        }
                        if (node instanceof XMLElement) {
                            combinedSource.addElement(node);
                        }
                    });
                }
                const target: XMLElement | undefined = child.getChild("target");
                if (target) {
                    const content: XMLNode[] = target.getContent();
                    content.forEach((node: XMLNode) => {
                        if (node instanceof TextNode) {
                            combinedTarget.addTextNode(node);
                        }
                        if (node instanceof XMLElement) {
                            combinedTarget.addElement(node);
                        }
                    });
                }
            }
        });
        const pureSource: string = Utils.getPureText(combinedSource);
        const pureTarget: string = Utils.getPureText(combinedTarget);
        
        // Write source entry as JSONL
        const sourceEntry = {
            language: this.srcLang,
            fileId: this.fileId,
            original: this.original,
            unitId: id.getValue(),
            pureText: pureSource,
            element: combinedSource.toString()
        };
        this.writeStream.write(JSON.stringify(sourceEntry) + '\n');
        this.entryCount++;
        
        if (pureTarget === '') {
            return; // No target to write
        }
        // Write target entry as JSONL
        const targetEntry = {
            language: this.tgtLang,
            fileId: this.fileId,
            original: this.original,
            unitId: id.getValue(),
            pureText: pureTarget,
            element: combinedTarget.toString()
        };
        this.writeStream.write(JSON.stringify(targetEntry) + '\n');
        this.entryCount++;
    }
}