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

export class Ngrams {

    static NGRAMSIZE: number = 3;

    constructor() {
        // Initialize Ngrams with default settings
    }

    static generateNGrams(text: string): Array<string> {
        const src = text.toLowerCase();
        const ngramSet = new Set<string>();
        
        // Generate character-level n-grams
        for (let i = 0; i <= src.length - this.NGRAMSIZE; i++) {
            const gram = src.substring(i, i + this.NGRAMSIZE);
            ngramSet.add(gram);
        }
        
        return Array.from(ngramSet);
    }
}

