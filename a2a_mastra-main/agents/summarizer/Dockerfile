FROM node:24.10.0-alpine

WORKDIR /app

# Copy package files
COPY agents/summarizer/package*.json ./
COPY agents/summarizer/tsconfig.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY agents/summarizer/src ./src

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 3003

# Start the agent
CMD ["npm", "start"]
