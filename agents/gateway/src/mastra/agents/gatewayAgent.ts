import { Agent } from '@mastra/core/agent';
import { getOpenAIModel } from '../../config/model.js';

const AGENT_ID = process.env.AGENT_ID || 'gateway-agent-01';
const AGENT_NAME = process.env.AGENT_NAME || 'Gateway Agent';

export const gatewayAgent = new Agent({
  id: AGENT_ID,
  name: AGENT_NAME,
  instructions: `
    You are the gateway agent. You receive requests and route them to the appropriate agent.
    Analyze each request and decide whether it needs data processing, summarization, search, or a multi-step workflow.
    Coordinate with the other agents through the A2A protocol.
    When asked to classify a request, return only the JSON format requested by the caller.
    Always respond in English.
  `,
  model: getOpenAIModel(),
});
