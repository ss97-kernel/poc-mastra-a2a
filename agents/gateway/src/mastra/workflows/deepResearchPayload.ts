type SourceHighlight = {
  title: string;
  url: string;
  source?: string;
  publishedDate?: string;
  snippet?: string;
};

export type ResearchSynthesisPayload = {
  topic: string;
  searchSummary: string;
  analysisSummary: string;
  sourceHighlights: SourceHighlight[];
  researchMetadata: {
    searchQuery?: string;
    searchType?: string;
    totalResults?: number;
    searchTime?: number;
    analysisProcessingType?: string;
  };
};

const MAX_SOURCE_COUNT = 8;
const MAX_SUMMARY_LENGTH = 8_000;
const MAX_ANALYSIS_LENGTH = 12_000;
const MAX_SNIPPET_LENGTH = 280;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function toText(value: unknown, maxLength: number): string {
  if (typeof value === 'string') {
    return truncateText(value, maxLength);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return truncateText(JSON.stringify(value, null, 2), maxLength);
  }

  if (isRecord(value)) {
    for (const key of ['result', 'summary', 'executiveSummary', 'text']) {
      if (typeof value[key] === 'string') {
        return truncateText(value[key] as string, maxLength);
      }
    }

    return truncateText(JSON.stringify(value, null, 2), maxLength);
  }

  if (value == null) {
    return '';
  }

  return truncateText(String(value), maxLength);
}

function extractSourceHighlights(searchResult: unknown): SourceHighlight[] {
  if (!isRecord(searchResult)) {
    return [];
  }

  const rawResults = isRecord(searchResult.rawResults)
    ? (searchResult.rawResults as Record<string, unknown>)
    : isRecord(searchResult.fullResponse)
      ? (searchResult.fullResponse as Record<string, unknown>)
      : null;

  const results = rawResults?.results;
  if (!Array.isArray(results)) {
    return [];
  }

  const highlights: Array<SourceHighlight | null> = results
    .filter(isRecord)
    .map(item => {
      const title = typeof item.title === 'string' ? item.title.trim() : '';
      const url = typeof item.url === 'string' ? item.url.trim() : '';

      if (!title || !url) {
        return null;
      }

      return {
        title,
        url,
        source: typeof item.source === 'string' ? item.source : undefined,
        publishedDate:
          typeof item.publishedDate === 'string' ? item.publishedDate : undefined,
        snippet:
          typeof item.snippet === 'string'
            ? truncateText(item.snippet, MAX_SNIPPET_LENGTH)
            : undefined,
      };
    })
    .slice(0, MAX_SOURCE_COUNT);

  return highlights.filter(
    (item): item is SourceHighlight => item !== null
  );
}

export function buildResearchSynthesisPayload(input: {
  topic: string;
  searchResult: unknown;
  analysisResult: unknown;
}): ResearchSynthesisPayload {
  const { topic, searchResult, analysisResult } = input;
  const searchRecord = isRecord(searchResult)
    ? (searchResult as Record<string, unknown>)
    : {};
  const analysisRecord = isRecord(analysisResult)
    ? (analysisResult as Record<string, unknown>)
    : {};
  const rawResults = isRecord(searchRecord.rawResults)
    ? (searchRecord.rawResults as Record<string, unknown>)
    : undefined;
  const analysisMetadata = isRecord(analysisRecord.metadata)
    ? (analysisRecord.metadata as Record<string, unknown>)
    : undefined;

  return {
    topic,
    searchSummary: toText(
      searchRecord.searchResults ?? searchResult,
      MAX_SUMMARY_LENGTH
    ),
    analysisSummary: toText(
      analysisRecord.result ?? analysisResult,
      MAX_ANALYSIS_LENGTH
    ),
    sourceHighlights: extractSourceHighlights(searchResult),
    researchMetadata: {
      searchQuery:
        typeof searchRecord.query === 'string' ? searchRecord.query : undefined,
      searchType:
        typeof rawResults?.searchType === 'string'
          ? rawResults.searchType
          : undefined,
      totalResults:
        typeof rawResults?.totalResults === 'number'
          ? rawResults.totalResults
          : undefined,
      searchTime:
        typeof rawResults?.searchTime === 'number'
          ? rawResults.searchTime
          : undefined,
      analysisProcessingType:
        typeof analysisMetadata?.processingType === 'string'
          ? analysisMetadata.processingType
          : undefined,
    },
  };
}
