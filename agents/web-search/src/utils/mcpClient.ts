import { MCPClient } from '@mastra/mcp';

let toolsPromise: Promise<Record<string, any>> | null = null;

export async function initializeMCPClient() {
  if (!toolsPromise) {
    toolsPromise = (async () => {
      try {
        const mcpClient = new MCPClient({
          servers: {
            'brave-search': {
              command: 'node',
              args: ['/app/standalone-mcp-server/dist/server.js'],
              env: {
                BRAVE_SEARCH_API_KEY: process.env.BRAVE_SEARCH_API_KEY || '',
              },
              timeout: 30000,
            },
          },
        });

        console.log('MCP Client initialized, getting tools...');

        const tools = await mcpClient.listTools();
        console.log('Available MCP tools:', Object.keys(tools));

        for (const [toolName, tool] of Object.entries(tools)) {
          console.log(`Tool: ${toolName}`, {
            description: (tool as any).description,
            inputSchema: (tool as any).inputSchema,
          });
        }

        return tools;
      } catch (error) {
        toolsPromise = null;
        console.error('Failed to initialize MCP client:', error);
        throw error;
      }
    })();
  }

  return toolsPromise;
}

export function resetMCPClientCache() {
  toolsPromise = null;
}
