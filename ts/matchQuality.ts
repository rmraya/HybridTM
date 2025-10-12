/*******************************************************************************
 * Copyright (c) 2007 - 2025 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/

export class MatchQuality {
    
    private static readonly PENALTY = 2;

    /**
     * Finds the longest common substring between two strings using dynamic programming
     * @param x First string
     * @param y Second string
     * @returns The longest common substring
     */
    private static lcs(x: string, y: string): string {
        const m: number = x.length;
        const n: number = y.length;
        let max: number = 0;
        let mx: number = 0;

        // opt[i][j] = length of LCS of x[i..M] and y[j..N]
        const opt: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

        // fill the matrix
        for (let i: number = 1; i <= m; i++) {
            for (let j: number = 1; j <= n; j++) {
                if (x.charAt(i - 1) === y.charAt(j - 1)) {
                    opt[i][j] = opt[i - 1][j - 1] + 1;
                    if (opt[i][j] > max) {
                        // remember where the maximum length is
                        max = opt[i][j];
                        mx = i;
                    }
                } else {
                    opt[i][j] = 0;
                }
            }
        }

        // recover the LCS
        let result: string = '';
        while (max > 0) {
            result = x.charAt(mx - 1) + result;
            max--;
            mx--;
        }
        return result;
    }

    /**
     * Calculates the similarity between two strings using LCS algorithm with penalties
     * @param x First string to compare
     * @param y Second string to compare
     * @returns Similarity percentage (0-100)
     */
    public static similarity(x: string, y: string): number {
        let result: number = 0;
        x = x.trim();
        y = y.trim();
        const longest: number = Math.max(x.length, y.length);
        
        if (longest === 0) {
            return 0;
        }

        let a: string;
        let b: string;
        if (x.length === longest) {
            a = x;
            b = y;
        } else {
            a = y;
            b = x;
        }

        // a is the longest string
        let count: number = -1;
        let idx: number;
        let lcs: string = MatchQuality.lcs(a, b);
        
        while (lcs.trim().length > 0 && lcs.length > longest * MatchQuality.PENALTY / 100) {
            count++;
            idx = a.indexOf(lcs);
            a = a.substring(0, idx) + a.substring(idx + lcs.length);
            idx = b.indexOf(lcs);
            b = b.substring(0, idx) + b.substring(idx + lcs.length);
            lcs = MatchQuality.lcs(a, b);
        }
        
        result = 100 * (longest - a.length) / longest - count * MatchQuality.PENALTY;
        if (result < 0) {
            result = 0;
        }
        
        return Math.round(result);
    }
}