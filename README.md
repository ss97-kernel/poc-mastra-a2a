# OpenBox Mastra A2A Demo
This repository is a fork of https://github.com/tubone24/a2a_mastra 

This repository is a public proof of concept for governed multi-agent systems built with:

- Mastra
- the A2A protocol
- `@openbox-ai/openbox-mastra-sdk`
- OpenAI
- OpenBox
- Brave Search via MCP

The demo exposes a prompt-only UI. A gateway agent classifies each user request, routes it to the right specialist agent, and returns the result through a single web application.

![Demo](docs/images/demo.gif)

## What The Demo Includes

The stack runs four agent services plus a frontend:

- `gateway`: intent resolution, routing, and deep-research orchestration
- `data-processor`: structured data processing and analysis
- `summarizer`: summaries, executive writeups, and research synthesis
- `web-search`: Brave Search through MCP plus search-result summarization
- `frontend`: prompt-driven web UI

## Requirements

- Docker Desktop
- Node.js 24.10+ if you want to run tests locally
- OpenAI API key
- OpenBox deployment
- four OpenBox API keys, one for each runtime
- Brave Search API key if you want search or deep-research flows
- Langfuse credentials if you want tracing

## Quick Start

1. Copy the example environment file:

```bash
cp .env.example .env
```

2. Fill the required values in [`.env`](./.env):

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4.1-mini

OPENBOX_URL=http://host.docker.internal:8787
OPENBOX_GATEWAY_API_KEY=...
OPENBOX_DATA_PROCESSOR_API_KEY=...
OPENBOX_SUMMARIZER_API_KEY=...
OPENBOX_WEB_SEARCH_API_KEY=...
```

3. Add optional values if you want search or tracing:

```env
BRAVE_SEARCH_API_KEY=...
LANGFUSE_PUBLIC_KEY=...
LANGFUSE_SECRET_KEY=...
LANGFUSE_BASEURL=https://cloud.langfuse.com
```

4. Build the images:

```bash
npm run build
```

5. Start the demo:

```bash
npm run dev
```

6. Open the UI:

- frontend: `http://localhost:3000`
- gateway health: `http://localhost:3001/health`

Stop the stack with:

```bash
npm run stop
```

## What To Put In OpenBox

Register each runtime separately in OpenBox and use one API key per runtime:

- `gateway-agent-01`
- `data-processor-agent-01`
- `summarizer-agent-01`
- `web-search-agent-01`

This demo is intentionally multi-runtime. Gateway and child agents appear as separate governed services in OpenBox.

## What To Test In The UI

The UI accepts a plain prompt. The gateway resolves the intent and routes automatically.

Prompts that work well:

1. `Summarize the business impact of rising cloud costs for an executive audience.`
2. `Analyze this support data and explain the main trends: {"support":[{"week":"W1","resolved":84,"opened":91},{"week":"W2","resolved":95,"opened":88},{"week":"W3","resolved":103,"opened":90}]}`
3. `Find recent news about OpenAI product announcements.`
4. `Find academic research on retrieval augmented generation evaluation methods.`
5. `Research AI agents in enterprise support and produce a detailed report with sources.`

Expected routing:

- summary prompts -> `summarizer`
- structured analysis prompts -> `data-processor`, sometimes followed by `summarizer`
- current events or web lookup prompts -> `web-search`
- broad research prompts -> `gateway` orchestrating `web-search`, `data-processor`, and `summarizer`

## OpenBox Expectations

What you should see in OpenBox after a few demo requests:

- `gateway` runs for all prompt submissions
- `data-processor` runs for analysis and deep-research analysis steps
- `summarizer` runs for summary and research-synthesis steps
- `web-search` runs for search and deep-research search steps

Only `web-search` should show MCP-backed search activity. `data-processor` and `summarizer` are model-only services and do not expose tool health.

For more detail, see [docs/openbox-observability.md](./docs/openbox-observability.md).

## Public Package Usage

This POC consumes the published OpenBox Mastra SDK from npm:

```text
@openbox-ai/openbox-mastra-sdk@0.1.0
```

You do not need a sibling checkout of the SDK repository to build or run this demo.

## Repository Structure

```text
agents/
  gateway/
  data-processor/
  summarizer/
  web-search/
frontend/
standalone-mcp-server/
docs/
```

## Local Validation

Run the automated checks locally with:

```bash
npm test
npm run build --workspace @a2a-demo/gateway-agent
npm run build --workspace @a2a-demo/data-processor-agent
npm run build --workspace @a2a-demo/summarizer-agent
npm run build --workspace @a2a-demo/web-search-agent
```

## Troubleshooting

- If OpenBox shows no traffic, make sure `OPENBOX_URL` is reachable from Docker containers. `localhost` is usually wrong inside containers.
- If search requests fail, check that `BRAVE_SEARCH_API_KEY` is set.
- If deep research fails on large payloads, increase `A2A_JSON_BODY_LIMIT` in [`.env`](./.env).
- If the UI loads but requests fail, inspect the gateway logs:

```bash
docker compose --env-file .env logs -f gateway
```

- To watch all agent logs:

```bash
docker compose --env-file .env logs -f gateway data-processor summarizer web-search
```

## Additional Docs

- [docs/running-the-demo.md](./docs/running-the-demo.md)
- [docs/openbox-observability.md](./docs/openbox-observability.md)
