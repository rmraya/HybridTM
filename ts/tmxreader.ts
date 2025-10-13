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

import { basename, join } from 'path';
import { tmpdir } from 'os';
import { SAXParser } from "typesxml/dist";
import { TMXHandler } from "./tmxhandler";

export class TMXReader {

    parser: SAXParser;
    filePath: string;
    handler: TMXHandler;
    tempFilePath: string;

    constructor(filePath: string) {
        this.filePath = filePath;
        const filename = basename(filePath);
        
        // Generate temp file path
        const tempDir = tmpdir();
        const tempFileName = `tmx_${Date.now()}_${Math.random().toString(36).substring(7)}.jsonl`;
        this.tempFilePath = join(tempDir, tempFileName);
        
        this.parser = new SAXParser();
        this.handler = new TMXHandler(this.tempFilePath, filename);
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
                reject(error);
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