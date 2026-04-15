import { afterEach, describe, expect, it, vi } from 'vitest';

describe('gateway A2A peer metadata', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('sends OpenBox A2A headers on outbound inter-agent requests', async () => {
    vi.stubEnv('AGENT_ID', 'gateway-agent-01');
    vi.stubEnv('OPENBOX_AGENT_DID', 'did:aip:gateway');
    vi.stubEnv('SUMMARIZER_URL', 'http://summarizer.local');
    vi.stubEnv('SUMMARIZER_AGENT_ID', 'summarizer-agent-01');

    const fetchMock = vi.fn(async () => ({
      json: async () => ({
        task: {
          id: 'task-1',
          status: {
            state: 'completed',
          },
        },
      }),
      ok: true,
    }));
    vi.stubGlobal('fetch', fetchMock as typeof fetch);

    const { sendA2AMessage } = await import(
      '../agents/gateway/src/utils/mastraA2AClient.ts'
    );

    await sendA2AMessage('summarizer', {
      type: 'summarize',
      data: { value: 'hello' },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0]!;
    const headers = options?.headers as Record<string, string>;

    expect(headers['x-openbox-a2a-request-id']).toBeTruthy();
    expect(headers['x-openbox-a2a-source-agent-id']).toBe(
      'gateway-agent-01'
    );
    expect(headers['x-openbox-a2a-source-agent-did']).toBe(
      'did:aip:gateway'
    );
    expect(headers['x-openbox-a2a-target-agent-id']).toBe(
      'summarizer-agent-01'
    );
    expect(headers['x-openbox-a2a-target-agent-type']).toBe('summarizer');
  });
});
