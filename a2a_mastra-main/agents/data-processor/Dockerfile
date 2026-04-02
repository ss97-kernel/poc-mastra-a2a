FROM node:24.10.0-alpine

WORKDIR /app

# Copy package files
COPY agents/data-processor/package*.json ./
COPY agents/data-processor/tsconfig.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY agents/data-processor/src ./src

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 3002

# Start the agent
CMD ["npm", "start"]
