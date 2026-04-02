import express from 'express';
import dotenv from 'dotenv';
import { getOpenBoxRuntime } from '@openbox-ai/openbox-mastra-sdk';
import { mastra } from './mastra/index.js';
import { a2aRoutes } from './routes/a2aRoutes.js';
import { apiRoutes } from './routes/apiRoutes.js';
import { langfuse } from './mastra/workflows/taskProcessor.js';

dotenv.config();

const app = express();
const JSON_BODY_LIMIT = process.env.A2A_JSON_BODY_LIMIT || '2mb';
app.use(express.json({ limit: JSON_BODY_LIMIT }));

const PORT = process.env.PORT || 3002;
const AGENT_ID = process.env.AGENT_ID || 'data-processor-agent-01';
const AGENT_NAME = process.env.AGENT_NAME || 'Data Processor Agent';

app.use('/api/a2a', a2aRoutes);
app.use('/api', apiRoutes);
app.use('/', apiRoutes);

app.post('/api/agents/:agentId/generate', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { messages } = req.body;

    const agent = mastra.getAgent(agentId);
    if (!agent) {
      return res.status(404).json({
        error: `Agent ${agentId} not found`,
        availableAgents: [AGENT_ID],
      });
    }

    const response = await agent.generate(messages);

    res.json(response);
  } catch (error) {
    console.error(`Agent ${req.params.agentId} generation error:`, error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

async function shutdown() {
  await getOpenBoxRuntime(mastra)?.shutdown();
  await langfuse.shutdownAsync();
}

process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await shutdown();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`${AGENT_NAME} (${AGENT_ID}) listening on port ${PORT}`);
  console.log(`A2A Protocol endpoints available at http://localhost:${PORT}/api/a2a/`);
});
