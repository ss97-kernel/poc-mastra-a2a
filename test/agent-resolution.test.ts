import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function mockLangfuse() {
  vi.doMock("langfuse", () => ({
    Langfuse: class {
      public trace() {
        return {
          id: "trace-123",
          event: vi.fn(),
          generation: vi.fn(() => ({
            end: vi.fn()
          }))
        };
      }
    }
  }));
}

describe("governed agent resolution", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("uses the governed data processor agent from Mastra", async () => {
    vi.stubEnv("AGENT_ID", "data-processor-agent-test");
    const generate = vi.fn(async () => ({
      text: "processed output",
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15
      },
      response: {
        modelId: "gpt-4.1-mini"
      }
    }));
    const getAgent = vi.fn(() => ({
      generate
    }));

    mockLangfuse();
    vi.doMock("../agents/data-processor/src/mastra/index.js", () => ({
      mastra: {
        getAgent
      }
    }));

    const module = await import(
      "../agents/data-processor/src/mastra/workflows/taskProcessor.ts"
    );

    const result = await module.processTask(
      {
        type: "process",
        data: { input: "demo" }
      },
      "task-1"
    );

    expect(getAgent).toHaveBeenCalledWith("data-processor-agent-test");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith([
      expect.objectContaining({
        role: "user",
        content: expect.stringContaining("Process and analyze the following data")
      })
    ]);
    expect(result).toEqual(
      expect.objectContaining({
        task: expect.objectContaining({
          id: "task-1",
          artifacts: [
            expect.objectContaining({
              metadata: expect.objectContaining({
                usage: expect.objectContaining({
                  totalTokens: 15
                }),
                modelId: "gpt-4.1-mini"
              })
            })
          ]
        })
      })
    );
  });

  it("uses the governed summarizer agent from Mastra", async () => {
    vi.stubEnv("AGENT_ID", "summarizer-agent-test");
    const generate = vi.fn(async () => ({
      text: "summary output",
      usage: {
        inputTokens: 20,
        outputTokens: 8,
        totalTokens: 28
      },
      response: {
        modelId: "gpt-4.1-mini"
      }
    }));
    const getAgent = vi.fn(() => ({
      generate
    }));

    mockLangfuse();
    vi.doMock("../agents/summarizer/src/mastra/index.js", () => ({
      mastra: {
        getAgent
      }
    }));

    const module = await import(
      "../agents/summarizer/src/mastra/workflows/summarizationTaskProcessor.ts"
    );

    const result = await module.processSummarizationTask(
      {
        type: "summarize",
        data: { input: "demo" }
      },
      "task-2"
    );

    expect(getAgent).toHaveBeenCalledWith("summarizer-agent-test");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith([
      expect.objectContaining({
        role: "user",
        content: expect.stringContaining("Create a comprehensive summary")
      })
    ]);
    expect(result).toEqual(
      expect.objectContaining({
        task: expect.objectContaining({
          id: "task-2",
          artifacts: [
            expect.objectContaining({
              metadata: expect.objectContaining({
                usage: expect.objectContaining({
                  totalTokens: 28
                }),
                modelId: "gpt-4.1-mini"
              })
            })
          ]
        })
      })
    );
  });

  it("uses the governed web search agent from Mastra", async () => {
    vi.stubEnv("AGENT_ID", "web-search-agent-test");
    const generate = vi.fn(async () => ({
      text: "search result summary",
      usage: {
        inputTokens: 30,
        outputTokens: 12,
        totalTokens: 42
      },
      response: {
        modelId: "gpt-4.1-mini"
      }
    }));
    const start = vi.fn(async () => ({
      result: {
        query: "latest AI infrastructure trends",
        searchType: "web-search",
        totalResults: 2,
        searchTime: 150,
        results: [
          {
            title: "Example result",
            url: "https://example.com",
            snippet: "Example snippet"
          }
        ]
      }
    }));
    const createRun = vi.fn(async () => ({ start }));
    const getAgent = vi.fn(() => ({
      generate
    }));
    const getWorkflow = vi.fn(() => ({
      createRun
    }));

    mockLangfuse();
    vi.doMock("../agents/web-search/src/mastra/index.js", () => ({
      mastra: {
        getAgent,
        getWorkflow
      }
    }));

    const module = await import(
      "../agents/web-search/src/mastra/workflows/searchTaskProcessor.ts"
    );

    const result = await module.processSearchTask(
      {
        type: "web-search",
        query: "latest AI infrastructure trends"
      },
      "task-3",
      undefined
    );

    expect(getAgent).toHaveBeenCalledWith("web-search-agent-test");
    expect(getWorkflow).toHaveBeenCalledWith("web-search-task-workflow");
    expect(start).toHaveBeenCalledWith({
      inputData: [
        expect.objectContaining({
          type: "web-search",
          query: "latest AI infrastructure trends",
          taskId: "task-3"
        })
      ]
    });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith([
      expect.objectContaining({
        role: "user",
        content: expect.stringContaining("Search results:")
      })
    ]);
    expect(result).toEqual(
      expect.objectContaining({
        task: expect.objectContaining({
          id: "task-3",
          artifacts: [
            expect.objectContaining({
              metadata: expect.objectContaining({
                usage: expect.objectContaining({
                  totalTokens: 42
                }),
                modelId: "gpt-4.1-mini"
              })
            })
          ]
        })
      })
    );
  });
});
