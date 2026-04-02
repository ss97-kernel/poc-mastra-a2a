import { Mastra } from '@mastra/core/mastra';
import { withOpenBox } from '@openbox-ai/openbox-mastra-sdk';
import { summarizerAgent } from './agents/summarizerAgent.js';
import { summarizationTaskWorkflow } from './workflows/summarizationTaskWorkflow.js';

// Get agent configuration from environment
const AGENT_ID = process.env.AGENT_ID || 'summarizer-agent-01';
const PORT = Number.parseInt(process.env.PORT || '4111', 10);
const HOST = process.env.MASTRA_HOST || '0.0.0.0';

// Initialize Mastra with agent
const baseMastra = new Mastra({
  server: {
    host: HOST,
    port: PORT,
  },
  agents: { 
    [AGENT_ID]: summarizerAgent 
  },
  workflows: {
    [summarizationTaskWorkflow.id]: summarizationTaskWorkflow,
  },
});

export const mastra = await withOpenBox(baseMastra);

console.log(`Mastra initialized successfully with summarizer agent registered as ${AGENT_ID}`);
