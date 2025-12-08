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

import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { SAXParser } from "typesxml/dist";
import { TMXHandler } from "./tmxHandler";

export class TMXReader {

    parser: SAXParser;
    filePath: string;
    handler: TMXHandler;
    jsonlTempPath: string;

    constructor(filePath: string) {
        this.filePath = filePath;
        const filename = basename(filePath);
        
        // Generate temp file path for the JSONL output
        const tempDir = tmpdir();
        const tempFileName = 'tmx_' + Date.now() + '_' + Math.random().toString(36).substring(7) + '.jsonl';
        this.jsonlTempPath = join(tempDir, tempFileName);
        
        this.parser = new SAXParser();
        this.handler = new TMXHandler(this.jsonlTempPath, filename);
        this.parser.setContentHandler(this.handler);
    }

    async parse(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            try {
                // Wait for the handler to signal completion
                this.handler.onComplete(() => {
                    resolve();
                });
                this.parser.parseFile(this.filePath);
            } catch (error: unknown) {
                reject(error instanceof Error ? error : new Error(String(error)));
            }
        });
    }

    getTempFilePath(): string {
        return this.jsonlTempPath;
    }

    getEntryCount(): number {
        return this.handler.getEntryCount();
    }
}