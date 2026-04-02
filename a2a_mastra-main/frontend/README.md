# Frontend

This directory contains the web UI for the OpenBox Mastra A2A demo.

The frontend is not intended to be run in isolation for normal demo usage. Use the root-level workflow instead:

```bash
npm run build
npm run dev
```

That starts the full stack:

- frontend
- gateway
- data-processor
- summarizer
- web-search

If you are working only on the UI, this is a standard Next.js application and can still be run directly from this directory. The public setup and usage instructions for the full demo are in the repository root [README](../README.md).
