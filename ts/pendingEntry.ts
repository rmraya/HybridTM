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

import { XMLElement } from "typesxml";
import { EntryMetadata } from './langEntry.js';


export interface PendingEntry {
    fileId: string;
    original: string;
    unitId: string;
    language: string;
    pureText: string;
    element: XMLElement;
    segmentIndex: number;
    segmentCount: number;
    metadata: EntryMetadata;
}