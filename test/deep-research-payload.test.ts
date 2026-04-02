import { describe, expect, it } from "vitest";

import { buildResearchSynthesisPayload } from "../agents/gateway/src/mastra/workflows/deepResearchPayload.ts";
import { buildPrompt } from "../agents/summarizer/src/mastra/workflows/summarizationTaskWorkflow.ts";

describe("deep research synthesis payload", () => {
  it("compacts raw search and analysis data into bounded synthesis input", () => {
    const payload = buildResearchSynthesisPayload({
      topic: "AI agents in enterprise support",
      searchResult: {
        searchResults: "Search summary",
        query: "AI agents in enterprise support",
        rawResults: {
          searchType: "comprehensive-search",
          totalResults: 24,
          searchTime: 987,
          results: Array.from({ length: 12 }, (_, index) => ({
            title: `Source ${index + 1}`,
            url: `https://example.com/${index + 1}`,
            source: "example.com",
            publishedDate: "2026-04-01",
            snippet: "x".repeat(600),
          })),
        },
      },
      analysisResult: {
        result: "A".repeat(20_000),
        metadata: {
          processingType: "research-analysis",
        },
      },
    });

    expect(payload).toEqual(
      expect.objectContaining({
        topic: "AI agents in enterprise support",
        searchSummary: "Search summary",
        sourceHighlights: expect.any(Array),
        researchMetadata: expect.objectContaining({
          searchQuery: "AI agents in enterprise support",
          searchType: "comprehensive-search",
          totalResults: 24,
          searchTime: 987,
          analysisProcessingType: "research-analysis",
        }),
      })
    );
    expect(payload.sourceHighlights).toHaveLength(8);
    expect(payload.sourceHighlights[0]).toEqual(
      expect.objectContaining({
        title: "Source 1",
        url: "https://example.com/1",
      })
    );
    expect(payload.sourceHighlights[0]?.snippet?.length).toBeLessThanOrEqual(280);
    expect(payload.analysisSummary.length).toBeLessThanOrEqual(12_000);
  });

  it("builds a compact research synthesis prompt without raw payload dumps", () => {
    const prompt = buildPrompt({
      type: "research-synthesis",
      audienceType: "executive",
      data: {
        topic: "AI agents in enterprise support",
        searchSummary: "Search summary",
        analysisSummary: "Analysis summary",
        sourceHighlights: [
          {
            title: "OpenAI report",
            url: "https://example.com/openai",
            source: "example.com",
            snippet: "Source snippet",
          },
        ],
        researchMetadata: {
          searchQuery: "AI agents in enterprise support",
          totalResults: 15,
        },
      },
      options: {
        reportType: "comprehensive",
        includeRecommendations: true,
        includeSources: true,
      },
    });

    expect(prompt).toContain("Search summary:");
    expect(prompt).toContain("Analysis summary:");
    expect(prompt).toContain("Key sources:");
    expect(prompt).toContain("OpenAI report");
    expect(prompt).not.toContain("\"rawResults\"");
    expect(prompt).not.toContain("\"analysisResults\"");
  });
});
