import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("OpenAI model config", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("uses OpenAI models from env", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("OPENAI_MODEL", "gpt-4.1-mini");

    const openAIModel = { provider: "openai-model" };
    const openAIFactory = vi.fn(() => openAIModel);
    const createOpenAI = vi.fn(() => openAIFactory);

    vi.doMock("@ai-sdk/openai", () => ({
      createOpenAI,
    }));

    const module = await import("../agents/gateway/src/config/model.ts");

    expect(module.getLanguageModel()).toBe(openAIModel);
    expect(module.getOpenAIModel()).toBe(openAIModel);
    expect(createOpenAI).toHaveBeenCalledWith({
      apiKey: "sk-test",
    });
    expect(openAIFactory).toHaveBeenCalledWith("gpt-4.1-mini");
  });

  it("defaults to gpt-4.1-mini when OPENAI_MODEL is unset", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");

    const openAIModel = { provider: "openai-default-model" };
    const openAIFactory = vi.fn(() => openAIModel);
    const createOpenAI = vi.fn(() => openAIFactory);

    vi.doMock("@ai-sdk/openai", () => ({
      createOpenAI,
    }));

    const module = await import("../agents/gateway/src/config/model.ts");

    expect(module.getLanguageModel()).toBe(openAIModel);
    expect(openAIFactory).toHaveBeenCalledWith("gpt-4.1-mini");
  });

  it("fails fast when OPENAI_API_KEY is missing", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");

    vi.doMock("@ai-sdk/openai", () => ({
      createOpenAI: vi.fn(() => vi.fn()),
    }));

    const module = await import("../agents/gateway/src/config/model.ts");

    expect(() => module.getLanguageModel()).toThrow("OPENAI_API_KEY is required");
  });
});
