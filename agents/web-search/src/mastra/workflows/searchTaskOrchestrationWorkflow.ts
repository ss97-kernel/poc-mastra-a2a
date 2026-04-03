import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import {
  buildSearchSummaryPrompt,
  langfuse,
  performBraveSearch,
  searchExecutionResultSchema,
  webSearchTaskWorkflowInputSchema,
} from './searchTaskWorkflow.js';

const AGENT_ID = process.env.AGENT_ID || 'web-search-agent-01';
const AGENT_NAME = process.env.AGENT_NAME || 'Web Search Agent';

export const WEB_SEARCH_ORCHESTRATION_WORKFLOW_ID =
  'web-search-orchestration-workflow';

function extractModelId(result: unknown): string | undefined {
  if (!result || typeof result !== 'object') {
    return undefined;
  }

  const response = (result as Record<string, unknown>).response;
  if (!response || typeof response !== 'object') {
    return undefined;
  }

  return typeof (response as Record<string, unknown>).modelId === 'string'
    ? ((response as Record<string, unknown>).modelId as string)
    : undefined;
}

const searchResultEnvelopeSchema = z.tuple([searchExecutionResultSchema]);
const webSearchTaskWorkflowEnvelopeSchema = z.tuple([
  webSearchTaskWorkflowInputSchema,
]);

function unwrapSingle<T>(inputData: [T]): T {
  return inputData[0];
}

const executeSearchStep = createStep({
  id: 'execute-search-task',
  description: 'Execute the Brave MCP search for the current web search task.',
  inputSchema: webSearchTaskWorkflowEnvelopeSchema,
  outputSchema: searchResultEnvelopeSchema,
  execute: async ({ inputData }) => {
    const task = unwrapSingle(inputData);
    const searchResult = await performBraveSearch(task);
    return [searchResult] as [z.infer<typeof searchExecutionResultSchema>];
  },
});

const summarizeSearchResultsStep = createStep({
  id: 'summarize-search-results',
  description: 'Summarize MCP search results with the governed web search agent.',
  inputSchema: searchResultEnvelopeSchema,
  outputSchema: z.any(),
  execute: async ({ mastra, inputData, getInitData }) => {
    const searchResult = inputData[0];
    const task = unwrapSingle(
      getInitData<z.infer<typeof webSearchTaskWorkflowEnvelopeSchema>>()
    );
    const trace = langfuse.trace({
      id: task.parentTraceId || undefined,
      name: 'web-search-task',
      metadata: {
        agent: AGENT_NAME,
        agentId: AGENT_ID,
        taskId: task.taskId,
        taskType: task.type,
      },
      tags: ['web-search', 'search-task'],
    });

    trace.event({
      name: 'task-validated',
      metadata: {
        type: task.type,
        query: task.query,
        hasContext: !!task.context,
        maxResults: task.options?.maxResults || 10,
      },
    });

    const generation = trace.generation({
      name: 'web-search-execution',
      model: 'web-search-api',
      input: {
        query: searchResult.query,
        options: task.options || {},
      },
      metadata: {
        searchType: task.type,
        queryLength: searchResult.query.length,
      },
    });

    const agent = mastra.getAgent(AGENT_ID);
    if (!agent) {
      throw new Error(`Agent ${AGENT_ID} not found`);
    }

    const result = await agent.generate([
      {
        role: 'user',
        content: buildSearchSummaryPrompt(task, searchResult),
      },
    ]);
    const usage = result.usage || {};
    const modelId = extractModelId(result);

    generation.end({
      output: result.text,
      metadata: {
        responseLength: result.text.length,
        usage,
        ...(modelId ? { modelId } : {}),
      },
    });

    trace.event({
      name: 'search-completed',
      metadata: {
        success: true,
        responseLength: result.text.length,
        usage,
        ...(modelId ? { modelId } : {}),
      },
    });

    return {
      task: {
        id: task.taskId,
        status: {
          state: 'completed',
          timestamp: new Date().toISOString(),
          message: {
            role: 'agent',
            parts: [
              {
                type: 'text',
                text: 'Web search completed successfully',
              },
            ],
          },
        },
        artifacts: [
          {
            type: 'search-result',
            data: {
              query: searchResult.query,
              rawResults: searchResult,
              summary: result.text,
            },
            metadata: {
              completedAt: new Date().toISOString(),
              searchType: task.type,
              traceId: trace.id,
              searchProvider: 'Brave Search API via MCP',
              usage,
              ...(modelId ? { modelId } : {}),
            },
          },
        ],
      },
    };
  },
});

export const webSearchOrchestrationWorkflow = createWorkflow({
  id: WEB_SEARCH_ORCHESTRATION_WORKFLOW_ID,
  description: 'Governed workflow for A2A web search and summarization tasks.',
  inputSchema: webSearchTaskWorkflowEnvelopeSchema,
  outputSchema: z.any(),
})
  .then(executeSearchStep)
  .then(summarizeSearchResultsStep)
  .commit();
