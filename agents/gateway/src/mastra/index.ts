import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { Mastra } from '@mastra/core/mastra';
import { LibSQLStore } from '@mastra/libsql';
import { withOpenBox } from '@openbox-ai/openbox-mastra-sdk';
import { gatewayAgent } from './agents/gatewayAgent.js';
import {
  gatewayAnalyzeRequestWorkflow,
  gatewayDeepResearchWorkflow,
  gatewayProcessRequestWorkflow,
  gatewaySearchRequestWorkflow,
  gatewaySummarizeRequestWorkflow,
} from './workflows/requestWorkflows.js';

// Get agent configuration from environment
const AGENT_ID = process.env.AGENT_ID || 'gateway-agent-01';
const STORAGE_DIR = process.env.MASTRA_STORAGE_DIR || '.mastra';

mkdirSync(STORAGE_DIR, { recursive: true });

const storage = new LibSQLStore({
  id: `${AGENT_ID}-storage`,
  url: `file:${path.join(STORAGE_DIR, `${AGENT_ID}.db`)}`,
});

// Initialize Mastra with agent
const baseMastra = new Mastra({
  storage,
  agents: { 
    [AGENT_ID]: gatewayAgent 
  },
  workflows: {
    [gatewayProcessRequestWorkflow.id]: gatewayProcessRequestWorkflow,
    [gatewaySummarizeRequestWorkflow.id]: gatewaySummarizeRequestWorkflow,
    [gatewayAnalyzeRequestWorkflow.id]: gatewayAnalyzeRequestWorkflow,
    [gatewaySearchRequestWorkflow.id]: gatewaySearchRequestWorkflow,
    [gatewayDeepResearchWorkflow.id]: gatewayDeepResearchWorkflow,
  },
});

export const mastra = await withOpenBox(baseMastra);

console.log(`Mastra initialized successfully with gateway agent registered as ${AGENT_ID}`);
