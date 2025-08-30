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

import { Catalog, CData, ContentHandler, TextNode, XMLAttribute, XMLElement, XMLNode } from "typesxml/dist";
import { HybridTM } from "./hybridtm";
import { Ngrams } from "./ngrams";
import { Utils } from "./utils";

export class XLIFFHandler implements ContentHandler {

    tm: HybridTM;
    inCdData: boolean = false;
    currentCData: CData = new CData('');
    stack: Array<XMLElement> = [];

    srcLang: string = '';
    tgtLang: string = '';
    original: string = '';
    fileId: string = '';

    constructor(tm: HybridTM) {
        this.tm = tm;
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
        // do nothing
    }

    xmlDeclaration(version: string, encoding: string, standalone: string | undefined): void {
        // do nothing
    }

    startElement(name: string, atts: Array<XMLAttribute>): void {
        let element: XMLElement = new XMLElement(name);
        atts.forEach((att) => {
            element.setAttribute(att);
        });
        if ("xliff" === name) {
            let version: XMLAttribute | undefined = element.getAttribute("version");
            if (!version || !version.getValue().startsWith("2.")) {
                throw new Error("Unsupported XLIFF version");
            }
            let srcLang: XMLAttribute | undefined = element.getAttribute("srcLang");
            if (!srcLang) {
                throw new Error("Missing @srcLang attribute in <xliff>");
            }
            let trgLang: XMLAttribute | undefined = element.getAttribute("trgLang");
            if (!trgLang) {
                throw new Error("Missing @trgLang attribute in <xliff>");
            }
            this.srcLang = srcLang.getValue();
            this.tgtLang = trgLang.getValue();
        }
        if ("file" === name) {
            let original: XMLAttribute | undefined = element.getAttribute("original");
            this.original = original ? original.getValue() : '';
            let id: XMLAttribute | undefined = element.getAttribute("id");
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
            let unit = this.stack[this.stack.length - 1];
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
        let textNode: TextNode = new TextNode(ch);
        // ignore characters outside of elements
        if (this.stack.length > 0) {
            this.stack[this.stack.length - 1].addTextNode(textNode);
        }
    }

    ignorableWhitespace(ch: string): void {
        let textNode: TextNode = new TextNode(ch);
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
        let id: XMLAttribute | undefined = unit.getAttribute("id");
        if (!id) {
            throw new Error("Missing @id attribute in <unit>");
        }
        let combinedSource: XMLElement = new XMLElement("source");
        let combinedTarget: XMLElement = new XMLElement("target");
        let children: XMLElement[] = unit.getChildren();
        children.forEach((child) => {
            if ("segment" === child.getName() || "ignorable" === child.getName()) {
                let source: XMLElement | undefined = child.getChild("source");
                if (source) {
                    let content: XMLNode[] = source.getContent();
                    content.forEach((node) => {
                        if (node instanceof TextNode) {
                            combinedSource.addTextNode(node);
                        }
                        if (node instanceof XMLElement) {
                            combinedSource.addElement(node);
                        }
                    });
                }
                let target: XMLElement | undefined = child.getChild("target");
                if (target) {
                    let content: XMLNode[] = target.getContent();
                    content.forEach((node) => {
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
        let pureSource: string = Utils.getPureText(combinedSource);
        let sourceNgrams: string[] = Ngrams.generateNGrams(pureSource);
        this.tm.storeLangEntry(this.fileId, this.original, id.getValue(), this.srcLang, pureSource, sourceNgrams, combinedSource);
        let pureTarget: string = Utils.getPureText(combinedTarget);
        let targetNgrams: string[] = Ngrams.generateNGrams(pureTarget);
        this.tm.storeLangEntry(this.fileId, this.original, id.getValue(), this.tgtLang, pureTarget, targetNgrams, combinedTarget);
    }
}