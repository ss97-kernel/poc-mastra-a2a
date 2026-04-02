import { Mastra } from '@mastra/core/mastra';
import { withOpenBox } from '@openbox-ai/openbox-mastra-sdk';
import { dataProcessorAgent } from './agents/dataProcessorAgent.js';
import { dataProcessingTaskWorkflow } from './workflows/taskProcessorWorkflow.js';

// Get agent configuration from environment
const AGENT_ID = process.env.AGENT_ID || 'data-processor-agent-01';
const PORT = Number.parseInt(process.env.PORT || '4111', 10);
const HOST = process.env.MASTRA_HOST || '0.0.0.0';

// Initialize Mastra with agent
const baseMastra = new Mastra({
  server: {
    host: HOST,
    port: PORT,
  },
  agents: { 
    [AGENT_ID]: dataProcessorAgent 
  },
  workflows: {
    [dataProcessingTaskWorkflow.id]: dataProcessingTaskWorkflow,
  },
});

export const mastra = await withOpenBox(baseMastra);

console.log(`Mastra initialized successfully with data processor agent registered as ${AGENT_ID}`);
