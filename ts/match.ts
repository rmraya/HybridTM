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

import { XMLElement } from "typesxml";

export class Match {

    source: XMLElement;
    target: XMLElement;
    origin: string;
    semantic: number;
    fuzzy: number;

    constructor(source: XMLElement, target: XMLElement, origin: string, semantic: number, fuzzy:number) {
        this.source = source;
        this.target = target;
        this.origin = origin;
        this.semantic = semantic;
        this.fuzzy = fuzzy;
    }

    toJSON(): any {
        return {
            source: this.source.toString(),
            target: this.target.toString(),
            origin: this.origin,
            semantic: this.semantic,
            fuzzy: this.fuzzy
        }
    }

    hybridScore(): number {
        return Math.round((this.semantic + this.fuzzy) / 2);
    }

}
