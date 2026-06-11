FROM node:24.10.0-alpine

WORKDIR /app

# Copy the local unpublished SDK package into the path used by the file:
# dependency in this agent's package.json.
COPY --from=openbox-mastra-sdk /package*.json /openbox-mastra-sdk/
COPY --from=openbox-mastra-sdk /README.md /openbox-mastra-sdk/
COPY --from=openbox-mastra-sdk /LICENSE /openbox-mastra-sdk/
COPY --from=openbox-mastra-sdk /dist /openbox-mastra-sdk/dist
COPY --from=openbox-mastra-sdk /docs /openbox-mastra-sdk/docs

# Copy package files
COPY agents/summarizer/package*.json ./
COPY agents/summarizer/tsconfig.json ./

# Install dependencies. --install-links packs the local SDK file dependency
# instead of symlinking it, so runtime dependencies resolve from /app/node_modules.
RUN npm install --install-links

# Copy source code
COPY agents/summarizer/src ./src

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 3003

# Start the agent
CMD ["npm", "start"]
