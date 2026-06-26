# OpenBox Observability Guide

This demo registers each runtime separately in OpenBox.

## Agents To Register

Create one OpenBox agent and one API key for each runtime:

- `gateway-agent-01`
- `data-processor-agent-01`
- `summarizer-agent-01`
- `web-search-agent-01`

Each service receives its own API key through `.env`.

## What You Should See

### Gateway

The gateway handles every prompt submission. In OpenBox it should show:

- request classification and routing runs
- orchestration activity for deep research
- outbound inter-agent call activity

### Data Processor

The data processor should appear for:

- structured analysis prompts
- deep-research analysis stages

It is a model-driven service, so expect model usage telemetry rather than tool activity.

### Summarizer

The summarizer should appear for:

- summary prompts
- synthesis stages in deep research

It is also model-driven rather than tool-driven.

### Web Search

The web-search runtime should appear for:

- web-search prompts
- news-search prompts
- scholarly-search prompts
- deep-research search stages

This is the service that should show MCP-backed operational activity because it calls Brave Search through the standalone MCP server.

## Expected Flow By Prompt Type

### Summary Prompt

- `gateway`
- `summarizer`

### Analysis Prompt

- `gateway`
- `data-processor`
- sometimes `summarizer`

### Search Prompt

- `gateway`
- `web-search`

### Deep Research Prompt

- `gateway`
- `web-search`
- `data-processor`
- `summarizer`

## Important Interpretation Notes

- A gateway run and a child-agent run are separate governed runtimes. That is expected in this POC.
- `web-search` is the only runtime that should expose MCP-style operational activity.
- `data-processor` and `summarizer` are not tool-heavy services, so do not expect the same tool-health footprint there.

## Useful Log Commands

Watch all services:

```bash
docker compose --env-file .env logs -f gateway data-processor summarizer web-search
```

Watch OpenBox SDK events only:

```bash
docker compose --env-file .env logs -f gateway data-processor summarizer web-search | rg "openbox-sdk|evaluate.request|evaluate.response|approval.request|approval.response"
```

Watch MCP activity for search:

```bash
docker compose --env-file .env logs -f web-search | rg "MCP Client|MCP Server|CallTool|Brave"
```
a2a-black-magic test