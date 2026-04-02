import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { sendA2AMessage } from '../../utils/mastraA2AClient.js';
import {
  assertA2ASuccess,
  extractA2AResult,
  extractA2ASearchResult,
} from '../../utils/a2aResponse.js';
import { asyncTasks } from './asyncTaskManager.js';
import { buildResearchSynthesisPayload } from './deepResearchPayload.js';

export const requestTypeSchema = z.enum([
  'process',
  'summarize',
  'analyze',
  'web-search',
  'news-search',
  'scholarly-search',
  'deep-research',
]);

export const audienceTypeSchema = z.enum(['technical', 'executive', 'general']);

export const requestSchema = z.object({
  type: requestTypeSchema,
  data: z.any().optional(),
  context: z.record(z.any()).optional(),
  audienceType: audienceTypeSchema.optional(),
  query: z.string().optional(),
  topic: z.string().optional(),
  searchOptions: z
    .object({
      maxResults: z.number().optional(),
      timeRange: z.enum(['day', 'week', 'month', 'year', 'all']).optional(),
      language: z.string().optional(),
      region: z.string().optional(),
      category: z
        .enum(['general', 'news', 'images', 'videos', 'scholarly'])
        .optional(),
      safesearch: z.enum(['strict', 'moderate', 'off']).optional(),
    })
    .optional(),
  options: z
    .object({
      depth: z.enum(['basic', 'comprehensive', 'expert']).optional(),
      sources: z
        .array(z.enum(['web', 'news', 'academic', 'reports']))
        .optional(),
      maxDuration: z.string().optional(),
      parallelTasks: z.boolean().optional(),
    })
    .optional(),
});

export const promptRequestSchema = z.object({
  prompt: z.string().min(1),
  context: z.record(z.any()).optional(),
  audienceType: audienceTypeSchema.optional(),
});

export const requestSubmissionSchema = z.union([
  requestSchema,
  promptRequestSchema,
]);

const requestEnvelopeSchema = z.tuple([requestSchema]);

const analyzeIntermediateSchema = z.object({
  processing: z.any(),
});
const analyzeIntermediateEnvelopeSchema = z.tuple([analyzeIntermediateSchema]);

const deepResearchInputSchema = z.object({
  topic: z.string(),
  audienceType: audienceTypeSchema.optional(),
  options: requestSchema.shape.options.optional(),
  taskId: z.string().optional(),
});
const deepResearchInputEnvelopeSchema = z.tuple([deepResearchInputSchema]);

const deepResearchIntermediateSchema = z.object({
  searchResult: z.any(),
  analysisResult: z.any(),
});
const deepResearchIntermediateEnvelopeSchema = z.tuple([deepResearchIntermediateSchema]);

export const GATEWAY_PROCESS_REQUEST_WORKFLOW_ID =
  'gateway-process-request-workflow';
export const GATEWAY_SUMMARIZE_REQUEST_WORKFLOW_ID =
  'gateway-summarize-request-workflow';
export const GATEWAY_ANALYZE_REQUEST_WORKFLOW_ID =
  'gateway-analyze-request-workflow';
export const GATEWAY_SEARCH_REQUEST_WORKFLOW_ID =
  'gateway-search-request-workflow';
export const GATEWAY_DEEP_RESEARCH_WORKFLOW_ID =
  'gateway-deep-research-workflow';

function getSearchQuery(inputData: z.infer<typeof requestSchema>): string {
  if (inputData.query) {
    return inputData.query;
  }

  if (inputData.data == null) {
    return '';
  }

  return typeof inputData.data === 'string'
    ? inputData.data
    : JSON.stringify(inputData.data);
}

function unwrapSingle<T>(inputData: [T]): T {
  return inputData[0];
}

const routeToDataProcessorStep = createStep({
  id: 'route-to-data-processor',
  description: 'Send a processing request to the data processor agent over A2A.',
  inputSchema: requestEnvelopeSchema,
  outputSchema: z.any(),
  execute: async ({ inputData }) => {
    const request = unwrapSingle(inputData);
    const response = await sendA2AMessage('data-processor', {
      type: 'process',
      data: request.data || {},
      context: request.context,
    });

    assertA2ASuccess(response);
    return extractA2AResult(response);
  },
});

const routeToSummarizerStep = createStep({
  id: 'route-to-summarizer',
  description: 'Send a summarization request to the summarizer agent over A2A.',
  inputSchema: requestEnvelopeSchema,
  outputSchema: z.any(),
  execute: async ({ inputData }) => {
    const request = unwrapSingle(inputData);
    const response = await sendA2AMessage('summarizer', {
      type: 'summarize',
      data: request.data || {},
      context: request.context,
      audienceType: request.audienceType || 'general',
    });

    assertA2ASuccess(response);
    return extractA2AResult(response);
  },
});

const analyzeDataStep = createStep({
  id: 'gateway-analyze-data',
  description: 'Send analysis input to the data processor agent.',
  inputSchema: requestEnvelopeSchema,
  outputSchema: analyzeIntermediateEnvelopeSchema,
  execute: async ({ inputData }) => {
    const request = unwrapSingle(inputData);
    const response = await sendA2AMessage('data-processor', {
      type: 'analyze',
      data: request.data || {},
      context: request.context,
    });

    assertA2ASuccess(response);

    return [
      {
        processing: extractA2AResult(response),
      },
    ] as [z.infer<typeof analyzeIntermediateSchema>];
  },
});

const summarizeAnalysisStep = createStep({
  id: 'gateway-summarize-analysis',
  description: 'Create an executive summary from the processed analysis output.',
  inputSchema: analyzeIntermediateEnvelopeSchema,
  outputSchema: z.any(),
  execute: async ({ inputData, getInitData }) => {
    const { processing } = unwrapSingle(inputData);
    const initData = unwrapSingle(
      getInitData<z.infer<typeof requestEnvelopeSchema>>()
    );
    const response = await sendA2AMessage('summarizer', {
      type: 'executive-summary',
      data: processing,
      context: {
        ...initData.context,
        workflow: 'analyze',
        previousStep: 'data-processing',
      },
      audienceType: initData.audienceType || 'executive',
    });

    assertA2ASuccess(response);

    const summary = extractA2AResult(response);

    return {
      workflow: 'analyze',
      steps: {
        processing,
        summary,
      },
      final_result: summary,
    };
  },
});

const routeToWebSearchStep = createStep({
  id: 'route-to-web-search',
  description: 'Send a search request to the web search agent over A2A.',
  inputSchema: requestEnvelopeSchema,
  outputSchema: z.any(),
  execute: async ({ inputData }) => {
    const request = unwrapSingle(inputData);
    const response = await sendA2AMessage('web-search', {
      type: request.type,
      query: getSearchQuery(request),
      context: request.context,
      options: request.searchOptions,
    });

    assertA2ASuccess(response);
    return extractA2ASearchResult(response);
  },
});

function updateDeepResearchTask(
  taskId: string | undefined,
  updates: Record<string, unknown>
) {
  if (!taskId) {
    return;
  }

  const task = asyncTasks.get(taskId);
  if (!task) {
    return;
  }

  Object.assign(task, updates);
  asyncTasks.set(taskId, task);
}

const deepResearchSearchStep = createStep({
  id: 'deep-research-search',
  description: 'Collect search material for the requested research topic.',
  inputSchema: deepResearchInputEnvelopeSchema,
  outputSchema: z.tuple([z.any()]),
  execute: async ({ inputData }) => {
    const request = unwrapSingle(inputData);
    updateDeepResearchTask(request.taskId, {
      status: 'working',
      currentPhase: 'search',
      progress: 10,
    });

    const response = await sendA2AMessage('web-search', {
      type: 'comprehensive-search',
      query: request.topic,
      options: {
        sources: request.options?.sources || ['web', 'news'],
        maxResults:
          request.options?.depth === 'expert'
            ? 50
            : request.options?.depth === 'comprehensive'
              ? 30
              : 15,
      },
    });

    assertA2ASuccess(response);
    updateDeepResearchTask(request.taskId, {
      currentPhase: 'analyze',
      progress: 33,
    });

    const searchResult = extractA2ASearchResult(response);
    return [searchResult] as [unknown];
  },
});

const deepResearchAnalyzeStep = createStep({
  id: 'deep-research-analyze',
  description: 'Analyze the gathered research material with the data processor.',
  inputSchema: z.tuple([z.any()]),
  outputSchema: deepResearchIntermediateEnvelopeSchema,
  execute: async ({ inputData, getInitData }) => {
    const searchResult = unwrapSingle(inputData);
    const initData = unwrapSingle(
      getInitData<z.infer<typeof deepResearchInputEnvelopeSchema>>()
    );

    const response = await sendA2AMessage('data-processor', {
      type: 'research-analysis',
      data: searchResult,
      options: {
        analyzePatterns: true,
        extractInsights: true,
        depth: initData.options?.depth || 'comprehensive',
      },
    });

    assertA2ASuccess(response);
    updateDeepResearchTask(initData.taskId, {
      currentPhase: 'synthesize',
      progress: 66,
    });

    return [
      {
        searchResult,
        analysisResult: extractA2AResult(response),
      },
    ] as [z.infer<typeof deepResearchIntermediateSchema>];
  },
});

function extractListItems(
  synthesisResult: unknown,
  matcher: (line: string) => boolean
): string[] {
  if (typeof synthesisResult !== 'string') {
    return [];
  }

  return synthesisResult
    .split('\n')
    .filter(
      line =>
        line.trim().match(/^[\d•\-\*]\.|^[\d\.]+\s/) !== null &&
        matcher(line.toLowerCase())
    )
    .map(line => line.trim())
    .slice(0, 5);
}

const deepResearchSynthesisStep = createStep({
  id: 'deep-research-synthesis',
  description: 'Create the final research report with the summarizer agent.',
  inputSchema: deepResearchIntermediateEnvelopeSchema,
  outputSchema: z.any(),
  execute: async ({ inputData, getInitData }) => {
    const { analysisResult, searchResult } = unwrapSingle(inputData);
    const initData = unwrapSingle(
      getInitData<z.infer<typeof deepResearchInputEnvelopeSchema>>()
    );
    const synthesisPayload = buildResearchSynthesisPayload({
      topic: initData.topic,
      searchResult,
      analysisResult,
    });

    const response = await sendA2AMessage('summarizer', {
      type: 'research-synthesis',
      data: synthesisPayload,
      options: {
        reportType: 'comprehensive',
        audienceType: initData.audienceType || 'technical',
        includeRecommendations: true,
        includeSources: true,
      },
    });

    assertA2ASuccess(response);

    const synthesis = extractA2AResult(response);
    const finalResult = {
      topic: initData.topic,
      methodology: 'multi-agent-deep-research',
      executiveSummary:
        typeof synthesis === 'object' && synthesis !== null
          ? (synthesis as Record<string, unknown>).executiveSummary ||
            (synthesis as Record<string, unknown>).summary ||
            synthesis
          : synthesis,
      detailedFindings: {
        searchResults: searchResult,
        analysis: analysisResult,
        synthesis,
      },
      keyFindings:
        typeof synthesis === 'object' && synthesis !== null
          ? (synthesis as Record<string, unknown>).keyFindings ||
            extractListItems(synthesis, line =>
              line.includes('finding') ||
              line.includes('result') ||
              line.includes('key')
            )
          : extractListItems(synthesis, line =>
              line.includes('finding') ||
              line.includes('result') ||
              line.includes('key')
            ),
      recommendations:
        typeof synthesis === 'object' && synthesis !== null
          ? (synthesis as Record<string, unknown>).recommendations ||
            extractListItems(synthesis, line =>
              line.includes('recommend') ||
              line.includes('suggest') ||
              line.includes('improv')
            )
          : extractListItems(synthesis, line =>
              line.includes('recommend') ||
              line.includes('suggest') ||
              line.includes('improv')
            ),
      completedPhases: ['search', 'analyze', 'synthesize'],
    };

    updateDeepResearchTask(initData.taskId, {
      status: 'completed',
      currentPhase: 'completed',
      progress: 100,
      result: finalResult,
      completedAt: new Date().toISOString(),
    });

    return finalResult;
  },
});

export const gatewayProcessRequestWorkflow = createWorkflow({
  id: GATEWAY_PROCESS_REQUEST_WORKFLOW_ID,
  description: 'Gateway workflow for data processing requests.',
  inputSchema: requestEnvelopeSchema,
  outputSchema: z.any(),
})
  .then(routeToDataProcessorStep)
  .commit();

export const gatewaySummarizeRequestWorkflow = createWorkflow({
  id: GATEWAY_SUMMARIZE_REQUEST_WORKFLOW_ID,
  description: 'Gateway workflow for summarization requests.',
  inputSchema: requestEnvelopeSchema,
  outputSchema: z.any(),
})
  .then(routeToSummarizerStep)
  .commit();

export const gatewayAnalyzeRequestWorkflow = createWorkflow({
  id: GATEWAY_ANALYZE_REQUEST_WORKFLOW_ID,
  description: 'Gateway workflow for analyze requests.',
  inputSchema: requestEnvelopeSchema,
  outputSchema: z.any(),
})
  .then(analyzeDataStep)
  .then(summarizeAnalysisStep)
  .commit();

export const gatewaySearchRequestWorkflow = createWorkflow({
  id: GATEWAY_SEARCH_REQUEST_WORKFLOW_ID,
  description: 'Gateway workflow for search requests.',
  inputSchema: requestEnvelopeSchema,
  outputSchema: z.any(),
})
  .then(routeToWebSearchStep)
  .commit();

export const gatewayDeepResearchWorkflow = createWorkflow({
  id: GATEWAY_DEEP_RESEARCH_WORKFLOW_ID,
  description: 'Gateway workflow for multi-agent deep research.',
  inputSchema: deepResearchInputEnvelopeSchema,
  outputSchema: z.any(),
})
  .then(deepResearchSearchStep)
  .then(deepResearchAnalyzeStep)
  .then(deepResearchSynthesisStep)
  .commit();
