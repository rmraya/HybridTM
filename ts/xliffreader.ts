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

import { ContentHandler, SAXParser } from "typesxml/dist";
import { HybridTM } from "./hybridtm";
import { XLIFFHandler } from "./xliffhandler";

export class XLIFFReader {

    parser: SAXParser;
    constructor(private filePath: string, tm: HybridTM) {
        this.parser = new SAXParser();
        const handler: ContentHandler = new XLIFFHandler(tm);
        this.parser.setContentHandler(handler);
    }

    parse(): void {
        this.parser.parseFile(this.filePath);
    }
}
