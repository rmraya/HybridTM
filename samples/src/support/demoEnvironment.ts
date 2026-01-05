/*** ***************************************************************************
 * Copyright (c) 2025-2026 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse   License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - sample scripts
 *************************************************************************** ***/

import path from 'node:path';
import { HybridTM, HybridTMFactory, Match } from 'hybridtm';

const SAMPLE_STORAGE_ROOT: string = path.resolve(process.cwd(), 'hybridtm-samples');

function removeIfExists(name: string): void {
  try {
    HybridTMFactory.removeInstance(name);
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('does not exist')) {
      return;
    }
    throw error;
  }
}

export function recreateInstance(name: string, subDir: string, modelName: string = HybridTM.QUALITY_MODEL): HybridTM {
  removeIfExists(name);
  const dbPath: string = path.join(SAMPLE_STORAGE_ROOT, subDir);
  console.log('Preparing instance "' + name + '" with model "' + modelName + '". The first run will download embeddings if they are not cached.');
  return HybridTMFactory.createInstance(name, dbPath, modelName);
}

export function resolveDataPath(fileName: string): string {
  return path.resolve(process.cwd(), 'data', fileName);
}

export function displayMatches(matches: Match[]): void {
  if (matches.length === 0) {
    console.log('No matches found.');
    return;
  }
  console.log(JSON.stringify(matches, null, 2));
}
