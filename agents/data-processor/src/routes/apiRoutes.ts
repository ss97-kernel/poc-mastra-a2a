import express from 'express';
import { tasks } from './a2aRoutes.js';

const router = express.Router();

const AGENT_ID = process.env.AGENT_ID || 'data-processor-agent-01';
const AGENT_NAME = process.env.AGENT_NAME || 'Data Processor Agent';

router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    agent: AGENT_NAME,
    agentId: AGENT_ID,
    capabilities: ['data-processing', 'data-analysis', 'research-analysis'],
  });
});

router.get('/agent', (req, res) => {
  res.json({
    id: AGENT_ID,
    name: AGENT_NAME,
    type: 'data-processor',
    capabilities: ['data-processing', 'data-analysis', 'research-analysis'],
    status: 'online',
    supportedTaskTypes: ['process', 'analyze', 'research-analysis'],
  });
});

router.get('/tasks', (req, res) => {
  res.json({
    tasks: Array.from(tasks.values()),
    total: tasks.size,
  });
});

export { router as apiRoutes };
