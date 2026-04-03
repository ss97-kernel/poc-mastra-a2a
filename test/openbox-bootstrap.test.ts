import { Agent } from "@mastra/core/agent";
import { createMockModel } from "@mastra/core/test-utils/llm-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("OpenBox Mastra bootstrap", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock('@mastra/libsql', () => ({
      LibSQLStore: class {
        config: unknown;
        logger: unknown;

        constructor(config: unknown) {
          this.config = config;
        }

        async init() {
          return undefined;
        }

        __setLogger(logger: unknown) {
          this.logger = logger;
        }
      },
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("wraps the gateway Mastra instance with OpenBox", async () => {
    vi.stubEnv("AGENT_ID", "gateway-agent-test");
    const withOpenBox = vi.fn(async (mastra: unknown) => ({
      governed: true,
      original: mastra
    }));

    vi.doMock("@openbox-ai/openbox-mastra-sdk", () => ({
      withOpenBox
    }));
    vi.doMock(
      "../agents/gateway/src/mastra/agents/gatewayAgent.js",
      () => ({
        gatewayAgent: new Agent({
          id: "gateway-agent",
          instructions: "Route requests.",
          model: createMockModel({
            mockText: "routed",
            version: "v2"
          }),
          name: "Gateway Agent"
        })
      })
    );

    const module = await import("../agents/gateway/src/mastra/index.ts");

    expect(withOpenBox).toHaveBeenCalledTimes(1);
    expect(withOpenBox).toHaveBeenCalledWith(
      expect.objectContaining({
        getAgent: expect.any(Function)
      })
    );
    expect(module.mastra).toEqual({
      governed: true,
      original: expect.objectContaining({
        getAgent: expect.any(Function)
      })
    });
    expect(
      module.mastra.original.getWorkflow("gateway-process-request-workflow")
    ).toBeDefined();
    expect(
      module.mastra.original.getWorkflow("gateway-deep-research-workflow")
    ).toBeDefined();
  });

  it("wraps the data processor Mastra instance with OpenBox", async () => {
    vi.stubEnv("AGENT_ID", "data-processor-agent-test");
    const withOpenBox = vi.fn(async (mastra: unknown) => ({
      governed: true,
      original: mastra
    }));

    vi.doMock("@openbox-ai/openbox-mastra-sdk", () => ({
      withOpenBox
    }));
    vi.doMock(
      "../agents/data-processor/src/mastra/agents/dataProcessorAgent.js",
      () => ({
        dataProcessorAgent: new Agent({
          id: "data-processor-agent",
          instructions: "Process data.",
          model: createMockModel({
            mockText: "processed",
            version: "v2"
          }),
          name: "Data Processor Agent"
        })
      })
    );

    const module = await import("../agents/data-processor/src/mastra/index.ts");

    expect(withOpenBox).toHaveBeenCalledTimes(1);
    expect(withOpenBox).toHaveBeenCalledWith(
      expect.objectContaining({
        getAgent: expect.any(Function)
      })
    );
    expect(module.mastra).toEqual({
      governed: true,
      original: expect.objectContaining({
        getAgent: expect.any(Function)
      })
    });
    expect(
      module.mastra.original.getWorkflow("data-processor-task-workflow")
    ).toBeDefined();
  });

  it("wraps the summarizer Mastra instance with OpenBox", async () => {
    vi.stubEnv("AGENT_ID", "summarizer-agent-test");
    const withOpenBox = vi.fn(async (mastra: unknown) => ({
      governed: true,
      original: mastra
    }));

    vi.doMock("@openbox-ai/openbox-mastra-sdk", () => ({
      withOpenBox
    }));
    vi.doMock(
      "../agents/summarizer/src/mastra/agents/summarizerAgent.js",
      () => ({
        summarizerAgent: new Agent({
          id: "summarizer-agent",
          instructions: "Summarize content.",
          model: createMockModel({
            mockText: "summary",
            version: "v2"
          }),
          name: "Summarizer Agent"
        })
      })
    );

    const module = await import("../agents/summarizer/src/mastra/index.ts");

    expect(withOpenBox).toHaveBeenCalledTimes(1);
    expect(withOpenBox).toHaveBeenCalledWith(
      expect.objectContaining({
        getAgent: expect.any(Function)
      })
    );
    expect(module.mastra).toEqual({
      governed: true,
      original: expect.objectContaining({
        getAgent: expect.any(Function)
      })
    });
    expect(
      module.mastra.original.getWorkflow("summarizer-task-workflow")
    ).toBeDefined();
  });

  it("wraps the web search Mastra instance with OpenBox", async () => {
    vi.stubEnv("AGENT_ID", "web-search-agent-test");
    const withOpenBox = vi.fn(async (mastra: unknown) => ({
      governed: true,
      original: mastra
    }));

    vi.doMock("@openbox-ai/openbox-mastra-sdk", () => ({
      withOpenBox
    }));
    vi.doMock(
      "../agents/web-search/src/mastra/agents/webSearchAgent.js",
      () => ({
        createWebSearchAgent: vi.fn(async () =>
          new Agent({
            id: "web-search-agent",
            instructions: "Search the web.",
            model: createMockModel({
              mockText: "results",
              version: "v2"
            }),
            name: "Web Search Agent"
          })
        )
      })
    );

    const module = await import("../agents/web-search/src/mastra/index.ts");

    expect(withOpenBox).toHaveBeenCalledTimes(1);
    expect(withOpenBox).toHaveBeenCalledWith(
      expect.objectContaining({
        getAgent: expect.any(Function)
      })
    );
    expect(module.mastra).toEqual({
      governed: true,
      original: expect.objectContaining({
        getAgent: expect.any(Function)
      })
    });
    expect(
      module.mastra.original.getWorkflow("web-search-task-workflow")
    ).toBeDefined();
    expect(
      module.mastra.original.getWorkflow("web-search-orchestration-workflow")
    ).toBeDefined();
  });
});
