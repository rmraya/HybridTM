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

import { HybridTM, Match } from 'hybridtm';
import { displayMatches, recreateInstance, resolveDataPath } from './support/demoEnvironment.js';

const INSTANCE_NAME: string = 'samples-import';

async function main(): Promise<void> {
  const tm: HybridTM = recreateInstance(INSTANCE_NAME, 'import-demo', HybridTM.SPEED_MODEL);

  await tm.importXLIFF(resolveDataPath('demo.xlf'));
  await tm.importTMX(resolveDataPath('demo.tmx'));

  const queryText: string = 'Sign in';
  const sourceLang: string = 'en';
  const targetLang: string = 'es';
  const minScore: number = 45;
  const limit: number = 5;
  console.log('semanticTranslationSearch params:', {
    query: queryText,
    sourceLang,
    targetLang,
    minScore,
    limit
  });
  const matches: Match[] = await tm.semanticTranslationSearch(queryText, sourceLang, targetLang, minScore, limit);
  console.log('semanticTranslationSearch results:');
  displayMatches(matches);

  await tm.close();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
