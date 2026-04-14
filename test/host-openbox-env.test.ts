import { describe, expect, it } from "vitest";

import { applyDataProcessorOpenBoxEnv } from "../agents/data-processor/src/openboxEnv.ts";
import { applyGatewayOpenBoxEnv } from "../agents/gateway/src/openboxEnv.ts";
import { applySummarizerOpenBoxEnv } from "../agents/summarizer/src/openboxEnv.ts";
import { applyWebSearchOpenBoxEnv } from "../agents/web-search/src/openboxEnv.ts";

describe("host runtime OpenBox env mapping", () => {
  it("maps gateway-specific variables into the generic SDK variables", () => {
    const env: NodeJS.ProcessEnv = {
      OPENBOX_GATEWAY_API_KEY: "gateway-key",
      OPENBOX_GATEWAY_AGENT_DID: "did:aip:gateway",
      OPENBOX_GATEWAY_AGENT_PRIVATE_KEY: "gateway-private-key",
    };

    applyGatewayOpenBoxEnv(env);

    expect(env.OPENBOX_API_KEY).toBe("gateway-key");
    expect(env.OPENBOX_AGENT_DID).toBe("did:aip:gateway");
    expect(env.OPENBOX_AGENT_PRIVATE_KEY).toBe("gateway-private-key");
  });

  it("maps data-processor-specific variables into the generic SDK variables", () => {
    const env: NodeJS.ProcessEnv = {
      OPENBOX_DATA_PROCESSOR_API_KEY: "data-key",
      OPENBOX_DATA_PROCESSOR_AGENT_DID: "did:aip:data",
      OPENBOX_DATA_PROCESSOR_AGENT_PRIVATE_KEY: "data-private-key",
    };

    applyDataProcessorOpenBoxEnv(env);

    expect(env.OPENBOX_API_KEY).toBe("data-key");
    expect(env.OPENBOX_AGENT_DID).toBe("did:aip:data");
    expect(env.OPENBOX_AGENT_PRIVATE_KEY).toBe("data-private-key");
  });

  it("maps summarizer-specific variables into the generic SDK variables", () => {
    const env: NodeJS.ProcessEnv = {
      OPENBOX_SUMMARIZER_API_KEY: "summarizer-key",
      OPENBOX_SUMMARIZER_AGENT_DID: "did:aip:summarizer",
      OPENBOX_SUMMARIZER_AGENT_PRIVATE_KEY: "summarizer-private-key",
    };

    applySummarizerOpenBoxEnv(env);

    expect(env.OPENBOX_API_KEY).toBe("summarizer-key");
    expect(env.OPENBOX_AGENT_DID).toBe("did:aip:summarizer");
    expect(env.OPENBOX_AGENT_PRIVATE_KEY).toBe("summarizer-private-key");
  });

  it("maps web-search-specific variables into the generic SDK variables", () => {
    const env: NodeJS.ProcessEnv = {
      OPENBOX_WEB_SEARCH_API_KEY: "web-search-key",
      OPENBOX_WEB_SEARCH_AGENT_DID: "did:aip:web-search",
      OPENBOX_WEB_SEARCH_AGENT_PRIVATE_KEY: "web-search-private-key",
    };

    applyWebSearchOpenBoxEnv(env);

    expect(env.OPENBOX_API_KEY).toBe("web-search-key");
    expect(env.OPENBOX_AGENT_DID).toBe("did:aip:web-search");
    expect(env.OPENBOX_AGENT_PRIVATE_KEY).toBe("web-search-private-key");
  });

  it("preserves generic SDK variables when they are already set", () => {
    const env: NodeJS.ProcessEnv = {
      OPENBOX_API_KEY: "generic-key",
      OPENBOX_AGENT_DID: "did:aip:generic",
      OPENBOX_AGENT_PRIVATE_KEY: "generic-private-key",
      OPENBOX_DATA_PROCESSOR_API_KEY: "data-key",
      OPENBOX_DATA_PROCESSOR_AGENT_DID: "did:aip:data",
      OPENBOX_DATA_PROCESSOR_AGENT_PRIVATE_KEY: "data-private-key",
    };

    applyDataProcessorOpenBoxEnv(env);

    expect(env.OPENBOX_API_KEY).toBe("generic-key");
    expect(env.OPENBOX_AGENT_DID).toBe("did:aip:generic");
    expect(env.OPENBOX_AGENT_PRIVATE_KEY).toBe("generic-private-key");
  });
});
