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

import { ContentHandler, DOMBuilder, SAXParser, TextNode, XMLElement, XMLNode, XMLDocument } from "typesxml/dist";

export class Utils {

    static getPureText(element: XMLElement): string {
        let text: string = '';
        let content: XMLNode[] = element.getContent();
        content.forEach((node) => {
            if (node instanceof TextNode) {
                text += node.getValue();
            }
            if (node instanceof XMLElement) {
                let child: XMLElement = node;
                if ("pc" === child.getName() || "mrk" === child.getName()) {
                    text += this.getPureText(child);
                }
                // purposedly ignore "cp" for now
            }
        });
        return text;
    }

    static buildXMLElement(str: string): XMLElement {
        let contentHandler: ContentHandler = new DOMBuilder();
        let xmlParser = new SAXParser();
        xmlParser.setContentHandler(contentHandler);
        xmlParser.parseString(str);
        let newDoc: XMLDocument | undefined = (contentHandler as DOMBuilder).getDocument();
        if (newDoc) {
            let root: XMLElement | undefined = newDoc.getRoot();
            if (root) {
                return root;
            }
        }
        throw new Error('Error building XMLElement from string');
    }
}