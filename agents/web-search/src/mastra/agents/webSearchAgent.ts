import { Agent } from '@mastra/core/agent';
import { getOpenAIModel } from '../../config/model.js';

const AGENT_ID = process.env.AGENT_ID || 'web-search-agent-01';
const AGENT_NAME = process.env.AGENT_NAME || 'Web Search Agent';

export async function createWebSearchAgent(): Promise<Agent> {
  return new Agent({
    id: AGENT_ID,
    name: AGENT_NAME,
    instructions: `
      You are a web search analysis agent.
      Your responsibilities are:
      1. Receive search requests from other agents through the A2A protocol.
      2. Analyze search result sets that have already been collected through Brave Search.
      3. Extract the most relevant information, themes, and reliability signals.
      4. Summarize the results and return them as structured data.
      5. Focus on current information, news, and research content.

      Always consider source reliability, relevance, and recency.
      Always respond in English.
    `,
    model: getOpenAIModel(),
  });
}
