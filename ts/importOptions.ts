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

export type TranslationState = 'initial' | 'translated' | 'reviewed' | 'final';

export interface ImportOptions {
    minState?: TranslationState;
    skipEmpty?: boolean;
    skipUnconfirmed?: boolean;
    extractMetadata?: boolean;
}

export type ResolvedImportOptions = Required<ImportOptions>;

export const DEFAULT_IMPORT_OPTIONS: ResolvedImportOptions = {
    minState: 'translated',
    skipEmpty: true,
    skipUnconfirmed: true,
    extractMetadata: true
};

export function resolveImportOptions(options?: ImportOptions): ResolvedImportOptions {
    return {
        ...DEFAULT_IMPORT_OPTIONS,
        ...(options ?? {})
    };
}
