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

import { existsSync } from "fs";
import { Database } from "sqlite3";
import { XMLElement } from "typesxml";
import { Match } from "./match";
import { XLIFFReader } from "./xliffreader";

export class HybridTM {

    static readonly FAST_MODEL: string = 'Xenova/distiluse-base-multilingual-cased-v1';
    static readonly DEFAULT_MODEL: string = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';

    db: Database;

    constructor(filePath: string, optimize?: string) {
        // Initialize the Hybrid Translation Memory with a file path
        const dbExists: boolean = existsSync(filePath);
        this.db = new Database(filePath, (err) => {
            if (err) {
                console.error('Error opening database:', err.message);
                throw err;
            }
        });

        if (!dbExists) {
            this.initializeDatabase();
        }
    }

    private initializeDatabase(): void {
        this.db.serialize(() => {
            this.db.run(`
                CREATE TABLE IF NOT EXISTS translation_units (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    src_lang TEXT NOT NULL,
                    tgt_lang TEXT NOT NULL,
                    src_text TEXT NOT NULL,
                    tgt_text TEXT NOT NULL,
                    metadata TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) {
                    console.error('Error creating translation_units table:', err.message);
                    throw err;
                }
            });

            this.db.run(`
                CREATE INDEX IF NOT EXISTS idx_src_text ON translation_units(src_text)
            `, (err) => {
                if (err) {
                    console.error('Error creating src_text index:', err.message);
                    throw err;
                }
            });

            this.db.run(`
                CREATE INDEX IF NOT EXISTS idx_tgt_text ON translation_units(tgt_text)
            `, (err) => {
                if (err) {
                    console.error('Error creating tgt_text index:', err.message);
                    throw err;
                }
            });

            this.db.run(`
                CREATE INDEX IF NOT EXISTS idx_lang_pair ON translation_units(src_lang, tgt_lang)
            `, (err) => {
                if (err) {
                    console.error('Error creating language pair index:', err.message);
                    throw err;
                }
            });
        });
    }

    importXLIFF(filePath: string): void {
        let reader: XLIFFReader = new XLIFFReader(filePath, this);
        reader.parse();
    }

    concordanceSearch(term: string, language: string): Array<XMLElement> {
        // Implementation for concordance search
        console.log(`Searching for concordance of term: ${term} in language: ${language}`);
        return [];
    }

    searchTranslations(searchStr: string, srcLang: string, tgtLang: string, similarity: number, caseSensitive: boolean): Array<Match> {
        // Implementation for searching translations
        console.log(`Searching translations for term: ${searchStr} from ${srcLang} to ${tgtLang} with similarity: ${similarity} and caseSensitive: ${caseSensitive}`);
        return [];
    }

    searchAll(searchStr: string, srcLang: string, similarity: number, caseSensitive: boolean): Array<XMLElement> {
        // Implementation for searching all elements
        console.log(`Searching all elements for term: ${searchStr} in language: ${srcLang} with similarity: ${similarity} and caseSensitive: ${caseSensitive}`);
        return [];
    }

    storeLangEntry(fileId: string, original: string , unitId: string, lang: string , pureText: string, ngrams: string[], element: XMLElement): void{
        console.log(`Storing language entry for fileId: ${fileId}, original: ${original}, unitId: ${unitId}, lang: ${lang}, pureText: ${pureText}, ngrams: ${ngrams}, element: ${element}`);
    }
}