import { createStep, createWorkflow } from '@mastra/core/workflows';
import { Langfuse } from 'langfuse';
import { z } from 'zod';

const AGENT_ID = process.env.AGENT_ID || 'data-processor-agent-01';
const AGENT_NAME = process.env.AGENT_NAME || 'Data Processor Agent';

export const DATA_PROCESSOR_TASK_WORKFLOW_ID =
  'data-processor-task-workflow';

export const processTaskSchema = z.object({
  type: z.enum(['process', 'analyze', 'research-analysis']),
  data: z.any(),
  context: z.record(z.any()).optional(),
  options: z
    .object({
      analyzePatterns: z.boolean().optional(),
      extractInsights: z.boolean().optional(),
      depth: z.enum(['basic', 'comprehensive', 'expert']).optional(),
    })
    .optional(),
});

export const dataProcessingTaskWorkflowInputSchema = processTaskSchema.extend({
  taskId: z.string(),
  parentTraceId: z.string().optional(),
});

export const langfuse = new Langfuse({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  baseUrl: process.env.LANGFUSE_BASEURL || 'https://cloud.langfuse.com',
});

export function buildPrompt(task: z.infer<typeof processTaskSchema>): string {
  switch (task.type) {
    case 'process':
      return `
        Process and analyze the following data:
        ${JSON.stringify(task.data, null, 2)}

        Please:
        1. Identify the data structure and format.
        2. Clean and normalize inconsistencies.
        3. Extract key patterns and insights.
        4. Provide a summary of the findings.
        5. Return the processed data in a structured format.

        Context: ${task.context ? JSON.stringify(task.context) : 'Not provided'}

        Respond in English.
      `;

    case 'analyze':
      return `
        Perform a detailed analysis of the following data:
        ${JSON.stringify(task.data, null, 2)}

        Please:
        1. Identify trends, patterns, and outliers.
        2. Calculate relevant statistics when appropriate.
        3. Provide insights and recommendations.
        4. Highlight potential data quality issues.
        5. Suggest next steps for further processing.

        Context: ${task.context ? JSON.stringify(task.context) : 'Not provided'}

        Respond in English.
      `;

    case 'research-analysis': {
      const depth = task.options?.depth || 'comprehensive';
      const shouldAnalyzePatterns = task.options?.analyzePatterns !== false;
      const shouldExtractInsights = task.options?.extractInsights !== false;

      return `
        This dataset is intended for research. Perform a detailed research analysis:
        ${JSON.stringify(task.data, null, 2)}

        Analysis depth: ${depth}
        Pattern analysis: ${shouldAnalyzePatterns ? 'Include it' : 'Skip it'}
        Insight extraction: ${shouldExtractInsights ? 'Include it' : 'Skip it'}

        Please:
        1. Assess the data sources and reliability.
        2. Apply a structured analytical framework.
        ${shouldAnalyzePatterns ? '3. Identify deeper patterns and correlations.' : ''}
        ${shouldExtractInsights ? '4. Extract strategic insights and implications.' : ''}
        5. Evaluate the evidence against the research questions or hypotheses.
        6. Identify limitations and potential bias.
        7. Propose directions for further research.
        8. Provide practical implications and recommendations.

        Context: ${task.context ? JSON.stringify(task.context) : 'Not provided'}

        Return the analysis using this structure:
        - Data overview
        - Key findings
        - Patterns and trends
        - Insights and implications
        - Limitations
        - Recommendations

        Respond in English.
      `;
    }
  }
}

const executeDataProcessingTaskStep = createStep({
  id: 'execute-data-processing-task',
  description: 'Run the data processor agent against the requested task.',
  inputSchema: dataProcessingTaskWorkflowInputSchema,
  outputSchema: z.any(),
  execute: async ({ mastra, inputData }) => {
    const trace = langfuse.trace({
      id: inputData.parentTraceId || undefined,
      name: 'data-processing-task',
      metadata: {
        agent: AGENT_NAME,
        agentId: AGENT_ID,
        taskId: inputData.taskId,
        taskType: inputData.type,
      },
      tags: ['data-processor', 'processing-task'],
    });

    trace.event({
      name: 'task-validated',
      metadata: {
        type: inputData.type,
        dataSize: JSON.stringify(inputData.data).length,
        hasContext: !!inputData.context,
      },
    });

    const prompt = buildPrompt(inputData);
    const generation = trace.generation({
      name: 'data-processing-llm-call',
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      input: [{ role: 'user', content: prompt }],
      metadata: {
        promptLength: prompt.length,
        processingType: inputData.type,
      },
    });

    try {
      const agent = mastra.getAgent(AGENT_ID);
      if (!agent) {
        throw new Error(`Agent ${AGENT_ID} not found`);
      }

      const result = await agent.generate([{ role: 'user', content: prompt }]);

      generation.end({
        output: result.text,
        metadata: {
          responseLength: result.text.length,
          usage: result.usage || {},
        },
      });

      const artifactData = {
        status: 'completed',
        processedBy: AGENT_ID,
        result: result.text,
        metadata: {
          completedAt: new Date().toISOString(),
          processingType: inputData.type,
          originalDataSize: JSON.stringify(inputData.data).length,
          traceId: trace.id,
          usage: result.usage || {},
        },
      };

      trace.event({
        name: 'processing-completed',
        metadata: {
          resultSize: result.text.length,
          success: true,
        },
      });

      return {
        task: {
          id: inputData.taskId,
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
              metadata: artifactData.metadata,
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
  },
});

export const dataProcessingTaskWorkflow = createWorkflow({
  id: DATA_PROCESSOR_TASK_WORKFLOW_ID,
  description: 'Governed workflow for A2A data processing tasks.',
  inputSchema: dataProcessingTaskWorkflowInputSchema,
  outputSchema: z.any(),
})
  .then(executeDataProcessingTaskStep)
  .commit();
