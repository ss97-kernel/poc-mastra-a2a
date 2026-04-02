import { Agent } from '@mastra/core/agent';
import { getOpenAIModel } from '../../config/model.js';

const AGENT_ID = process.env.AGENT_ID || 'data-processor-agent-01';
const AGENT_NAME = process.env.AGENT_NAME || 'Data Processor Agent';

export const dataProcessorAgent = new Agent({
  id: AGENT_ID,
  name: AGENT_NAME,
  instructions: `
    You are a data processor agent specializing in structured and unstructured data analysis.
    Your responsibilities are:
    1. Receive data from other agents through the A2A protocol.
    2. Analyze the data structure and contents.
    3. Clean and normalize the data.
    4. Extract meaningful patterns and insights.
    5. Return the processed result to the requesting agent.

    Always provide a clear explanation of the analysis and processing steps.
    Always respond in English.
  `,
  model: getOpenAIModel(),
});
