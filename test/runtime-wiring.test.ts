import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(import.meta.dirname, "..");

const agentPackages = [
  "agents/gateway/package.json",
  "agents/data-processor/package.json",
  "agents/summarizer/package.json",
  "agents/web-search/package.json"
];

const agentDockerfiles = [
  "agents/gateway/Dockerfile",
  "agents/data-processor/Dockerfile",
  "agents/summarizer/Dockerfile",
  "agents/web-search/Dockerfile"
];

describe("OpenBox runtime wiring", () => {
  it.each(agentPackages)(
    "declares the OpenBox SDK dependency in %s",
    packagePath => {
      const pkg = JSON.parse(
        readFileSync(resolve(REPO_ROOT, packagePath), "utf8")
      ) as {
        dependencies?: Record<string, string>;
      };

      expect(pkg.dependencies?.["@openbox-ai/openbox-mastra-sdk"]).toBeDefined();
      expect(pkg.dependencies?.["@openbox-ai/openbox-mastra-sdk"]).not.toContain(
        "file:"
      );
    }
  );

  it("documents the shared OpenBox URL and per-agent API keys", () => {
    const envExample = readFileSync(resolve(REPO_ROOT, ".env.example"), "utf8");

    expect(envExample).toContain("GATEWAY_URL=");
    expect(envExample).toContain("OPENBOX_URL=");
    expect(envExample).toContain("OPENBOX_GATEWAY_API_KEY=");
    expect(envExample).toContain("OPENBOX_DATA_PROCESSOR_API_KEY=");
    expect(envExample).toContain("OPENBOX_SUMMARIZER_API_KEY=");
    expect(envExample).toContain("OPENBOX_WEB_SEARCH_API_KEY=");
    expect(envExample).toContain("OPENBOX_GATEWAY_AGENT_DID=");
    expect(envExample).toContain("OPENBOX_GATEWAY_AGENT_PRIVATE_KEY=");
    expect(envExample).toContain("OPENBOX_DATA_PROCESSOR_AGENT_DID=");
    expect(envExample).toContain("OPENBOX_DATA_PROCESSOR_AGENT_PRIVATE_KEY=");
    expect(envExample).toContain("OPENBOX_SUMMARIZER_AGENT_DID=");
    expect(envExample).toContain("OPENBOX_SUMMARIZER_AGENT_PRIVATE_KEY=");
    expect(envExample).toContain("OPENBOX_WEB_SEARCH_AGENT_DID=");
    expect(envExample).toContain("OPENBOX_WEB_SEARCH_AGENT_PRIVATE_KEY=");
  });

  it("passes OpenBox settings into each runtime through docker-compose", () => {
    const compose = readFileSync(
      resolve(REPO_ROOT, "docker-compose.yml"),
      "utf8"
    );

    expect(compose).toContain("OPENBOX_URL=${OPENBOX_URL}");
    expect(compose).toContain(
      "OPENBOX_API_KEY=${OPENBOX_GATEWAY_API_KEY}"
    );
    expect(compose).toContain(
      "OPENBOX_AGENT_DID=${OPENBOX_GATEWAY_AGENT_DID:-}"
    );
    expect(compose).toContain(
      "OPENBOX_AGENT_PRIVATE_KEY=${OPENBOX_GATEWAY_AGENT_PRIVATE_KEY:-}"
    );
    expect(compose).toContain(
      "OPENBOX_API_KEY=${OPENBOX_DATA_PROCESSOR_API_KEY}"
    );
    expect(compose).toContain(
      "OPENBOX_AGENT_DID=${OPENBOX_DATA_PROCESSOR_AGENT_DID:-}"
    );
    expect(compose).toContain(
      "OPENBOX_AGENT_PRIVATE_KEY=${OPENBOX_DATA_PROCESSOR_AGENT_PRIVATE_KEY:-}"
    );
    expect(compose).toContain(
      "OPENBOX_API_KEY=${OPENBOX_SUMMARIZER_API_KEY}"
    );
    expect(compose).toContain(
      "OPENBOX_AGENT_DID=${OPENBOX_SUMMARIZER_AGENT_DID:-}"
    );
    expect(compose).toContain(
      "OPENBOX_AGENT_PRIVATE_KEY=${OPENBOX_SUMMARIZER_AGENT_PRIVATE_KEY:-}"
    );
    expect(compose).toContain(
      "OPENBOX_API_KEY=${OPENBOX_WEB_SEARCH_API_KEY}"
    );
    expect(compose).toContain(
      "OPENBOX_AGENT_DID=${OPENBOX_WEB_SEARCH_AGENT_DID:-}"
    );
    expect(compose).toContain(
      "OPENBOX_AGENT_PRIVATE_KEY=${OPENBOX_WEB_SEARCH_AGENT_PRIVATE_KEY:-}"
    );
  });

  it.each(agentDockerfiles)(
    "uses a Node 24 image and installs the published SDK via npm in %s",
    dockerfilePath => {
      const dockerfile = readFileSync(
        resolve(REPO_ROOT, dockerfilePath),
        "utf8"
      );

      expect(dockerfile).toContain("FROM node:24.10.0-alpine");
      expect(dockerfile).toContain("RUN npm install");
      expect(dockerfile).not.toContain("COPY openbox-mastra-sdk");
    }
  );

  it("lets the frontend proxy through a configurable gateway URL", () => {
    const nextConfig = readFileSync(
      resolve(REPO_ROOT, "frontend/next.config.ts"),
      "utf8"
    );

    expect(nextConfig).toContain(
      "const gatewayUrl = process.env.GATEWAY_URL || 'http://gateway:3001'"
    );
    expect(nextConfig).toContain("destination: `${gatewayUrl}/api/:path*`");
  });
});
