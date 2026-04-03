import { mastra } from '../index.js';
import {
  GATEWAY_DEEP_RESEARCH_WORKFLOW_ID,
} from './requestWorkflows.js';

export async function startDeepResearchWorkflow(input: {
  topic: string;
  audienceType?: 'technical' | 'executive' | 'general';
  options?: Record<string, unknown>;
  taskId?: string;
}) {
  const workflow = mastra.getWorkflow(GATEWAY_DEEP_RESEARCH_WORKFLOW_ID);

  if (!workflow) {
    throw new Error(
      `Gateway workflow ${GATEWAY_DEEP_RESEARCH_WORKFLOW_ID} is not registered`
    );
  }

  const run = await workflow.createRun();
  const result = await run.start({
    inputData: [input],
  });

  return {
    workflowId: GATEWAY_DEEP_RESEARCH_WORKFLOW_ID,
    run,
    result,
  };
}

export async function runDeepResearchWorkflow(input: {
  topic: string;
  audienceType?: 'technical' | 'executive' | 'general';
  options?: Record<string, unknown>;
  taskId?: string;
}) {
  const execution = await startDeepResearchWorkflow(input);

  if ('status' in execution.result && execution.result.status !== 'success') {
    throw new Error(
      `Gateway workflow ${GATEWAY_DEEP_RESEARCH_WORKFLOW_ID} failed with status ${execution.result.status}`
    );
  }

  return 'result' in execution.result ? execution.result.result : execution.result;
}
