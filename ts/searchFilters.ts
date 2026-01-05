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

import { TranslationState } from './importOptions.js';

export interface MetadataFilter {
    states?: TranslationState[];
    minState?: TranslationState;
    minQuality?: number;
    contextIncludes?: string[];
    requiredProperties?: Record<string, string>;
    provider?: string;
}

export interface TranslationSearchFilters {
    source?: MetadataFilter;
    target?: MetadataFilter;
}
