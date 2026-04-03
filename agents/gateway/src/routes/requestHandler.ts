import express from 'express';
import { Langfuse } from 'langfuse';
import {
  ApprovalExpiredError,
  ApprovalRejectedError,
  GovernanceHaltError,
} from '@openbox-ai/openbox-mastra-sdk';
import { 
  createWorkflowExecution, 
  completeWorkflowExecution,
} from '../mastra/workflows/workflowManager.js';
import type { WorkflowExecution } from '../mastra/workflows/workflowManager.js';
import { asyncTasks } from '../mastra/workflows/asyncTaskManager.js';
import type { AsyncTask } from '../mastra/workflows/asyncTaskManager.js';
import {
  resolveGatewayRequestSubmission,
  startResolvedGatewayRequestWorkflow,
  isSuspendedWorkflowResult,
} from '../mastra/workflows/requestWorkflowRunner.js';
import {
  startDeepResearchWorkflow,
} from '../mastra/workflows/deepResearchRunner.js';
import { trackPendingWorkflowRun } from '../mastra/workflows/pendingWorkflowRuns.js';

const router = express.Router();

const AGENT_ID = process.env.AGENT_ID || 'gateway-agent-01';
const AGENT_NAME = process.env.AGENT_NAME || 'Gateway Agent';

// Initialize Langfuse client for tracing
const langfuse = new Langfuse({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  baseUrl: process.env.LANGFUSE_BASEURL || 'https://cloud.langfuse.com',
});

function getRequestPayloadSize(payload: unknown): number {
  return payload == null ? 0 : JSON.stringify(payload).length;
}

function buildApprovalPendingTask(
  taskId: string,
  type: string,
  traceId: string,
  workflowExecutionId?: string,
  suspendPayload?: unknown
): AsyncTask {
  return {
    id: taskId,
    type,
    status: 'awaiting_approval',
    progress: 0,
    currentPhase: 'approval',
    phases: ['approval'],
    startedAt: new Date().toISOString(),
    metadata: {
      traceId,
      suspendPayload,
    },
    workflowExecutionId,
  };
}

function classifyGatewayError(error: unknown): {
  message: string;
  statusCode: number;
} {
  if (
    error instanceof GovernanceHaltError ||
    error instanceof ApprovalRejectedError
  ) {
    return {
      message: error.message,
      statusCode: 403,
    };
  }

  if (error instanceof ApprovalExpiredError) {
    return {
      message: error.message,
      statusCode: 409,
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      statusCode: 500,
    };
  }

  return {
    message: 'Unknown error',
    statusCode: 500,
  };
}

// Main request handler
router.post('/', async (req, res) => {
  const requestId = crypto.randomUUID();
  
  // Create Langfuse trace for the request
  const trace = langfuse.trace({
    id: requestId,
    name: 'gateway-request',
    userId: req.headers['x-user-id'] as string || 'unknown',
    metadata: {
      agent: AGENT_NAME,
      agentId: AGENT_ID,
      requestType: typeof req.body?.type === 'string' ? req.body.type : 'prompt',
    },
    tags: ['gateway', 'a2a-routing'],
  });

  let workflowExecution: WorkflowExecution | null = null;

  try {
    const resolvedRequest = await resolveGatewayRequestSubmission(req.body);
    console.log(`Gateway resolved request to type: ${resolvedRequest.type}`);
    
    // Create workflow execution record
    const dataSize = getRequestPayloadSize(
      resolvedRequest.topic ?? resolvedRequest.query ?? resolvedRequest.data
    );
    workflowExecution = createWorkflowExecution(
      requestId,
      resolvedRequest.type,
      req.headers['x-user-id'] as string || 'anonymous',
      trace.id,
      dataSize,
      resolvedRequest.audienceType
    );
    
    // Add request details to trace
    const traceDataSize = getRequestPayloadSize(req.body);
    trace.event({
      name: 'request-received',
      metadata: {
        type: resolvedRequest.type,
        originalRequestType: typeof req.body?.type === 'string' ? req.body.type : 'prompt',
        dataSize: traceDataSize,
        hasContext: !!resolvedRequest.context,
        workflowExecutionId: workflowExecution.id,
      },
    });

    if (resolvedRequest.type === 'deep-research') {
      const topic = resolvedRequest.topic || resolvedRequest.query || '';
      if (!topic) {
        throw new Error('Topic or query is required for deep research');
      }

      const taskId = `research-task-${Date.now()}-${crypto.randomUUID()}`;
      const phases = ['search', 'analyze', 'synthesize'];

      const task: AsyncTask = {
        id: taskId,
        type: 'deep-research',
        status: 'initiated',
        progress: 0,
        currentPhase: 'initiation',
        phases,
        startedAt: new Date().toISOString(),
        estimatedDuration: '8-10 minutes',
        metadata: {
          topic,
          options: resolvedRequest.options,
          traceId: trace.id,
        },
        workflowExecutionId: workflowExecution.id,
      };

      asyncTasks.set(taskId, task);

      startDeepResearchWorkflow({
        topic,
        options: resolvedRequest.options || {},
        audienceType: resolvedRequest.audienceType,
        taskId,
      })
        .then(execution => {
          if (isSuspendedWorkflowResult(execution.result)) {
            const pendingTask = asyncTasks.get(taskId);
            if (!pendingTask) {
              return;
            }

            pendingTask.status = 'awaiting_approval';
            pendingTask.currentPhase = 'approval';
            pendingTask.metadata = {
              ...(pendingTask.metadata || {}),
              suspendPayload: execution.result.suspendPayload,
            };
            asyncTasks.set(taskId, pendingTask);
            trackPendingWorkflowRun(taskId, execution.run, execution.result);
          }
        })
        .catch(error => {
        console.error(`Deep Research workflow error for task ${taskId}:`, error);
        const failedTask = asyncTasks.get(taskId);
        if (!failedTask) {
          return;
        }

        failedTask.status = 'failed';
        failedTask.error =
          error instanceof Error ? error.message : 'Unknown error';
        failedTask.completedAt = new Date().toISOString();
        asyncTasks.set(taskId, failedTask);
      });

      trace.event({
        name: 'request-accepted',
        metadata: {
          type: resolvedRequest.type,
          taskId,
          workflowExecutionId: workflowExecution.id,
        },
      });

      return res.json({
        status: 'accepted',
        type: resolvedRequest.type,
        taskId,
        estimatedDuration: task.estimatedDuration,
        pollUrl: `/api/gateway/task/${taskId}`,
        steps: {
          total: phases.length,
          current: 0,
          phases,
        },
        metadata: {
          acceptedAt: new Date().toISOString(),
          gateway: AGENT_ID,
          traceId: trace.id,
          workflowExecutionId: workflowExecution.id,
        },
      });
    }

    const workflowRun = await startResolvedGatewayRequestWorkflow(resolvedRequest);

    if (isSuspendedWorkflowResult(workflowRun.result)) {
      const taskId = `approval-task-${Date.now()}-${crypto.randomUUID()}`;
      const approvalTask = buildApprovalPendingTask(
        taskId,
        resolvedRequest.type,
        trace.id,
        workflowExecution?.id,
        workflowRun.result.suspendPayload
      );

      asyncTasks.set(taskId, approvalTask);
      trackPendingWorkflowRun(taskId, workflowRun.run, workflowRun.result);

      trace.event({
        name: 'request-awaiting-approval',
        metadata: {
          type: resolvedRequest.type,
          taskId,
          workflowExecutionId: workflowExecution?.id,
        },
      });

      return res.status(202).json({
        status: 'accepted',
        type: resolvedRequest.type,
        taskId,
        pollUrl: `/api/gateway/task/${taskId}`,
        steps: {
          total: 1,
          current: 0,
          phases: ['approval'],
        },
        metadata: {
          acceptedAt: new Date().toISOString(),
          gateway: AGENT_ID,
          traceId: trace.id,
          workflowExecutionId: workflowExecution?.id,
        },
      });
    }

    if (
      workflowRun.result &&
      typeof workflowRun.result === 'object' &&
      'status' in workflowRun.result &&
      workflowRun.result.status !== 'success'
    ) {
      throw new Error(
        `Gateway workflow ${workflowRun.workflowId} failed with status ${workflowRun.result.status}`
      );
    }

    const result =
      workflowRun.result &&
      typeof workflowRun.result === 'object' &&
      'result' in workflowRun.result
        ? workflowRun.result.result
        : workflowRun.result;

    console.log(`Gateway completed ${resolvedRequest.type} request`);
    
    // Complete workflow execution successfully
    if (workflowExecution) {
      completeWorkflowExecution(workflowExecution.id, result);
    }
    
    // Mark trace as successful
    const resultSize = result != null ? JSON.stringify(result).length : 0;
    trace.event({
      name: 'request-completed',
      metadata: {
        type: resolvedRequest.type,
        success: true,
        resultSize: resultSize,
        workflowExecutionId: workflowExecution?.id,
      },
    });

    res.json({
      status: 'success',
      type: resolvedRequest.type,
      result,
      metadata: {
        completedAt: new Date().toISOString(),
        gateway: AGENT_ID,
        traceId: trace.id,
        workflowExecutionId: workflowExecution?.id,
      },
    });

  } catch (error) {
    console.error('Gateway error:', error);
    const classifiedError = classifyGatewayError(error);
    
    // Complete workflow execution with error
    if (workflowExecution) {
      completeWorkflowExecution(
        workflowExecution.id, 
        undefined, 
        classifiedError.message
      );
    }
    
    // Mark trace as failed
    trace.event({
      name: 'request-failed',
      metadata: {
        error: error instanceof Error ? error.message : 'Unknown error',
        errorType: error instanceof Error ? error.constructor.name : 'Unknown',
        workflowExecutionId: workflowExecution?.id,
      },
    });
    
    res.status(classifiedError.statusCode).json({
      status: 'error', 
      message: classifiedError.message,
      gateway: AGENT_ID,
      traceId: trace.id,
      workflowExecutionId: workflowExecution?.id,
    });
  }
});

export { router as requestHandler, langfuse };
