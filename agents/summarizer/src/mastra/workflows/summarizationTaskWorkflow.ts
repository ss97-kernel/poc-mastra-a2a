import { createStep, createWorkflow } from '@mastra/core/workflows';
import { Langfuse } from 'langfuse';
import { z } from 'zod';

const AGENT_ID = process.env.AGENT_ID || 'summarizer-agent-01';
const AGENT_NAME = process.env.AGENT_NAME || 'Summarizer Agent';

export const SUMMARIZER_TASK_WORKFLOW_ID = 'summarizer-task-workflow';

export const summarizeTaskSchema = z.object({
  type: z.enum([
    'summarize',
    'executive-summary',
    'brief',
    'research-synthesis',
    'comprehensive',
  ]),
  data: z.any(),
  context: z.record(z.any()).optional(),
  audienceType: z.enum(['technical', 'executive', 'general']).optional(),
  options: z
    .object({
      reportType: z.enum(['brief', 'comprehensive', 'detailed']).optional(),
      includeRecommendations: z.boolean().optional(),
      includeSources: z.boolean().optional(),
    })
    .optional(),
});

export const summarizationTaskWorkflowInputSchema = summarizeTaskSchema.extend({
  taskId: z.string(),
  parentTraceId: z.string().optional(),
});
const summarizationTaskWorkflowEnvelopeSchema = z.tuple([
  summarizationTaskWorkflowInputSchema,
]);

export const langfuse = new Langfuse({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  baseUrl: process.env.LANGFUSE_BASEURL || 'https://cloud.langfuse.com',
});

function unwrapSingle<T>(inputData: [T]): T {
  return inputData[0];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

type ResearchSourceHighlight = {
  title: string;
  url: string;
  source?: string;
  publishedDate?: string;
  snippet?: string;
};

function isResearchSourceHighlight(value: unknown): value is ResearchSourceHighlight {
  return (
    isRecord(value) &&
    typeof value.title === 'string' &&
    typeof value.url === 'string'
  );
}

function formatSourceHighlights(sourceHighlights: unknown): string {
  if (!Array.isArray(sourceHighlights) || sourceHighlights.length === 0) {
    return 'No source list was provided.';
  }

  const lines = sourceHighlights
    .filter(isResearchSourceHighlight)
    .map((source, index) => {
      const detailParts = [
        source.source ? `source: ${source.source}` : null,
        source.publishedDate ? `published: ${source.publishedDate}` : null,
      ].filter(Boolean);

      const details =
        detailParts.length > 0 ? ` (${detailParts.join(', ')})` : '';
      const snippet = source.snippet ? `\n   Snippet: ${source.snippet}` : '';

      return `${index + 1}. ${source.title}${details}\n   URL: ${source.url}${snippet}`;
    });

  return lines.length > 0
    ? lines.join('\n')
    : 'No source list was provided.';
}

function buildCompactResearchSynthesisPrompt(
  task: z.infer<typeof summarizeTaskSchema>,
  data: Record<string, unknown>
): string {
  const reportType = task.options?.reportType || 'comprehensive';
  const includeRecommendations = task.options?.includeRecommendations !== false;
  const includeSources = task.options?.includeSources !== false;
  const topic = typeof data.topic === 'string' ? data.topic : 'Unknown Topic';
  const searchSummary =
    typeof data.searchSummary === 'string'
      ? data.searchSummary
      : JSON.stringify(data.searchSummary ?? '', null, 2);
  const analysisSummary =
    typeof data.analysisSummary === 'string'
      ? data.analysisSummary
      : JSON.stringify(data.analysisSummary ?? '', null, 2);
  const researchMetadata = isRecord(data.researchMetadata)
    ? JSON.stringify(data.researchMetadata, null, 2)
    : 'Not provided';

  return `
        Synthesize the following research data into a comprehensive research report:

        Research topic: ${topic}

        Search summary:
        ${searchSummary}

        Analysis summary:
        ${analysisSummary}

        Key sources:
        ${formatSourceHighlights(data.sourceHighlights)}

        Research metadata:
        ${researchMetadata}

        Report type: ${reportType}
        Include recommendations: ${includeRecommendations ? 'Yes' : 'No'}
        Include sources: ${includeSources ? 'Yes' : 'No'}
        Target audience: ${task.audienceType || 'general'}

        Structure the report as follows:

        1. Executive summary
           - Research objective and scope
           - Key findings (3 to 5 points)
           - Main conclusions

        2. Key findings
           - Main trends identified from the research
           - Patterns and insights revealed by the analysis
           - Important statistics and data points

        3. Detailed analysis
           - Assessment of data quality and reliability
           - Trend analysis and correlations
           - Outliers or notable events

        ${includeRecommendations ? `4. Recommendations and implications
           - Strategic recommendations
           - Next steps for implementation
           - Potential risks and opportunities` : ''}

        ${includeSources ? `5. Information sources
           - Overview of key sources
           - Source reliability assessment
           - Citations or source attributions where relevant` : ''}

        6. Limitations and future research
           - Current limitations
           - Areas that require further investigation

        Context: ${task.context ? JSON.stringify(task.context) : 'Not provided'}

        Use the appropriate level of detail and terminology for a ${task.audienceType || 'general'} audience.
        Respond in English.
      `;
}

export function buildPrompt(task: z.infer<typeof summarizeTaskSchema>): string {
  const audienceType = task.audienceType || 'general';

  switch (task.type) {
    case 'summarize':
      return `
        Create a comprehensive summary of the following data and analysis:
        ${JSON.stringify(task.data, null, 2)}

        Please provide:
        1. A clear overview of the main findings.
        2. The most important insights and patterns.
        3. Significant statistics or metrics.
        4. The likely impact of the findings.
        5. Recommended next steps or actions.

        Target audience: ${audienceType}
        Context: ${task.context ? JSON.stringify(task.context) : 'Not provided'}

        Format the summary clearly and structurally for a ${audienceType} audience.
        Respond in English.
      `;

    case 'executive-summary':
      return `
        Create an executive summary of the following data and analysis:
        ${JSON.stringify(task.data, null, 2)}

        Please provide:
        1. A high-level overview in 2 to 3 sentences.
        2. The main business impact.
        3. Important metrics or KPIs.
        4. Strategic recommendations.
        5. Risks or considerations.

        Keep it concise and business-focused. Maximum 200 words.
        Context: ${task.context ? JSON.stringify(task.context) : 'Not provided'}

        Respond in English.
      `;

    case 'brief':
      return `
        Create a concise summary of the following data and analysis:
        ${JSON.stringify(task.data, null, 2)}

        Please provide:
        1. A one-sentence overview.
        2. The top 3 key findings.
        3. The primary recommendation.

        Keep it very brief. Maximum 100 words.
        Context: ${task.context ? JSON.stringify(task.context) : 'Not provided'}

        Respond in English.
      `;

    case 'research-synthesis': {
      const reportType = task.options?.reportType || 'comprehensive';
      const includeRecommendations = task.options?.includeRecommendations !== false;
      const includeSources = task.options?.includeSources !== false;
      if (
        isRecord(task.data) &&
        ('searchSummary' in task.data ||
          'analysisSummary' in task.data ||
          'sourceHighlights' in task.data)
      ) {
        return buildCompactResearchSynthesisPrompt(task, task.data);
      }
      const searchResults = task.data.searchResults || {};
      const analysisResults = task.data.analysisResults || {};
      const topic = task.data.topic || 'Unknown Topic';

      return `
        Synthesize the following research data into a comprehensive research report:

        Research topic: ${topic}

        Search result data:
        ${JSON.stringify(searchResults, null, 2)}

        Analysis result data:
        ${JSON.stringify(analysisResults, null, 2)}

        Report type: ${reportType}
        Include recommendations: ${includeRecommendations ? 'Yes' : 'No'}
        Include sources: ${includeSources ? 'Yes' : 'No'}
        Target audience: ${audienceType}

        Structure the report as follows:

        1. Executive summary
           - Research objective and scope
           - Key findings (3 to 5 points)
           - Main conclusions

        2. Key findings
           - Main trends identified from search results
           - Patterns and insights revealed by the analysis
           - Important statistics and data points

        3. Detailed analysis
           - Assessment of data quality and reliability
           - Trend analysis and correlations
           - Outliers or notable events

        ${includeRecommendations ? `4. Recommendations and implications
           - Strategic recommendations
           - Next steps for implementation
           - Potential risks and opportunities` : ''}

        ${includeSources ? `5. Information sources
           - Overview of key sources
           - Source reliability assessment` : ''}

        6. Limitations and future research
           - Current limitations
           - Areas that require further investigation

        Context: ${task.context ? JSON.stringify(task.context) : 'Not provided'}

        Use the appropriate level of detail and terminology for a ${audienceType} audience.
        Respond in English.
      `;
    }

    case 'comprehensive':
      return `
        Create a detailed and comprehensive summary of the following data and analysis:
        ${JSON.stringify(task.data, null, 2)}

        Create the report using this structure:

        1. Executive summary
           - Project overview and objective
           - Key findings (5 to 7 points)
           - Major conclusions and implications

        2. Detailed analysis
           - Assessment of data quality and coverage
           - Detailed analysis of identified patterns and trends
           - Interpretation of statistical findings and numerical data
           - Detailed review of outliers and notable events

        3. Deeper insights and implications
           - Strategic insights derived from the data
           - Potential business or technical impact
           - Long-term trends and forecasts
           - Detailed analysis of risks and opportunities

        4. Actionable recommendations
           - Short-term improvements
           - Medium and long-term strategic recommendations
           - Implementation roadmap
           - Success metrics and measurement approach

        5. Limitations and future research
           - Limitations of the current analysis
           - Identified data gaps
           - Areas that require further investigation
           - Recommended additional data collection

        Target audience: ${audienceType}
        Context: ${task.context ? JSON.stringify(task.context) : 'Not provided'}

        Produce a highly detailed and practical report at the right level of depth for a ${audienceType} audience.
        Respond in English.
      `;
  }
}

const executeSummarizationTaskStep = createStep({
  id: 'execute-summarization-task',
  description: 'Run the summarizer agent against the requested task.',
  inputSchema: summarizationTaskWorkflowEnvelopeSchema,
  outputSchema: z.any(),
  execute: async ({ mastra, inputData }) => {
    const task = unwrapSingle(inputData);
    const audienceType = task.audienceType || 'general';
    const trace = langfuse.trace({
      id: task.parentTraceId || undefined,
      name: 'summarization-task',
      metadata: {
        agent: AGENT_NAME,
        agentId: AGENT_ID,
        taskId: task.taskId,
        taskType: task.type,
      },
      tags: ['summarizer', 'summarization-task'],
    });

    trace.event({
      name: 'task-validated',
      metadata: {
        type: task.type,
        audienceType,
        dataSize: JSON.stringify(task.data).length,
        hasContext: !!task.context,
      },
    });

    const prompt = buildPrompt(task);
    const generation = trace.generation({
      name: 'summarization-llm-call',
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      input: [{ role: 'user', content: prompt }],
      metadata: {
        promptLength: prompt.length,
        summaryType: task.type,
        audienceType,
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

      trace.event({
        name: 'summarization-completed',
        metadata: {
          summaryLength: result.text.length,
          success: true,
          audienceType,
          processedBy: AGENT_ID,
          summaryType: task.type,
          originalDataSize: JSON.stringify(task.data).length,
          traceId: trace.id,
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
                  text: result.text,
                },
              ],
            },
          },
          artifacts: [
            {
              type: 'summary-result',
              data: result.text,
              metadata: {
                completedAt: new Date().toISOString(),
                summaryType: task.type,
                audienceType,
                traceId: trace.id,
                usage: result.usage || {},
              },
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
  },
});

export const summarizationTaskWorkflow = createWorkflow({
  id: SUMMARIZER_TASK_WORKFLOW_ID,
  description: 'Governed workflow for A2A summarization tasks.',
  inputSchema: summarizationTaskWorkflowEnvelopeSchema,
  outputSchema: z.any(),
})
  .then(executeSummarizationTaskStep)
  .commit();
