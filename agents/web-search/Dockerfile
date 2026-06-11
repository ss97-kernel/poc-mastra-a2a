FROM node:24.10.0-alpine

WORKDIR /app

# Copy the local unpublished SDK package into the path used by the file:
# dependency in this agent's package.json.
COPY --from=openbox-mastra-sdk /package*.json /openbox-mastra-sdk/
COPY --from=openbox-mastra-sdk /README.md /openbox-mastra-sdk/
COPY --from=openbox-mastra-sdk /LICENSE /openbox-mastra-sdk/
COPY --from=openbox-mastra-sdk /dist /openbox-mastra-sdk/dist
COPY --from=openbox-mastra-sdk /docs /openbox-mastra-sdk/docs

# Copy package files for main app
COPY agents/web-search/package*.json ./
COPY agents/web-search/tsconfig.json ./

# Install dependencies for main app. --install-links packs the local SDK file
# dependency instead of symlinking it, so runtime dependencies resolve from /app/node_modules.
RUN npm install --install-links

# Copy and build standalone MCP server
COPY standalone-mcp-server/package*.json ./standalone-mcp-server/
COPY standalone-mcp-server/tsconfig.json ./standalone-mcp-server/

# Install standalone MCP server dependencies
WORKDIR /app/standalone-mcp-server
RUN npm install

# Copy standalone MCP server source code and build
COPY standalone-mcp-server/src ./src
RUN npm run build

# Go back to main app directory
WORKDIR /app

# Copy main app source code
COPY agents/web-search/src ./src

# Build the main application
RUN npm run build

# Start the application
CMD ["npm", "start"]
