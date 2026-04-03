import express from 'express';
import {
  ApprovalExpiredError,
  ApprovalPendingError,
  ApprovalRejectedError,
  GovernanceHaltError,
} from '@openbox-ai/openbox-mastra-sdk';
import { mastra } from '../mastra/index.js';
import { WEB_SEARCH_ORCHESTRATION_WORKFLOW_ID } from '../mastra/workflows/searchTaskOrchestrationWorkflow.js';
import { webSearchTaskWorkflowInputSchema } from '../mastra/workflows/searchTaskWorkflow.js';

const router = express.Router();

const AGENT_ID = process.env.AGENT_ID || 'web-search-agent-01';
const AGENT_NAME = process.env.AGENT_NAME || 'Web Search Agent';
const PORT = process.env.PORT || 3004;

export const tasks = new Map<string, any>();
const pendingRuns = new Map<
  string,
  {
    run: {
      resume: (args: { resumeData?: unknown; step?: string }) => Promise<unknown>;
    };
    step?: string;
    suspendPayload?: unknown;
    nextResumeAttemptAt: number;
  }
>();

function getResumePollIntervalMs() {
  const configured = Number.parseInt(
    process.env.OPENBOX_APPROVAL_RESUME_POLL_INTERVAL_MS || '5000',
    10
  );

  return Number.isFinite(configured) && configured >= 0 ? configured : 5000;
}

function buildTaskStatus(state: string, text: string) {
  return {
    state,
    timestamp: new Date().toISOString(),
    message: {
      role: 'agent',
      parts: [{ type: 'text', text }],
    },
  };
}

function buildWorkingTask(taskId: string, text = 'Processing search task...') {
  return {
    task: {
      id: taskId,
      status: buildTaskStatus('working', text),
      artifacts: [],
    },
  };
}

function buildFailedTask(taskId: string, message: string) {
  return {
    task: {
      id: taskId,
      status: buildTaskStatus('failed', message),
      artifacts: [],
    },
  };
}

function buildApprovalPendingTask(taskId: string, suspendPayload?: unknown) {
  return {
    task: {
      id: taskId,
      status: buildTaskStatus('working', 'Awaiting approval in OpenBox'),
      artifacts: suspendPayload
        ? [
            {
              type: 'approval-pending',
              data: {
                suspendPayload,
              },
            },
          ]
        : [],
    },
  };
}

function extractSuspendedStep(result: {
  status: 'suspended';
  suspendPayload?: unknown;
}) {
  if (!result.suspendPayload || typeof result.suspendPayload !== 'object') {
    return undefined;
  }

  const [firstStep] = Object.keys(result.suspendPayload as Record<string, unknown>);
  return firstStep;
}

function parseTaskData(message: any) {
  try {
    return JSON.parse(message.parts[0].text);
  } catch {
    return {
      type: 'web-search',
      query: message.parts[0].text,
    };
  }
}

async function startGovernedTask(taskData: any, taskId: string) {
  const workflow = mastra.getWorkflow(WEB_SEARCH_ORCHESTRATION_WORKFLOW_ID);
  if (!workflow) {
    throw new Error(
      `Workflow ${WEB_SEARCH_ORCHESTRATION_WORKFLOW_ID} is not registered`
    );
  }

  const run = await workflow.createRun();
  const workflowInput = webSearchTaskWorkflowInputSchema.parse({
    ...taskData,
    taskId,
  });
  const result = await run.start({
    inputData: [workflowInput],
  });

  if (
    result &&
    typeof result === 'object' &&
    'status' in result &&
    result.status === 'suspended'
  ) {
    pendingRuns.set(taskId, {
      run,
      step: extractSuspendedStep(result),
      suspendPayload: result.suspendPayload,
      nextResumeAttemptAt: 0,
    });
    const pendingTask = buildApprovalPendingTask(taskId, result.suspendPayload);
    tasks.set(taskId, pendingTask);
    return pendingTask;
  }

  if (
    result &&
    typeof result === 'object' &&
    'status' in result &&
    result.status !== 'success'
  ) {
    throw new Error(
      `Workflow ${WEB_SEARCH_ORCHESTRATION_WORKFLOW_ID} failed with status ${result.status}`
    );
  }

  const completedTask =
    result && typeof result === 'object' && 'result' in result
      ? result.result
      : result;

  tasks.set(taskId, completedTask);
  return completedTask;
}

async function resumePendingTask(taskId: string) {
  const pending = pendingRuns.get(taskId);
  if (!pending) {
    return tasks.get(taskId);
  }

  if (Date.now() < pending.nextResumeAttemptAt) {
    return tasks.get(taskId);
  }

  pending.nextResumeAttemptAt = Date.now() + getResumePollIntervalMs();

  try {
    const resumed = (await pending.run.resume({
      resumeData: {
        approved: true,
        approvedBy: 'openbox-ui',
      },
      ...(pending.step ? { step: pending.step } : {}),
    })) as any;

    if (
      resumed &&
      typeof resumed === 'object' &&
      'status' in resumed &&
      resumed.status === 'suspended'
    ) {
      pendingRuns.set(taskId, {
        run: pending.run,
        step: extractSuspendedStep(resumed),
        suspendPayload: resumed.suspendPayload,
        nextResumeAttemptAt: Date.now() + getResumePollIntervalMs(),
      });
      const pendingTask = buildApprovalPendingTask(taskId, resumed.suspendPayload);
      tasks.set(taskId, pendingTask);
      return pendingTask;
    }

    if (
      resumed &&
      typeof resumed === 'object' &&
      'status' in resumed &&
      resumed.status !== 'success'
    ) {
      throw new Error(
        `Workflow ${WEB_SEARCH_ORCHESTRATION_WORKFLOW_ID} failed with status ${resumed.status}`
      );
    }

    pendingRuns.delete(taskId);
    const completedTask =
      resumed && typeof resumed === 'object' && 'result' in resumed
        ? resumed.result
        : resumed;
    tasks.set(taskId, completedTask);
    return completedTask;
  } catch (error) {
    if (error instanceof ApprovalPendingError) {
      pending.nextResumeAttemptAt = Date.now() + getResumePollIntervalMs();
      const pendingTask = buildApprovalPendingTask(taskId, pending.suspendPayload);
      tasks.set(taskId, pendingTask);
      return pendingTask;
    }

    if (
      error instanceof ApprovalRejectedError ||
      error instanceof ApprovalExpiredError ||
      error instanceof GovernanceHaltError
    ) {
      pendingRuns.delete(taskId);
      const failedTask = buildFailedTask(taskId, error.message);
      tasks.set(taskId, failedTask);
      return failedTask;
    }

    pendingRuns.delete(taskId);
    const failedTask = buildFailedTask(
      taskId,
      error instanceof Error ? error.message : 'Unknown error'
    );
    tasks.set(taskId, failedTask);
    return failedTask;
  }
}

router.post('/task', async (req, res) => {
  try {
    console.log(`${AGENT_NAME} received A2A task:`, req.body);

    const { to } = req.body;
    if (to && to !== AGENT_ID) {
      return res.status(400).json({
        error: `Task intended for agent ${to}, but this is ${AGENT_ID}`,
        from: AGENT_ID,
      });
    }

    const taskId = req.body.id || crypto.randomUUID();
    tasks.set(taskId, buildWorkingTask(taskId));

    startGovernedTask(req.body, taskId).catch(error => {
      tasks.set(
        taskId,
        buildFailedTask(
          taskId,
          `An error occurred: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        )
      );
    });

    res.json(tasks.get(taskId));
  } catch (error) {
    console.error(`${AGENT_NAME} task creation error:`, error);
    const taskId = req.body.id || crypto.randomUUID();
    res.status(500).json(
      buildFailedTask(
        taskId,
        `Task creation error: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      )
    );
  }
});

router.post('/message', async (req, res) => {
  try {
    console.log(`${AGENT_NAME} received A2A message:`, req.body);

    const { to, message } = req.body;
    if (to && to !== AGENT_ID) {
      return res.status(400).json({
        error: `Message intended for agent ${to}, but this is ${AGENT_ID}`,
        from: AGENT_ID,
      });
    }

    const taskData = parseTaskData(message);
    if (!taskData.type) {
      taskData.type = 'web-search';
    }

    const taskId = crypto.randomUUID();
    tasks.set(taskId, buildWorkingTask(taskId));

    startGovernedTask(taskData, taskId).catch(error => {
      tasks.set(
        taskId,
        buildFailedTask(
          taskId,
          `An error occurred: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        )
      );
    });

    res.json(tasks.get(taskId));
  } catch (error) {
    console.error(`${AGENT_NAME} message processing error:`, error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
      from: AGENT_ID,
    });
  }
});

router.get('/task/:taskId', async (req, res) => {
  const { taskId } = req.params;

  if (pendingRuns.has(taskId)) {
    await resumePendingTask(taskId);
  }

  const task = tasks.get(taskId);
  if (!task) {
    return res.status(404).json(buildFailedTask(taskId, 'Task not found'));
  }

  res.json(task);
});

router.delete('/task/:taskId', (req, res) => {
  const { taskId } = req.params;
  const task = tasks.get(taskId);

  if (!task) {
    return res.status(404).json(buildFailedTask(taskId, 'Task not found'));
  }

  if (task.task?.status?.state === 'working') {
    task.task.status = buildTaskStatus('cancelled', 'Task cancelled by request');
    tasks.set(taskId, task);
  }

  pendingRuns.delete(taskId);
  res.json(task);
});

router.get('/agent', (req, res) => {
  res.json({
    id: AGENT_ID,
    name: AGENT_NAME,
    type: 'web-search',
    description: 'Web search agent for real-time web, news, and scholarly search tasks',
    capabilities: ['web-search', 'news-search', 'scholarly-search'],
    endpoint: `http://web-search:${PORT}`,
    status: 'online',
    version: '1.0.0',
    supportedProtocols: ['A2A'],
    supportedTaskTypes: [
      'web-search',
      'news-search',
      'scholarly-search',
      'comprehensive-search',
    ],
    supportedMessageTypes: ['text/plain', 'application/json'],
  });
});

export { router as a2aRoutes };
