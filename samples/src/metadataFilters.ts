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

import { HybridTM, Match, MetadataFilter, SearchResult, TranslationSearchFilters } from 'hybridtm';
import { XMLElement } from 'typesxml';
import { displayMatches, recreateInstance, resolveDataPath } from './support/demoEnvironment.js';

const INSTANCE_NAME: string = 'samples-filters';

async function main(): Promise<void> {
  const tm: HybridTM = recreateInstance(INSTANCE_NAME, 'filters-demo', HybridTM.QUALITY_MODEL);

  await tm.importXLIFF(resolveDataPath('demo.xlf'));
  await tm.importTMX(resolveDataPath('demo.tmx'));

  const sourceQuery: string = 'settings';
  const sourceLang: string = 'en';
  const sourceLimit: number = 5;
  const sourceFilters: MetadataFilter = {
    contextIncludes: ['ui.settings'],
    minState: 'translated'
  };
  console.log('semanticSearch params (source):', {
    query: sourceQuery,
    language: sourceLang,
    limit: sourceLimit,
    filters: sourceFilters
  });
  const sourceEntries: SearchResult[] = await tm.semanticSearch(sourceQuery, sourceLang, sourceLimit, sourceFilters);

  console.log('semanticSearch results (source):', JSON.stringify(sourceEntries, null, 2));

  const translationQuery: string = 'Save settings';
  const translationSource: string = 'en';
  const translationTarget: string = 'es';
  const translationMinScore: number = 40;
  const translationLimit: number = 5;
  const translationFilters: TranslationSearchFilters = {
    target: { states: ['reviewed', 'final'], provider: 'xliff' }
  };
  console.log('\nsemanticTranslationSearch params:', {
    query: translationQuery,
    sourceLang: translationSource,
    targetLang: translationTarget,
    minScore: translationMinScore,
    limit: translationLimit,
    filters: translationFilters
  });
  const matches: Match[] = await tm.semanticTranslationSearch(
    translationQuery,
    translationSource,
    translationTarget,
    translationMinScore,
    translationLimit,
    translationFilters
  );

  console.log('\nsemanticTranslationSearch results:');
  displayMatches(matches);

  const targetQuery: string = 'Save settings';
  const targetLang: string = 'es';
  const targetLimit: number = 3;
  const targetFilters: MetadataFilter = {
    contextIncludes: ['ui.settings'],
    minState: 'reviewed'
  };
  console.log('\nsemanticSearch params (target validation):', {
    query: targetQuery,
    language: targetLang,
    limit: targetLimit,
    filters: targetFilters
  });
  const targetEntries: SearchResult[] = await tm.semanticSearch(targetQuery, targetLang, targetLimit, targetFilters);
  console.log('semanticSearch results (target validation):', JSON.stringify(targetEntries, null, 2));

  const concordanceQuery: string = 'error';
  const concordanceLang: string = 'en';
  const concordanceLimit: number = 3;
  console.log('\nconcordanceSearch params:', {
    fragment: concordanceQuery,
    language: concordanceLang,
    limit: concordanceLimit
  });
  const concordance: Map<string, XMLElement>[] = await tm.concordanceSearch(concordanceQuery, concordanceLang, concordanceLimit);
  console.log('concordanceSearch results:');
  concordance.forEach((unitMap: Map<string, XMLElement>, unitIndex: number) => {
    console.log('Unit', unitIndex + 1);
    unitMap.forEach((element: XMLElement, lang: string) => {
      console.log('  •', lang, element.toString());
    });
  });

  await tm.close();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
