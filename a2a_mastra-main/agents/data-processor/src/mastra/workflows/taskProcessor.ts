import { mastra } from '../index.js';
import {
  buildPrompt,
  langfuse,
  processTaskSchema,
} from './taskProcessorWorkflow.js';

const AGENT_ID = process.env.AGENT_ID || 'data-processor-agent-01';
const AGENT_NAME = process.env.AGENT_NAME || 'Data Processor Agent';

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

export async function processTask(task: any, taskId: string, parentTraceId?: string) {
  const validatedTask = processTaskSchema.parse(task);
  const trace = langfuse.trace({
    id: parentTraceId || undefined,
    name: 'data-processing-task',
    metadata: {
      agent: AGENT_NAME,
      agentId: AGENT_ID,
      taskId,
      taskType: validatedTask.type,
    },
    tags: ['data-processor', 'processing-task'],
  });

  trace.event({
    name: 'task-validated',
    metadata: {
      type: validatedTask.type,
      dataSize: JSON.stringify(validatedTask.data).length,
      hasContext: !!validatedTask.context,
    },
  });

  const prompt = buildPrompt(validatedTask);
  const generation = trace.generation({
    name: 'data-processing-llm-call',
    model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    input: [{ role: 'user', content: prompt }],
    metadata: {
      promptLength: prompt.length,
      processingType: validatedTask.type,
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

    const artifactMetadata = {
      completedAt: new Date().toISOString(),
      processingType: validatedTask.type,
      originalDataSize: JSON.stringify(validatedTask.data).length,
      traceId: trace.id,
      usage,
      ...(modelId ? { modelId } : {}),
    };

    const artifactData = {
      status: 'completed',
      processedBy: AGENT_ID,
      result: result.text,
      metadata: artifactMetadata,
    };

    trace.event({
      name: 'processing-completed',
      metadata: {
        resultSize: result.text.length,
        success: true,
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
                text: 'Data processing completed successfully',
              },
            ],
          },
        },
        artifacts: [
          {
            type: 'processing-result',
            data: artifactData,
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
      name: 'processing-failed',
      metadata: {
        error: error instanceof Error ? error.message : 'Unknown error',
        errorType: error instanceof Error ? error.constructor.name : 'Unknown',
      },
    });

    throw error;
  }
}

export { langfuse };
