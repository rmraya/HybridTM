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

import { HybridTM, Match, Utils } from 'hybridtm';
import { XMLElement } from 'typesxml';
import { displayMatches, recreateInstance } from './support/demoEnvironment.js';

const INSTANCE_NAME: string = 'samples-basic';

async function main(): Promise<void> {
  const tm: HybridTM = recreateInstance(INSTANCE_NAME, 'basic-demo', HybridTM.QUALITY_MODEL);

  const sourceElement: XMLElement = Utils.buildXMLElement('<source>Hello world</source>');
  const targetElement: XMLElement = Utils.buildXMLElement('<target>Hola mundo</target>');

  await tm.storeLangEntry('demo-file', 'demo.xlf', 'unit1', 'en', 'Hello world', sourceElement, undefined, 1, 1, { state: 'final' });
  await tm.storeLangEntry('demo-file', 'demo.xlf', 'unit1', 'es', 'Hola mundo', targetElement, undefined, 1, 1, { state: 'final' });

  const queryText: string = 'Hi world';
  const sourceLang: string = 'en';
  const targetLang: string = 'es';
  const minScore: number = 40;
  const limit: number = 5;
  console.log('\nsemanticTranslationSearch params:\n', {
    query: queryText,
    sourceLang,
    targetLang,
    minScore,
    limit
  });
  const matches: Match[] = await tm.semanticTranslationSearch(queryText, sourceLang, targetLang, minScore, limit);
  console.log('\nsemanticTranslationSearch results:');
  displayMatches(matches);

  await tm.close();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
