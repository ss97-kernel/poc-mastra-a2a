import { afterEach, describe, expect, it, vi } from 'vitest';

const DOCKER_MCP_SERVER_PATH = '/app/standalone-mcp-server/dist/server.js';

async function loadSubject(
  existsSyncImpl?: (candidate: string) => boolean
) {
  vi.resetModules();
  vi.doMock('node:fs', () => ({
    existsSync: vi.fn((candidate: string) =>
      existsSyncImpl ? existsSyncImpl(candidate) : false
    ),
  }));

  return import('../agents/web-search/src/utils/mcpClient.ts');
}

describe('resolveStandaloneMCPServerPath', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    vi.doUnmock('node:fs');
  });

  it('prefers MCP_SERVER_ENTRYPOINT when configured', async () => {
    vi.stubEnv('MCP_SERVER_ENTRYPOINT', '/tmp/custom-mcp-server.js');

    const { resolveStandaloneMCPServerPath } = await loadSubject();

    expect(resolveStandaloneMCPServerPath()).toBe('/tmp/custom-mcp-server.js');
  });

  it('uses the Docker MCP server build when available', async () => {
    const { resolveStandaloneMCPServerPath } = await loadSubject(
      candidate => candidate === DOCKER_MCP_SERVER_PATH
    );

    expect(resolveStandaloneMCPServerPath()).toBe(DOCKER_MCP_SERVER_PATH);
  });

  it('falls back to the repository-relative MCP server build outside Docker', async () => {
    const { resolveStandaloneMCPServerPath } = await loadSubject(
      candidate =>
        candidate !== DOCKER_MCP_SERVER_PATH &&
        candidate.endsWith('/standalone-mcp-server/dist/server.js')
    );

    expect(resolveStandaloneMCPServerPath()).toContain(
      '/standalone-mcp-server/dist/server.js'
    );
    expect(resolveStandaloneMCPServerPath()).not.toBe(DOCKER_MCP_SERVER_PATH);
  });

  it('throws a clear error when no MCP server build is available', async () => {
    const { resolveStandaloneMCPServerPath } = await loadSubject();

    expect(() => resolveStandaloneMCPServerPath()).toThrow(
      /Unable to locate the standalone MCP server build/
    );
  });
});
