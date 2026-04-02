import express from 'express';
import { processTask } from '../mastra/workflows/taskProcessor.js';

const router = express.Router();

const AGENT_ID = process.env.AGENT_ID || 'data-processor-agent-01';
const AGENT_NAME = process.env.AGENT_NAME || 'Data Processor Agent';
const PORT = process.env.PORT || 3002;

export const tasks = new Map<string, any>();

function buildFailedTask(taskId: string, message: string) {
  return {
    task: {
      id: taskId,
      status: {
        state: 'failed',
        timestamp: new Date().toISOString(),
        message: {
          role: 'agent',
          parts: [
            {
              type: 'text',
              text: message,
            },
          ],
        },
      },
      artifacts: [],
    },
  };
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
    tasks.set(taskId, {
      task: {
        id: taskId,
        status: {
          state: 'working',
          timestamp: new Date().toISOString(),
          message: {
            role: 'agent',
            parts: [{ type: 'text', text: 'Processing data task...' }],
          },
        },
        artifacts: [],
      },
    });

    processTask(req.body, taskId)
      .then(result => {
        tasks.set(taskId, result);
      })
      .catch(error => {
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

    let taskData: any;
    try {
      taskData = JSON.parse(message.parts[0].text);
    } catch {
      taskData = { type: 'process', data: message.parts[0].text };
    }

    if (!taskData.type) {
      taskData.type = 'process';
    }

    const taskId = crypto.randomUUID();

    try {
      const result = await processTask(taskData, taskId);
      tasks.set(taskId, result);
      res.json(result);
    } catch (error) {
      const failedTask = buildFailedTask(
        taskId,
        `An error occurred: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
      tasks.set(taskId, failedTask);
      res.json(failedTask);
    }
  } catch (error) {
    console.error(`${AGENT_NAME} message processing error:`, error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
      from: AGENT_ID,
    });
  }
});

router.get('/task/:taskId', (req, res) => {
  const { taskId } = req.params;
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
    task.task.status = {
      state: 'cancelled',
      timestamp: new Date().toISOString(),
      message: {
        role: 'agent',
        parts: [{ type: 'text', text: 'Task cancelled by request' }],
      },
    };
    tasks.set(taskId, task);
  }

  res.json(task);
});

router.get('/agent', (req, res) => {
  res.json({
    id: AGENT_ID,
    name: AGENT_NAME,
    type: 'data-processor',
    description: 'Data processing agent for structured and unstructured analysis tasks',
    capabilities: ['data-processing', 'data-analysis', 'research-analysis'],
    endpoint: `http://data-processor:${PORT}`,
    status: 'online',
    version: '1.0.0',
    supportedProtocols: ['A2A'],
    supportedTaskTypes: ['process', 'analyze', 'research-analysis'],
    supportedMessageTypes: ['text/plain', 'application/json'],
  });
});

export { router as a2aRoutes };
