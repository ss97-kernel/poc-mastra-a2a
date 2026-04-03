import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { Mastra } from '@mastra/core/mastra';
import { LibSQLStore } from '@mastra/libsql';
import { withOpenBox } from '@openbox-ai/openbox-mastra-sdk';
import { dataProcessorAgent } from './agents/dataProcessorAgent.js';
import { dataProcessingTaskWorkflow } from './workflows/taskProcessorWorkflow.js';

// Get agent configuration from environment
const AGENT_ID = process.env.AGENT_ID || 'data-processor-agent-01';
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
    [AGENT_ID]: dataProcessorAgent 
  },
  workflows: {
    [dataProcessingTaskWorkflow.id]: dataProcessingTaskWorkflow,
  },
});

export const mastra = await withOpenBox(baseMastra);

console.log(`Mastra initialized successfully with data processor agent registered as ${AGENT_ID}`);
