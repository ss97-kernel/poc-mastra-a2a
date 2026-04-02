import { createStep, createWorkflow } from '@mastra/core/workflows';
import { Langfuse } from 'langfuse';
import { z } from 'zod';
import { initializeMCPClient } from '../../utils/mcpClient.js';

const AGENT_ID = process.env.AGENT_ID || 'web-search-agent-01';
const AGENT_NAME = process.env.AGENT_NAME || 'Web Search Agent';

export const WEB_SEARCH_TASK_WORKFLOW_ID = 'web-search-task-workflow';

export const searchTaskSchema = z.object({
  type: z.enum([
    'web-search',
    'news-search',
    'scholarly-search',
    'comprehensive-search',
  ]),
  query: z.string(),
  context: z.record(z.any()).optional(),
  options: z
    .object({
      maxResults: z.number().optional().default(10),
      language: z.string().optional().default('en'),
      region: z.string().optional().default('us'),
      timeRange: z
        .enum(['day', 'week', 'month', 'year', 'all'])
        .optional()
        .default('all'),
      category: z
        .enum(['general', 'news', 'images', 'videos', 'scholarly'])
        .optional()
        .default('general'),
      safesearch: z
        .enum(['strict', 'moderate', 'off'])
        .optional()
        .default('moderate'),
      sources: z
        .array(z.enum(['web', 'news', 'academic', 'reports']))
        .optional()
        .default(['web']),
    })
    .optional(),
});

export const webSearchTaskWorkflowInputSchema = searchTaskSchema.extend({
  taskId: z.string(),
  parentTraceId: z.string().optional(),
});

const webSearchTaskWorkflowEnvelopeSchema = z.tuple([
  webSearchTaskWorkflowInputSchema,
]);

const searchResultItemSchema = z.object({
  title: z.string(),
  url: z.string(),
  snippet: z.string(),
  publishedDate: z.string().optional(),
  source: z.string().optional(),
  relevanceScore: z.number().optional(),
});

export const searchExecutionResultSchema = z.object({
  query: z.string(),
  searchType: searchTaskSchema.shape.type,
  results: z.array(searchResultItemSchema),
  totalResults: z.number(),
  searchTime: z.number(),
});

export type SearchExecutionResult = z.infer<typeof searchExecutionResultSchema>;

export const langfuse = new Langfuse({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  baseUrl: process.env.LANGFUSE_BASEURL || 'https://cloud.langfuse.com',
});

function normalizeUserSearchQuery(query: string) {
  let normalized = query.trim().replace(/\s+/g, ' ');

  normalized = normalized.replace(
    /^(please\s+)?(find|search(?:\s+for)?|look\s+up|show\s+me|get\s+me|tell\s+me|research)\s+/i,
    ''
  );

  normalized = normalized.replace(
    /^(the\s+)?(latest|recent|current)\s+/i,
    ''
  );

  normalized = normalized.replace(
    /^(news|headlines|announcements?|updates?)\s+(about|on|for|regarding)\s+/i,
    ''
  );

  normalized = normalized.replace(
    /^(about|on|for|regarding)\s+/i,
    ''
  );

  normalized = normalized.replace(
    /^(recent|latest|current)\s+(news|headlines|announcements?|updates?)\s+(about|on|for|regarding)\s+/i,
    ''
  );

  normalized = normalized.replace(/[.?!]+$/g, '').trim();

  return normalized || query.trim();
}

const mcpSearchPayloadSchema = z.object({
  results: z.array(searchResultItemSchema),
  totalResults: z.number(),
  searchTime: z.number(),
});

export function buildSearchConfig(task: z.infer<typeof searchTaskSchema>) {
  const normalizedQuery = normalizeUserSearchQuery(task.query);
  let enhancedQuery = normalizedQuery;
  const originalOptions = task.options || {};
  let searchOptions: Record<string, unknown> = { ...originalOptions };

  switch (task.type) {
    case 'news-search':
      enhancedQuery = `latest news ${normalizedQuery}`;
      searchOptions = {
        ...searchOptions,
        timeRange: 'week',
        category: 'news',
      };
      break;

    case 'scholarly-search':
      enhancedQuery = `academic research ${normalizedQuery}`;
      searchOptions = {
        ...searchOptions,
        category: 'scholarly',
      };
      break;

    case 'comprehensive-search':
      searchOptions = {
        ...searchOptions,
        maxResults: Math.max(Number(searchOptions.maxResults) || 10, 15),
      };
      break;

    default:
      break;
  }

  return {
    enhancedQuery,
    searchOptions,
    count: Math.min(Number(searchOptions.maxResults) || 10, 20),
  };
}

export function buildSearchSummaryPrompt(
  task: z.infer<typeof searchTaskSchema>,
  searchResult: SearchExecutionResult
) {
  const serializedResults = JSON.stringify(
    {
      query: searchResult.query,
      totalResults: searchResult.totalResults,
      searchTime: searchResult.searchTime,
      results: searchResult.results,
    },
    null,
    2
  );

  return `
    You are summarizing Brave Search results for a ${task.type} request.

    User query: "${task.query}"
    Executed query: "${searchResult.query}"
    Total results collected: ${searchResult.totalResults}
    Search execution time (ms): ${searchResult.searchTime}

    Search results:
    ${serializedResults}

    Produce the following in English:
    1. A 3 to 5 sentence summary of the search results.
    2. Highlights of the most relevant information.
    3. A reliability assessment based on the sources returned.
    4. Suggested follow-up searches if needed.

    If the search failed or returned no useful results, explain that clearly and state the likely reason.
  `;
}

function unwrapSingle<T>(inputData: [T]): T {
  return inputData[0];
}

type MCPToolResult = {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
};

type SearchAttempt = {
  query: string;
  toolName: string;
};

function uniqueNonEmpty(values: string[]) {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

function simplifyQueryForFallback(query: string) {
  const stripped = query
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const removableTokens = new Set([
    'latest',
    'recent',
    'current',
    'news',
    'headline',
    'headlines',
    'announcement',
    'announcements',
    'update',
    'updates',
    'about',
    'regarding',
    'around',
    'find',
    'search',
    'lookup',
    'look',
    'show',
    'tell',
    'please',
  ]);

  const simplified = stripped
    .split(' ')
    .filter(token => {
      const normalized = token.toLowerCase();
      return normalized.length > 2 && !removableTokens.has(normalized);
    })
    .join(' ')
    .trim();

  return simplified || stripped;
}

function buildSearchAttempts(
  task: z.infer<typeof webSearchTaskWorkflowInputSchema>
): SearchAttempt[] {
  const { enhancedQuery } = buildSearchConfig(task);
  const normalizedQuery = normalizeUserSearchQuery(task.query);
  const simplifiedQuery = simplifyQueryForFallback(normalizedQuery);
  const defaultTool = getMcpToolNameForTask(task.type);
  const webTool = 'brave-search_brave_web_search';
  const newsTool = 'brave-search_brave_news_search';

  switch (task.type) {
    case 'news-search':
      return uniqueNonEmpty([
        enhancedQuery,
        normalizedQuery,
        simplifiedQuery,
        `latest ${simplifiedQuery}`,
      ]).flatMap(query => {
        if (query === enhancedQuery || query === normalizedQuery) {
          return [{ query, toolName: newsTool }];
        }

        return [
          { query, toolName: newsTool },
          { query, toolName: webTool },
        ];
      });

    case 'scholarly-search':
      return uniqueNonEmpty([
        enhancedQuery,
        normalizedQuery,
        simplifiedQuery,
      ]).map(query => ({
        query,
        toolName: webTool,
      }));

    case 'web-search':
    case 'comprehensive-search':
      return uniqueNonEmpty([
        enhancedQuery,
        normalizedQuery,
        simplifiedQuery,
      ]).map(query => ({
        query,
        toolName: defaultTool,
      }));

    default:
      return [{ query: enhancedQuery, toolName: defaultTool }];
  }
}

export function getMcpToolNameForTask(
  taskType: z.infer<typeof webSearchTaskWorkflowInputSchema>['type']
) {
  return taskType === 'news-search'
    ? 'brave-search_brave_news_search'
    : 'brave-search_brave_web_search';
}

export function parseMcpSearchResponse(
  result: MCPToolResult,
  task: z.infer<typeof webSearchTaskWorkflowInputSchema>,
  executedQuery: string
): SearchExecutionResult {
  const textPayload = result.content?.find(part => part.type === 'text')?.text;
  if (!textPayload) {
    throw new Error('MCP search tool did not return text content');
  }

  const parsedPayload = mcpSearchPayloadSchema.parse(JSON.parse(textPayload));

  return {
    query: executedQuery,
    searchType: task.type,
    totalResults: parsedPayload.totalResults,
    searchTime: parsedPayload.searchTime,
    results: parsedPayload.results,
  };
}

export async function performBraveSearch(
  task: z.infer<typeof webSearchTaskWorkflowInputSchema>
): Promise<SearchExecutionResult> {
  const { count } = buildSearchConfig(task);

  if (!process.env.BRAVE_SEARCH_API_KEY) {
    throw new Error('BRAVE_SEARCH_API_KEY environment variable is required');
  }

  const tools = await initializeMCPClient();
  const attempts = buildSearchAttempts(task);
  let lastResult: SearchExecutionResult | undefined;

  for (const attempt of attempts) {
    const tool = tools[attempt.toolName];

    if (!tool) {
      continue;
    }

    const result = await tool.execute(
      {
        query: attempt.query,
        count,
      },
      {
        context: {
          messages: [],
        },
      }
    );

    const parsed = parseMcpSearchResponse(
      result as MCPToolResult,
      task,
      attempt.query
    );

    lastResult = parsed;

    if (parsed.results.length > 0) {
      return parsed;
    }
  }

  if (lastResult) {
    return lastResult;
  }

  throw new Error('No MCP search tool was available for the requested task');
}

const performBraveSearchStep = createStep({
  id: 'perform-brave-search',
  description: 'Execute a Brave Search request for the current A2A search task.',
  inputSchema: webSearchTaskWorkflowEnvelopeSchema,
  outputSchema: searchExecutionResultSchema,
  execute: async ({ inputData }) => {
    const task = unwrapSingle(inputData);
    return performBraveSearch(task);
  },
});

export const webSearchTaskWorkflow = createWorkflow({
  id: WEB_SEARCH_TASK_WORKFLOW_ID,
  description: 'Governed workflow for A2A web search execution.',
  inputSchema: webSearchTaskWorkflowEnvelopeSchema,
  outputSchema: searchExecutionResultSchema,
})
  .then(performBraveSearchStep)
  .commit();
