import express from 'express';
import {
  ApprovalExpiredError,
  ApprovalPendingError,
  ApprovalRejectedError,
  GovernanceHaltError,
} from '@openbox-ai/openbox-mastra-sdk';
import { mastra } from '../mastra/index.js';
import {
  SUMMARIZER_TASK_WORKFLOW_ID,
  summarizationTaskWorkflowInputSchema,
} from '../mastra/workflows/summarizationTaskWorkflow.js';

const router = express.Router();

const AGENT_ID = process.env.AGENT_ID || 'summarizer-agent-01';
const AGENT_NAME = process.env.AGENT_NAME || 'Summarizer Agent';
const PORT = process.env.PORT || 3003;

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

function buildWorkingTask(taskId: string, text = 'Processing summarization task...') {
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

async function startGovernedTask(taskData: any, taskId: string) {
  const workflow = mastra.getWorkflow(SUMMARIZER_TASK_WORKFLOW_ID);
  if (!workflow) {
    throw new Error(`Workflow ${SUMMARIZER_TASK_WORKFLOW_ID} is not registered`);
  }

  const run = await workflow.createRun();
  const workflowInput = summarizationTaskWorkflowInputSchema.parse({
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
      `Workflow ${SUMMARIZER_TASK_WORKFLOW_ID} failed with status ${result.status}`
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
        `Workflow ${SUMMARIZER_TASK_WORKFLOW_ID} failed with status ${resumed.status}`
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

    let taskData;
    try {
      taskData = JSON.parse(message.parts[0].text);
    } catch {
      taskData = { type: 'summarize', data: message.parts[0].text };
    }

    if (!taskData.type) {
      taskData.type = 'summarize';
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

  const taskResult = tasks.get(taskId);
  if (!taskResult) {
    return res.status(404).json(buildFailedTask(taskId, 'Task not found'));
  }

  if (pendingRuns.has(taskId)) {
    await resumePendingTask(taskId);
  }

  res.json(tasks.get(taskId));
});

router.delete('/task/:taskId', (req, res) => {
  const { taskId } = req.params;

  const taskResult = tasks.get(taskId);
  if (!taskResult) {
    return res.status(404).json(buildFailedTask(taskId, 'Task not found'));
  }

  pendingRuns.delete(taskId);

  if (taskResult.task && taskResult.task.status.state === 'working') {
    taskResult.task.status = buildTaskStatus('cancelled', 'Task cancelled by request');
    tasks.set(taskId, taskResult);
  }

  res.json(taskResult);
});

router.get('/agent', (req, res) => {
  res.json({
    id: AGENT_ID,
    name: AGENT_NAME,
    type: 'summarizer',
    description: 'Summarizer agent for concise, meaningful summaries of processed data and analysis results',
    capabilities: ['text-summarization', 'executive-summary', 'insight-extraction', 'audience-specific-content'],
    endpoint: `http://summarizer:${PORT}`,
    status: 'online',
    version: '1.0.0',
    supportedProtocols: ['A2A'],
    supportedTaskTypes: ['summarize', 'executive-summary', 'brief', 'research-synthesis'],
    supportedAudienceTypes: ['technical', 'executive', 'general'],
    supportedMessageTypes: ['text/plain', 'application/json'],
    mastraAgent: {
      id: AGENT_ID,
      available: true,
      tools: mastra.getAgent(AGENT_ID)?.tools ? Object.keys(mastra.getAgent(AGENT_ID).tools) : [],
    }
  });
});

export { router as a2aRoutes };
