import { describe, expect, it } from "vitest";
import {
  assertA2ASuccess,
  extractA2AResult,
  extractA2ASearchResult,
  getA2AErrorMessage
} from "../agents/gateway/src/utils/a2aResponse.js";

describe("A2A response utilities", () => {
  it("extracts JSON-RPC error messages", () => {
    expect(
      getA2AErrorMessage({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "OpenAI request failed"
        }
      })
    ).toBe("OpenAI request failed");
  });

  it("extracts failed task status messages", () => {
    expect(
      getA2AErrorMessage({
        task: {
          status: {
            state: "failed",
            message: {
              parts: [{ text: "Summarization failed" }]
            }
          }
        }
      })
    ).toBe("Summarization failed");
  });

  it("throws when the A2A payload contains an error", () => {
    expect(() =>
      assertA2ASuccess({
        error: {
          message: "Agent execution failed"
        }
      })
    ).toThrow("Agent execution failed");
  });

  it("extracts the first artifact payload for successful responses", () => {
    expect(
      extractA2AResult({
        task: {
          artifacts: [
            {
              type: "result",
              data: { rows: 3 }
            }
          ]
        }
      })
    ).toEqual({ rows: 3 });
  });

  it("normalizes search-result artifacts", () => {
    expect(
      extractA2ASearchResult({
        task: {
          artifacts: [
            {
              type: "search-result",
              data: {
                summary: "Latest news summary",
                rawResults: { items: [] },
                query: "latest ai news"
              },
              metadata: {
                provider: "brave"
              }
            }
          ]
        }
      })
    ).toEqual({
      searchResults: "Latest news summary",
      rawResults: { items: [] },
      query: "latest ai news",
      metadata: {
        provider: "brave"
      }
    });
  });

  it("falls back to legacy fullResponse search artifacts", () => {
    expect(
      extractA2ASearchResult({
        task: {
          artifacts: [
            {
              type: "search-result",
              data: {
                summary: "Legacy summary",
                fullResponse: { items: [{ title: "old" }] },
                query: "legacy ai news"
              }
            }
          ]
        }
      })
    ).toEqual({
      searchResults: "Legacy summary",
      rawResults: { items: [{ title: "old" }] },
      query: "legacy ai news",
      metadata: undefined
    });
  });
});
