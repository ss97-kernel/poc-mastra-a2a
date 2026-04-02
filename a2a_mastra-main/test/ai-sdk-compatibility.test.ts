import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type AgentPackageExpectation = {
  name: string;
  packageJsonPath: string;
};

const agentPackages: AgentPackageExpectation[] = [
  {
    name: "gateway",
    packageJsonPath: join(process.cwd(), "agents/gateway/package.json")
  },
  {
    name: "data-processor",
    packageJsonPath: join(process.cwd(), "agents/data-processor/package.json")
  },
  {
    name: "summarizer",
    packageJsonPath: join(process.cwd(), "agents/summarizer/package.json")
  },
  {
    name: "web-search",
    packageJsonPath: join(process.cwd(), "agents/web-search/package.json")
  }
];

describe("AI SDK compatibility", () => {
  it.each(agentPackages)(
    "uses AI SDK v5-compatible OpenAI dependencies for $name",
    ({ packageJsonPath }) => {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
        dependencies?: Record<string, string>;
      };

      expect(packageJson.dependencies?.ai).toMatch(/^(\^|~)?5\./);
      expect(packageJson.dependencies?.["@ai-sdk/openai"]).toMatch(
        /^(\^|~)?3\./
      );
    }
  );
});
