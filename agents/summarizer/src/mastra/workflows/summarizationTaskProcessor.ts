import { mastra } from '../index.js';
import {
  buildPrompt,
  langfuse,
  summarizeTaskSchema,
} from './summarizationTaskWorkflow.js';

const AGENT_ID = process.env.AGENT_ID || 'summarizer-agent-01';
const AGENT_NAME = process.env.AGENT_NAME || 'Summarizer Agent';

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

export async function processSummarizationTask(
  task: any,
  taskId: string,
  parentTraceId?: string
): Promise<any> {
  const validatedTask = summarizeTaskSchema.parse(task);
  const audienceType = validatedTask.audienceType || 'general';
  const trace = langfuse.trace({
    id: parentTraceId || undefined,
    name: 'summarization-task',
    metadata: {
      agent: AGENT_NAME,
      agentId: AGENT_ID,
      taskId,
      taskType: validatedTask.type,
    },
    tags: ['summarizer', 'summarization-task'],
  });

  trace.event({
    name: 'task-validated',
    metadata: {
      type: validatedTask.type,
      audienceType,
      dataSize: JSON.stringify(validatedTask.data).length,
      hasContext: !!validatedTask.context,
    },
  });

  const prompt = buildPrompt(validatedTask);
  const generation = trace.generation({
    name: 'summarization-llm-call',
    model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    input: [{ role: 'user', content: prompt }],
    metadata: {
      promptLength: prompt.length,
      summaryType: validatedTask.type,
      audienceType,
    },
  });

  try {
    const agent = mastra.getAgent(AGENT_ID);
    if (!agent) {
      throw new Error(`Agent ${AGENT_ID} not found`);
    }

    const result = await agent.generate([{ role: 'user', content: prompt }]);
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
      name: 'summarization-completed',
      metadata: {
        summaryLength: result.text.length,
        success: true,
        audienceType,
        processedBy: AGENT_ID,
        summaryType: validatedTask.type,
        originalDataSize: JSON.stringify(validatedTask.data).length,
        traceId: trace.id,
        ...(modelId ? { modelId } : {}),
      },
    });

    const artifactMetadata = {
      completedAt: new Date().toISOString(),
      summaryType: validatedTask.type,
      audienceType,
      traceId: trace.id,
      usage,
      ...(modelId ? { modelId } : {}),
    };

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
                text: result.text,
              },
            ],
          },
        },
        artifacts: [
          {
            type: 'summary-result',
            data: result.text,
            metadata: artifactMetadata,
          },
        ],
      },
    };
  } catch (error) {
    generation.end({
      output: {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    });

    trace.event({
      name: 'summarization-failed',
      metadata: {
        error: error instanceof Error ? error.message : 'Unknown error',
        errorType: error instanceof Error ? error.constructor.name : 'Unknown',
      },
    });

    throw error;
  }
}

export { langfuse };
