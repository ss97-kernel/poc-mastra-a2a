import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { Mastra } from '@mastra/core/mastra';
import { LibSQLStore } from '@mastra/libsql';
import { withOpenBox } from '@openbox-ai/openbox-mastra-sdk';
import { createWebSearchAgent } from './agents/webSearchAgent.js';
import { webSearchOrchestrationWorkflow } from './workflows/searchTaskOrchestrationWorkflow.js';
import { webSearchTaskWorkflow } from './workflows/searchTaskWorkflow.js';

// Get agent configuration from environment
const AGENT_ID = process.env.AGENT_ID || 'web-search-agent-01';
const PORT = Number.parseInt(process.env.PORT || '4111', 10);
const HOST = process.env.MASTRA_HOST || '0.0.0.0';
const STORAGE_DIR = process.env.MASTRA_STORAGE_DIR || '.mastra';

mkdirSync(STORAGE_DIR, { recursive: true });

const storage = new LibSQLStore({
  id: `${AGENT_ID}-storage`,
  url: `file:${path.join(STORAGE_DIR, `${AGENT_ID}.db`)}`,
});

// Create Web Search Agent
const webSearchAgent = await createWebSearchAgent();

// Initialize Mastra with agent
const baseMastra = new Mastra({
  server: {
    host: HOST,
    port: PORT,
  },
  storage,
  agents: { 
    [AGENT_ID]: webSearchAgent 
  },
  workflows: {
    [webSearchTaskWorkflow.id]: webSearchTaskWorkflow,
    [webSearchOrchestrationWorkflow.id]: webSearchOrchestrationWorkflow,
  },
});

export const mastra = await withOpenBox(baseMastra);

console.log(`Mastra initialized successfully with web search agent registered as ${AGENT_ID}`);
