# Running The Demo

This guide walks through the fastest path to a working local demo.

## 1. Configure `.env`

Copy the example file:

```bash
cp .env.example .env
```

Fill these values first:

```env
OPENAI_API_KEY=sk-...
OPENBOX_URL=http://host.docker.internal:8787
OPENBOX_GATEWAY_API_KEY=...
OPENBOX_DATA_PROCESSOR_API_KEY=...
OPENBOX_SUMMARIZER_API_KEY=...
OPENBOX_WEB_SEARCH_API_KEY=...
```

Add this if you want search-backed flows:

```env
BRAVE_SEARCH_API_KEY=...
```

Add these if you want Langfuse tracing:

```env
LANGFUSE_PUBLIC_KEY=...
LANGFUSE_SECRET_KEY=...
LANGFUSE_BASEURL=https://cloud.langfuse.com
```

## 2. Build And Start

From the repository root:

```bash
npm run build
npm run dev
```

Open:

- `http://localhost:3000` for the demo UI
- `http://localhost:3001/health` for a gateway health check

## 3. Try Representative Prompts

Use these prompts in the UI:

### Summary

```text
Summarize the business impact of rising cloud costs for an executive audience.
```

### Analysis

```text
Analyze this support data and explain the main trends: {"support":[{"week":"W1","resolved":84,"opened":91},{"week":"W2","resolved":95,"opened":88},{"week":"W3","resolved":103,"opened":90}]}
```

### News Search

```text
Find recent news about OpenAI product announcements.
```

### Scholarly Search

```text
Find academic research on retrieval augmented generation evaluation methods.
```

### Deep Research

```text
Research AI agents in enterprise support and produce a detailed report with sources.
```

## 4. Watch The Runtime

To follow the backend services while using the UI:

```bash
docker compose --env-file .env logs -f gateway data-processor summarizer web-search
```

To watch OpenBox SDK traffic specifically:

```bash
docker compose --env-file .env logs -f gateway data-processor summarizer web-search | rg "openbox-sdk|evaluate.request|evaluate.response|approval.request|approval.response"
```

## 5. Stop The Stack

```bash
npm run stop
```

## Common Issues

### OpenBox traffic does not appear

- Confirm `OPENBOX_URL` is reachable from inside the containers.
- If OpenBox is running on your laptop, `host.docker.internal` is usually the correct hostname on macOS and Windows.

### Search flows fail immediately

- `BRAVE_SEARCH_API_KEY` is missing or invalid.

### Deep research fails on larger topics

- Increase `A2A_JSON_BODY_LIMIT` in `.env`.

### The UI works but OpenBox is empty

- Check that all four OpenBox API keys are valid and mapped to the right runtime.
