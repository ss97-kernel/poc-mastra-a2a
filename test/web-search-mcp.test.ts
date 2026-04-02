import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('web search MCP execution', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('BRAVE_SEARCH_API_KEY', 'test-brave-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('uses the news MCP tool for news-search tasks', async () => {
    const execute = vi.fn(async () => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            results: [
              {
                title: 'OpenAI announces enterprise updates',
                url: 'https://example.com/openai-enterprise',
                snippet: 'OpenAI released new enterprise features.',
                source: 'example.com',
              },
            ],
            totalResults: 1,
            searchTime: 321,
          }),
        },
      ],
    }));

    vi.doMock('../agents/web-search/src/utils/mcpClient.ts', () => ({
      initializeMCPClient: vi.fn(async () => ({
        'brave-search_brave_news_search': { execute },
      })),
    }));

    const { performBraveSearch } = await import(
      '../agents/web-search/src/mastra/workflows/searchTaskWorkflow.ts'
    );

    const result = await performBraveSearch({
      type: 'news-search',
      query: 'OpenAI enterprise announcements',
      taskId: 'task-1',
    });

    expect(execute).toHaveBeenCalledWith(
      {
        query: 'latest news OpenAI enterprise announcements',
        count: 10,
      },
      {
        context: {
          messages: [],
        },
      }
    );

    expect(result).toEqual({
      query: 'latest news OpenAI enterprise announcements',
      searchType: 'news-search',
      totalResults: 1,
      searchTime: 321,
      results: [
        {
          title: 'OpenAI announces enterprise updates',
          url: 'https://example.com/openai-enterprise',
          snippet: 'OpenAI released new enterprise features.',
          source: 'example.com',
        },
      ],
    });
  });

  it('uses the web MCP tool for comprehensive search tasks', async () => {
    const execute = vi.fn(async () => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            results: [],
            totalResults: 0,
            searchTime: 777,
          }),
        },
      ],
    }));

    vi.doMock('../agents/web-search/src/utils/mcpClient.ts', () => ({
      initializeMCPClient: vi.fn(async () => ({
        'brave-search_brave_web_search': { execute },
      })),
    }));

    const { performBraveSearch } = await import(
      '../agents/web-search/src/mastra/workflows/searchTaskWorkflow.ts'
    );

    await performBraveSearch({
      type: 'comprehensive-search',
      query: 'AI agents in enterprise support',
      taskId: 'task-2',
      options: {},
    });

    expect(execute).toHaveBeenCalledWith(
      {
        query: 'AI agents in enterprise support',
        count: 15,
      },
      {
        context: {
          messages: [],
        },
      }
    );
  });

  it('normalizes prompt-style news queries before calling MCP', async () => {
    const execute = vi.fn(async () => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            results: [],
            totalResults: 0,
            searchTime: 123,
          }),
        },
      ],
    }));

    vi.doMock('../agents/web-search/src/utils/mcpClient.ts', () => ({
      initializeMCPClient: vi.fn(async () => ({
        'brave-search_brave_news_search': { execute },
      })),
    }));

    const { performBraveSearch } = await import(
      '../agents/web-search/src/mastra/workflows/searchTaskWorkflow.ts'
    );

    await performBraveSearch({
      type: 'news-search',
      query: 'Find recent news about Anthropic enterprise announcements.',
      taskId: 'task-3',
    });

    expect(execute).toHaveBeenCalledWith(
      {
        query: 'latest news Anthropic enterprise announcements',
        count: 10,
      },
      {
        context: {
          messages: [],
        },
      }
    );
  });

  it('falls back to broader MCP queries when the first news search is empty', async () => {
    const newsExecute = vi
      .fn()
      .mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              results: [],
              totalResults: 0,
              searchTime: 111,
            }),
          },
        ],
      })
      .mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              results: [],
              totalResults: 0,
              searchTime: 112,
            }),
          },
        ],
      })
      .mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              results: [],
              totalResults: 0,
              searchTime: 113,
            }),
          },
        ],
      });

    const webExecute = vi.fn(async () => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            results: [
              {
                title: 'Anthropic expands enterprise AI offering',
                url: 'https://example.com/anthropic-enterprise',
                snippet: 'Anthropic announced new enterprise features.',
                source: 'example.com',
              },
            ],
            totalResults: 1,
            searchTime: 211,
          }),
        },
      ],
    }));

    vi.doMock('../agents/web-search/src/utils/mcpClient.ts', () => ({
      initializeMCPClient: vi.fn(async () => ({
        'brave-search_brave_news_search': { execute: newsExecute },
        'brave-search_brave_web_search': { execute: webExecute },
      })),
    }));

    const { performBraveSearch } = await import(
      '../agents/web-search/src/mastra/workflows/searchTaskWorkflow.ts'
    );

    const result = await performBraveSearch({
      type: 'news-search',
      query: 'Find recent news about Anthropic enterprise announcements.',
      taskId: 'task-4',
    });

    expect(newsExecute).toHaveBeenCalledTimes(3);
    expect(webExecute).toHaveBeenCalledWith(
      {
        query: 'Anthropic enterprise',
        count: 10,
      },
      {
        context: {
          messages: [],
        },
      }
    );

    expect(result).toEqual({
      query: 'Anthropic enterprise',
      searchType: 'news-search',
      totalResults: 1,
      searchTime: 211,
      results: [
        {
          title: 'Anthropic expands enterprise AI offering',
          url: 'https://example.com/anthropic-enterprise',
          snippet: 'Anthropic announced new enterprise features.',
          source: 'example.com',
        },
      ],
    });
  });
});
