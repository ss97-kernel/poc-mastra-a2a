import { Mastra } from '@mastra/core/mastra';
import { withOpenBox } from '@openbox-ai/openbox-mastra-sdk';
import { createWebSearchAgent } from './agents/webSearchAgent.js';
import { webSearchTaskWorkflow } from './workflows/searchTaskWorkflow.js';

// Get agent configuration from environment
const AGENT_ID = process.env.AGENT_ID || 'web-search-agent-01';
const PORT = Number.parseInt(process.env.PORT || '4111', 10);
const HOST = process.env.MASTRA_HOST || '0.0.0.0';

// Create Web Search Agent
const webSearchAgent = await createWebSearchAgent();

// Initialize Mastra with agent
const baseMastra = new Mastra({
  server: {
    host: HOST,
    port: PORT,
  },
  agents: { 
    [AGENT_ID]: webSearchAgent 
  },
  workflows: {
    [webSearchTaskWorkflow.id]: webSearchTaskWorkflow,
  },
});

export const mastra = await withOpenBox(baseMastra);

console.log(`Mastra initialized successfully with web search agent registered as ${AGENT_ID}`);
