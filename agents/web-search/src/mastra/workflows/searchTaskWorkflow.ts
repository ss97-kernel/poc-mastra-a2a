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

const mcpSearchPayloadSchema = z.object({
  results: z.array(searchResultItemSchema),
  totalResults: z.number(),
  searchTime: z.number(),
});

export function buildSearchConfig(task: z.infer<typeof searchTaskSchema>) {
  let enhancedQuery = task.query;
  const originalOptions = task.options || {};
  let searchOptions: Record<string, unknown> = { ...originalOptions };

  switch (task.type) {
    case 'news-search':
      enhancedQuery = `latest news ${task.query}`;
      searchOptions = {
        ...searchOptions,
        timeRange: 'week',
        category: 'news',
      };
      break;

    case 'scholarly-search':
      enhancedQuery = `academic research ${task.query}`;
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
  const { enhancedQuery, count } = buildSearchConfig(task);

  if (!process.env.BRAVE_SEARCH_API_KEY) {
    throw new Error('BRAVE_SEARCH_API_KEY environment variable is required');
  }

  const tools = await initializeMCPClient();
  const toolName = getMcpToolNameForTask(task.type);
  const tool = tools[toolName];

  if (!tool) {
    throw new Error(`MCP tool ${toolName} is not available`);
  }

  const result = await tool.execute(
    {
      query: enhancedQuery.trim(),
      count,
    },
    {
      context: {
        messages: [],
      },
    }
  );

  return parseMcpSearchResponse(result as MCPToolResult, task, enhancedQuery);
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
