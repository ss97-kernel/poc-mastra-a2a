import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '..');

const mastraIndexes = [
  'agents/gateway/src/mastra/index.ts',
  'agents/data-processor/src/mastra/index.ts',
  'agents/summarizer/src/mastra/index.ts',
  'agents/web-search/src/mastra/index.ts',
];

describe('OpenBox ignored URL wiring', () => {
  it.each(mastraIndexes)(
    'passes ignoredUrls into withOpenBox in %s',
    indexPath => {
      const source = readFileSync(resolve(REPO_ROOT, indexPath), 'utf8');

      expect(source).toContain('ignoredUrls: resolveIgnoredUrls()');
    }
  );

  it('ignores the OpenAI base URL in every governed runtime', () => {
    const sources = mastraIndexes.map(indexPath =>
      readFileSync(resolve(REPO_ROOT, indexPath), 'utf8')
    );

    for (const source of sources) {
      expect(source).toContain(
        "process.env.OPENAI_BASE_URL || 'https://api.openai.com'"
      );
    }
  });

  it('ignores internal A2A transport URLs in the gateway runtime', () => {
    const source = readFileSync(
      resolve(REPO_ROOT, 'agents/gateway/src/mastra/index.ts'),
      'utf8'
    );

    expect(source).toContain('process.env.DATA_PROCESSOR_URL');
    expect(source).toContain('process.env.SUMMARIZER_URL');
    expect(source).toContain('process.env.WEB_SEARCH_URL');
  });
});
