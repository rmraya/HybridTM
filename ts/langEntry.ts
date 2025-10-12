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

export interface LangEntry {
    id: string; // String ID for better LanceDB key compatibility
    language: string;
    pureText: string;
    element: string;
    fileId: string;
    original: string;
    unitId: string;
    vector: number[]; // Vector embeddings (384/512/768-dimensional based on model)
    [key: string]: any; // Index signature for LanceDB compatibility
}