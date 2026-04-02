import { mastra } from '../index.js';
import {
  buildSearchSummaryPrompt,
  buildSearchConfig,
  langfuse,
  searchExecutionResultSchema,
  searchTaskSchema,
  WEB_SEARCH_TASK_WORKFLOW_ID,
  webSearchTaskWorkflowInputSchema,
} from './searchTaskWorkflow.js';
import type { z } from 'zod';

const AGENT_ID = process.env.AGENT_ID || 'web-search-agent-01';
const AGENT_NAME = process.env.AGENT_NAME || 'Web Search Agent';

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

function buildSearchPrompt(task: z.infer<typeof searchTaskSchema>) {
  const { enhancedQuery } = buildSearchConfig(task);

  return {
    enhancedQuery,
    searchPrompt: '',
  };
}

async function executeSearchWorkflow(
  task: z.infer<typeof searchTaskSchema>,
  taskId: string,
  parentTraceId?: string
) {
  const workflow = mastra.getWorkflow(WEB_SEARCH_TASK_WORKFLOW_ID);

  if (!workflow) {
    throw new Error(`Workflow ${WEB_SEARCH_TASK_WORKFLOW_ID} is not registered`);
  }

  const run = await workflow.createRun();
  const workflowInput = webSearchTaskWorkflowInputSchema.parse({
    ...task,
    taskId,
    parentTraceId,
  });
  const result = await run.start({
    inputData: [workflowInput],
  });

  if ('status' in result && result.status !== 'success') {
    throw new Error(
      `Web search workflow ${WEB_SEARCH_TASK_WORKFLOW_ID} failed with status ${result.status}`
    );
  }

  return searchExecutionResultSchema.parse(
    'result' in result ? result.result : result
  );
}

// Helper function to process search tasks
export async function processSearchTask(
  task: any,
  taskId: string,
  _webSearchAgent?: unknown,
  parentTraceId?: string
) {
  const validatedTask = searchTaskSchema.parse(task);
  const trace = langfuse.trace({
    id: parentTraceId || undefined,
    name: 'web-search-task',
    metadata: {
      agent: AGENT_NAME,
      agentId: AGENT_ID,
      taskId,
      taskType: validatedTask.type,
    },
    tags: ['web-search', 'search-task'],
  });

  const { enhancedQuery } = buildSearchPrompt(validatedTask);

  trace.event({
    name: 'task-validated',
    metadata: {
      type: validatedTask.type,
      query: validatedTask.query,
      hasContext: !!validatedTask.context,
      maxResults: validatedTask.options?.maxResults || 10,
    },
  });

  const generation = trace.generation({
    name: 'web-search-execution',
    model: 'web-search-api',
    input: {
      query: enhancedQuery,
      options: validatedTask.options || {},
    },
    metadata: {
      searchType: validatedTask.type,
      queryLength: enhancedQuery.length,
    },
  });

  try {
    const searchResult = await executeSearchWorkflow(
      validatedTask,
      taskId,
      parentTraceId
    );
    const searchPrompt = buildSearchSummaryPrompt(validatedTask, searchResult);

    const agent = mastra.getAgent(AGENT_ID);
    if (!agent) {
      throw new Error(`Agent ${AGENT_ID} not found`);
    }

    const result = await agent.generate([
      {
        role: 'user',
        content: searchPrompt,
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
        id: taskId,
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
              searchType: validatedTask.type,
              traceId: trace.id,
              searchProvider: 'Brave Search API via MCP',
              usage,
              ...(modelId ? { modelId } : {}),
            },
          },
        ],
      },
    };
  } catch (error) {
    trace.event({
      name: 'search-failed',
      metadata: {
        error: error instanceof Error ? error.message : 'Unknown error',
        errorType: error instanceof Error ? error.constructor.name : 'Unknown',
      },
    });

    throw error;
  }
}

export { langfuse };
