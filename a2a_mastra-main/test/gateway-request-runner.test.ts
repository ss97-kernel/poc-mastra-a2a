import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("gateway request workflow runner", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("routes process requests through the process workflow", async () => {
    const start = vi.fn(async () => ({ result: { ok: true } }));
    const createRun = vi.fn(async () => ({ start }));
    const getWorkflow = vi.fn(() => ({ createRun }));
    const getAgent = vi.fn();

    vi.doMock("../agents/gateway/src/mastra/index.js", () => ({
      mastra: {
        getWorkflow,
        getAgent,
      },
    }));

    const { runGatewayRequestWorkflow } = await import(
      "../agents/gateway/src/mastra/workflows/requestWorkflowRunner.ts"
    );

    const result = await runGatewayRequestWorkflow({
      type: "process",
      data: { sales: [1, 2, 3] },
    });

    expect(getWorkflow).toHaveBeenCalledWith(
      "gateway-process-request-workflow"
    );
    expect(createRun).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith({
      inputData: [
        expect.objectContaining({
          type: "process",
        }),
      ],
    });
    expect(result).toEqual({ ok: true });
    expect(getAgent).not.toHaveBeenCalled();
  });

  it("routes search requests through the shared search workflow", async () => {
    const start = vi.fn(async () => ({ result: { ok: "search" } }));
    const createRun = vi.fn(async () => ({ start }));
    const getWorkflow = vi.fn(() => ({ createRun }));
    const getAgent = vi.fn();

    vi.doMock("../agents/gateway/src/mastra/index.js", () => ({
      mastra: {
        getWorkflow,
        getAgent,
      },
    }));

    const { runGatewayRequestWorkflow } = await import(
      "../agents/gateway/src/mastra/workflows/requestWorkflowRunner.ts"
    );

    const result = await runGatewayRequestWorkflow({
      type: "news-search",
      query: "latest agentic ai news",
    });

    expect(getWorkflow).toHaveBeenCalledWith(
      "gateway-search-request-workflow"
    );
    expect(start).toHaveBeenCalledWith({
      inputData: [
        expect.objectContaining({
          type: "news-search",
        }),
      ],
    });
    expect(result).toEqual({ ok: "search" });
    expect(getAgent).not.toHaveBeenCalled();
  });

  it("uses the governed gateway agent to resolve prompt-only requests", async () => {
    const start = vi.fn(async () => ({ result: { ok: "summary" } }));
    const createRun = vi.fn(async () => ({ start }));
    const getWorkflow = vi.fn(() => ({ createRun }));
    const generate = vi.fn(async () => ({
      text: JSON.stringify({
        type: "summarize",
        reason:
          "The user asked for a concise summary rather than analysis or search.",
      }),
    }));
    const getAgent = vi.fn(() => ({ generate }));

    vi.doMock("../agents/gateway/src/mastra/index.js", () => ({
      mastra: {
        getWorkflow,
        getAgent,
      },
    }));

    const {
      resolveGatewayRequestSubmission,
      runResolvedGatewayRequestWorkflow,
    } = await import(
      "../agents/gateway/src/mastra/workflows/requestWorkflowRunner.ts"
    );

    const resolved = await resolveGatewayRequestSubmission({
      prompt: "Summarize the payment incident for an executive audience.",
      audienceType: "executive",
    });

    expect(getAgent).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith([
      expect.objectContaining({
        role: "user",
        content: expect.stringContaining(
          "Summarize the payment incident for an executive audience."
        ),
      }),
    ]);
    expect(resolved).toEqual(
      expect.objectContaining({
        type: "summarize",
        data: "Summarize the payment incident for an executive audience.",
        audienceType: "executive",
      })
    );

    const result = await runResolvedGatewayRequestWorkflow(resolved);

    expect(getWorkflow).toHaveBeenCalledWith(
      "gateway-summarize-request-workflow"
    );
    expect(start).toHaveBeenCalledWith({
      inputData: [
        expect.objectContaining({
          type: "summarize",
          data: "Summarize the payment incident for an executive audience.",
        }),
      ],
    });
    expect(result).toEqual({ ok: "summary" });
  });

  it("falls back to heuristic routing when the gateway agent returns invalid intent output", async () => {
    const getWorkflow = vi.fn();
    const generate = vi.fn(async () => ({
      text: "route this somewhere sensible",
    }));
    const getAgent = vi.fn(() => ({ generate }));

    vi.doMock("../agents/gateway/src/mastra/index.js", () => ({
      mastra: {
        getWorkflow,
        getAgent,
      },
    }));

    const { resolveGatewayRequestSubmission } = await import(
      "../agents/gateway/src/mastra/workflows/requestWorkflowRunner.ts"
    );

    const resolved = await resolveGatewayRequestSubmission({
      prompt: "Find recent news about Anthropic enterprise announcements.",
    });

    expect(resolved).toEqual(
      expect.objectContaining({
        type: "news-search",
        query: "Find recent news about Anthropic enterprise announcements.",
      })
    );
  });
});
