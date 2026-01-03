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

import { tmpdir } from "node:os";
import { join } from 'node:path';
import { SAXParser } from "typesxml";
import { XLIFFHandler } from './xliffHandler.js';

export class XLIFFReader {

    parser: SAXParser;
    tempFilePath: string;
    handler: XLIFFHandler;
    filePath: string;
    
    constructor(filePath: string) {
        this.filePath = filePath;
        
        // Generate temp file path
        const tempDir = tmpdir();
        const tempFileName = 'xliff_' + Date.now() + '_' + Math.random().toString(36).substring(7) + '.jsonl';
        this.tempFilePath = join(tempDir, tempFileName);
        
        this.parser = new SAXParser();
        this.handler = new XLIFFHandler(this.tempFilePath);
        this.parser.setContentHandler(this.handler);
    }

    async parse(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            // Wait for the handler to signal completion
            this.handler.onComplete(() => {
                resolve();
            });
            
            try {
                this.parser.parseFile(this.filePath);
            } catch (error: unknown) {
                reject(error instanceof Error ? error : new Error(String(error)));
            }
        });
    }

    getTempFilePath(): string {
        return this.tempFilePath;
    }

    getEntryCount(): number {
        return this.handler.getEntryCount();
    }
}

