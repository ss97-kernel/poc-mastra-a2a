import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { Mastra } from '@mastra/core/mastra';
import { LibSQLStore } from '@mastra/libsql';
import { withOpenBox } from '@openbox-ai/openbox-mastra-sdk';
import { summarizerAgent } from './agents/summarizerAgent.js';
import { summarizationTaskWorkflow } from './workflows/summarizationTaskWorkflow.js';

// Get agent configuration from environment
const AGENT_ID = process.env.AGENT_ID || 'summarizer-agent-01';
const PORT = Number.parseInt(process.env.PORT || '4111', 10);
const HOST = process.env.MASTRA_HOST || '0.0.0.0';
const STORAGE_DIR = process.env.MASTRA_STORAGE_DIR || '.mastra';

mkdirSync(STORAGE_DIR, { recursive: true });

const storage = new LibSQLStore({
  id: `${AGENT_ID}-storage`,
  url: `file:${path.join(STORAGE_DIR, `${AGENT_ID}.db`)}`,
});

// Initialize Mastra with agent
const baseMastra = new Mastra({
  server: {
    host: HOST,
    port: PORT,
  },
  storage,
  agents: { 
    [AGENT_ID]: summarizerAgent 
  },
  workflows: {
    [summarizationTaskWorkflow.id]: summarizationTaskWorkflow,
  },
});

export const mastra = await withOpenBox(baseMastra);

console.log(`Mastra initialized successfully with summarizer agent registered as ${AGENT_ID}`);
