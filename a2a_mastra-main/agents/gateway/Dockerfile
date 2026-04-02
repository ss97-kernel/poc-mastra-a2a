FROM node:24.10.0-alpine

WORKDIR /app

# Copy package files
COPY agents/gateway/package*.json ./
COPY agents/gateway/tsconfig.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY agents/gateway/src ./src

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 3001

# Start the agent
CMD ["npm", "start"]
