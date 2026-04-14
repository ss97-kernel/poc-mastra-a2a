import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MCPClient } from '@mastra/mcp';

let toolsPromise: Promise<Record<string, any>> | null = null;

export function resolveStandaloneMCPServerPath(): string {
  const configuredPath = process.env.MCP_SERVER_ENTRYPOINT?.trim();
  if (configuredPath) {
    return configuredPath;
  }

  const candidates = [
    '/app/standalone-mcp-server/dist/server.js',
    path.resolve(
      fileURLToPath(
        new URL('../../../../standalone-mcp-server/dist/server.js', import.meta.url)
      )
    ),
    path.resolve(process.cwd(), 'standalone-mcp-server/dist/server.js'),
  ];

  const resolvedPath = candidates.find(candidate => existsSync(candidate));
  if (resolvedPath) {
    return resolvedPath;
  }

  throw new Error(
    'Unable to locate the standalone MCP server build. Set MCP_SERVER_ENTRYPOINT or build standalone-mcp-server/dist/server.js.'
  );
}

export async function initializeMCPClient() {
  if (!toolsPromise) {
    toolsPromise = (async () => {
      try {
        const serverPath = resolveStandaloneMCPServerPath();
        const mcpClient = new MCPClient({
          servers: {
            'brave-search': {
              command: 'node',
              args: [serverPath],
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
