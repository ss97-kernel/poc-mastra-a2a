import express from 'express';
import { tasks } from './a2aRoutes.js';

const router = express.Router();

const AGENT_ID = process.env.AGENT_ID || 'web-search-agent-01';
const AGENT_NAME = process.env.AGENT_NAME || 'Web Search Agent';

router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    agent: AGENT_NAME,
    agentId: AGENT_ID,
    capabilities: ['web-search', 'news-search', 'scholarly-search'],
  });
});

router.get('/agent', (req, res) => {
  res.json({
    id: AGENT_ID,
    name: AGENT_NAME,
    type: 'web-search',
    capabilities: ['web-search', 'news-search', 'scholarly-search'],
    status: 'online',
    supportedTaskTypes: [
      'web-search',
      'news-search',
      'scholarly-search',
      'comprehensive-search',
    ],
  });
});

router.get('/tasks', (req, res) => {
  res.json({
    tasks: Array.from(tasks.values()),
    total: tasks.size,
  });
});

export { router as apiRoutes };
