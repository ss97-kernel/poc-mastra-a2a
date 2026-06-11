import { z } from 'zod';
import { mastra } from '../index.js';
import {
  GATEWAY_ANALYZE_REQUEST_WORKFLOW_ID,
  GATEWAY_DEEP_RESEARCH_WORKFLOW_ID,
  GATEWAY_PROCESS_REQUEST_WORKFLOW_ID,
  GATEWAY_SEARCH_REQUEST_WORKFLOW_ID,
  GATEWAY_SUMMARIZE_REQUEST_WORKFLOW_ID,
  promptRequestSchema,
  requestSchema,
  requestSubmissionSchema,
  requestTypeSchema,
} from './requestWorkflows.js';

const AGENT_ID = process.env.AGENT_ID || 'gateway-agent-01';

const routingDecisionSchema = z.object({
  type: requestTypeSchema,
  reason: z.string().min(1).optional(),
});

type GatewayResolvedRequest = z.infer<typeof requestSchema>;
type PromptSubmission = z.infer<typeof promptRequestSchema>;

function getGatewayAgentOrThrow() {
  const agent = mastra.getAgent(AGENT_ID);
  if (!agent) {
    throw new Error(`Gateway agent ${AGENT_ID} is not registered`);
  }
  return agent;
}

function getWorkflowIdForRequest(type: GatewayResolvedRequest['type']) {
  switch (type) {
    case 'process':
      return GATEWAY_PROCESS_REQUEST_WORKFLOW_ID;
    case 'summarize':
      return GATEWAY_SUMMARIZE_REQUEST_WORKFLOW_ID;
    case 'analyze':
      return GATEWAY_ANALYZE_REQUEST_WORKFLOW_ID;
    case 'web-search':
    case 'news-search':
    case 'scholarly-search':
      return GATEWAY_SEARCH_REQUEST_WORKFLOW_ID;
    case 'deep-research':
      return GATEWAY_DEEP_RESEARCH_WORKFLOW_ID;
    default:
      throw new Error(`Unsupported gateway request type: ${type}`);
  }
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('Gateway intent classifier returned an empty response');
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fencedMatch?.[1]) {
      return JSON.parse(fencedMatch[1]);
    }

    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || firstBrace >= lastBrace) {
      throw new Error('Gateway intent classifier did not return JSON');
    }

    return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
  }
}

function classifyWithHeuristics(prompt: string): GatewayResolvedRequest['type'] {
  const normalized = prompt.toLowerCase();

  if (needsMultiAgentResearch(normalized)) {
    return 'deep-research';
  }

  if (
    normalized.includes('deep research') ||
    normalized.includes('research report') ||
    normalized.includes('comprehensive research') ||
    normalized.includes('detailed report') ||
    normalized.includes('multi-source') ||
    normalized.includes('compare sources')
  ) {
    return 'deep-research';
  }

  if (
    normalized.includes('paper') ||
    normalized.includes('papers') ||
    normalized.includes('journal') ||
    normalized.includes('scholarly') ||
    normalized.includes('academic') ||
    normalized.includes('arxiv') ||
    normalized.includes('literature review')
  ) {
    return 'scholarly-search';
  }

  if (
    normalized.includes('news') ||
    normalized.includes('headline') ||
    normalized.includes('headlines') ||
    normalized.includes('press release') ||
    normalized.includes('recent announcements')
  ) {
    return 'news-search';
  }

  if (
    normalized.includes('latest') ||
    normalized.includes('current') ||
    normalized.includes('today') ||
    normalized.includes('find') ||
    normalized.includes('look up') ||
    normalized.includes('search')
  ) {
    return 'web-search';
  }

  if (
    normalized.includes('summarize') ||
    normalized.includes('summary') ||
    normalized.includes('concise') ||
    normalized.includes('recap') ||
    normalized.includes('brief')
  ) {
    return 'summarize';
  }

  if (
    normalized.includes('analyze') ||
    normalized.includes('analysis') ||
    normalized.includes('insight') ||
    normalized.includes('trend') ||
    normalized.includes('compare') ||
    normalized.includes('forecast')
  ) {
    return 'analyze';
  }

  if (
    normalized.includes('{') ||
    normalized.includes('csv') ||
    normalized.includes('json') ||
    normalized.includes('clean') ||
    normalized.includes('transform') ||
    normalized.includes('process')
  ) {
    return 'process';
  }

  return 'summarize';
}

function includesAny(value: string, needles: string[]): boolean {
  return needles.some(needle => value.includes(needle));
}

function needsMultiAgentResearch(normalizedPrompt: string): boolean {
  if (
    includesAny(normalizedPrompt, [
      'all agents',
      'all three agents',
      'multi-agent',
      'multi agent',
      'search, analyze',
      'search and analyze',
      'research and summarize',
    ])
  ) {
    return true;
  }

  const needsCurrentSources = includesAny(normalizedPrompt, [
    'current',
    'latest',
    'market',
    'news',
    'source',
    'sources',
    'research',
    'announcement',
    'announcements',
    'external context',
  ]);
  const needsAnalysis = includesAny(normalizedPrompt, [
    'analyze',
    'analysis',
    'insight',
    'insights',
    'trend',
    'trends',
    'risk',
    'risks',
    'operational',
    'context',
    'impact',
    'drivers',
    'forecast',
  ]);
  const needsSynthesis = includesAny(normalizedPrompt, [
    'summarize',
    'summary',
    'brief',
    'briefing',
    'report',
    'update',
    'recommendation',
    'recommendations',
    'synthesize',
  ]);

  return needsCurrentSources && needsAnalysis && needsSynthesis;
}

async function classifyPromptSubmission(
  submission: PromptSubmission
): Promise<GatewayResolvedRequest['type']> {
  const agent = getGatewayAgentOrThrow();
  const response = await agent.generate([
    {
      role: 'user',
      content: [
        'Classify the user request into exactly one gateway route.',
        'Return JSON only in this format:',
        '{"type":"process|summarize|analyze|web-search|news-search|scholarly-search|deep-research","reason":"short explanation"}',
        '',
        'Route definitions:',
        '- process: clean, transform, structure, or process input data',
        '- summarize: create a summary or executive summary of provided content',
        '- analyze: analyze data and produce insights, often followed by summarization',
        '- web-search: general web lookup for current information',
        '- news-search: recent news, headlines, announcements, or media coverage',
        '- scholarly-search: academic papers, journals, studies, or research literature',
        '- deep-research: broad, multi-step research requiring source gathering, analysis, and final synthesis',
        '',
        'Use deep-research when one prompt asks for current/source context, operational or data analysis, and a final brief, report, update, or recommendation.',
        '',
        `Audience: ${submission.audienceType || 'general'}`,
        `Context: ${submission.context ? JSON.stringify(submission.context) : 'none'}`,
        `User prompt: ${submission.prompt}`,
      ].join('\n'),
    },
  ]);

  try {
    const parsed = routingDecisionSchema.parse(extractJsonObject(response.text));
    return parsed.type;
  } catch {
    return classifyWithHeuristics(submission.prompt);
  }
}

function buildResolvedRequest(
  submission: PromptSubmission,
  type: GatewayResolvedRequest['type']
): GatewayResolvedRequest {
  const baseRequest = {
    type,
    context: submission.context,
    audienceType: submission.audienceType,
  } as const;

  switch (type) {
    case 'web-search':
    case 'news-search':
    case 'scholarly-search':
      return requestSchema.parse({
        ...baseRequest,
        query: submission.prompt,
        data: submission.prompt,
      });
    case 'deep-research':
      return requestSchema.parse({
        ...baseRequest,
        topic: submission.prompt,
        data: submission.prompt,
      });
    default:
      return requestSchema.parse({
        ...baseRequest,
        data: submission.prompt,
      });
  }
}

async function executeWorkflow(
  workflowId: ReturnType<typeof getWorkflowIdForRequest>,
  inputData: unknown
) {
  const workflow = mastra.getWorkflow(workflowId);

  if (!workflow) {
    throw new Error(`Gateway workflow ${workflowId} is not registered`);
  }

  const run = await workflow.createRun();
  const result = await run.start({
    inputData: inputData as never,
  });

  return {
    workflowId,
    run,
    result,
  };
}

export function isSuspendedWorkflowResult(
  result: unknown
): result is { status: 'suspended'; suspendPayload?: unknown } {
  return (
    result !== null &&
    typeof result === 'object' &&
    'status' in result &&
    (result as { status?: unknown }).status === 'suspended'
  );
}

function unwrapSuccessfulWorkflowResult(result: unknown) {
  if (
    result !== null &&
    typeof result === 'object' &&
    'result' in result
  ) {
    return (result as { result: unknown }).result;
  }

  return result;
}

export async function startResolvedGatewayRequestWorkflow(
  request: GatewayResolvedRequest
) {
  const workflowId = getWorkflowIdForRequest(request.type);
  return executeWorkflow(workflowId, [request]);
}

export async function resolveGatewayRequestSubmission(
  request: unknown
): Promise<GatewayResolvedRequest> {
  const submission = requestSubmissionSchema.parse(request);

  if ('type' in submission) {
    return requestSchema.parse(submission);
  }

  const resolvedType = await classifyPromptSubmission(submission);
  return buildResolvedRequest(submission, resolvedType);
}

export async function runResolvedGatewayRequestWorkflow(
  request: GatewayResolvedRequest
) {
  const execution = await startResolvedGatewayRequestWorkflow(request);

  if (
    execution.result !== null &&
    typeof execution.result === 'object' &&
    'status' in execution.result &&
    (execution.result as { status?: unknown }).status !== 'success'
  ) {
    throw new Error(
      `Gateway workflow ${execution.workflowId} failed with status ${
        (execution.result as { status?: unknown }).status
      }`
    );
  }

  return unwrapSuccessfulWorkflowResult(execution.result);
}

export async function runGatewayRequestWorkflow(request: unknown) {
  const resolvedRequest = await resolveGatewayRequestSubmission(request);
  return runResolvedGatewayRequestWorkflow(resolvedRequest);
}
