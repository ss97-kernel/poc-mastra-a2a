import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type RemoteModuleCase = {
  title: string;
  modulePath: string;
  agentId: string;
  port: string;
  dependencyPath: string;
  dependencyFactory: () => Record<string, unknown>;
};

const remoteModuleCases: RemoteModuleCase[] = [
  {
    title: "data processor",
    modulePath: "../agents/data-processor/src/mastra/index.ts",
    agentId: "data-processor-agent-test",
    port: "3002",
    dependencyPath: "../agents/data-processor/src/mastra/agents/dataProcessorAgent.js",
    dependencyFactory: () => ({
      dataProcessorAgent: { id: "data-processor-agent" }
    })
  },
  {
    title: "summarizer",
    modulePath: "../agents/summarizer/src/mastra/index.ts",
    agentId: "summarizer-agent-test",
    port: "3003",
    dependencyPath: "../agents/summarizer/src/mastra/agents/summarizerAgent.js",
    dependencyFactory: () => ({
      summarizerAgent: { id: "summarizer-agent" }
    })
  },
  {
    title: "web search",
    modulePath: "../agents/web-search/src/mastra/index.ts",
    agentId: "web-search-agent-test",
    port: "3004",
    dependencyPath: "../agents/web-search/src/mastra/agents/webSearchAgent.js",
    dependencyFactory: () => ({
      createWebSearchAgent: vi.fn(async () => ({ id: "web-search-agent" }))
    })
  }
];

describe("remote Mastra server binding", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it.each(remoteModuleCases)(
    "binds the $title Mastra server to 0.0.0.0 on the configured port",
    async testCase => {
      vi.stubEnv("AGENT_ID", testCase.agentId);
      vi.stubEnv("PORT", testCase.port);

      const mastraConstructor = vi.fn(function Mastra(
        this: Record<string, unknown>,
        config: Record<string, unknown>
      ) {
        this.config = config;
        this.getAgent = vi.fn();
      });

      const withOpenBox = vi.fn(async (mastra: unknown) => mastra);

      vi.doMock("@mastra/core/mastra", () => ({
        Mastra: mastraConstructor
      }));
      vi.doMock("@openbox-ai/openbox-mastra-sdk", () => ({
        withOpenBox
      }));
      vi.doMock(testCase.dependencyPath, testCase.dependencyFactory);

      await import(testCase.modulePath);

      expect(mastraConstructor).toHaveBeenCalledTimes(1);
      expect(mastraConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          server: {
            host: "0.0.0.0",
            port: Number.parseInt(testCase.port, 10)
          }
        })
      );
      expect(withOpenBox).toHaveBeenCalledTimes(1);
    }
  );
});
