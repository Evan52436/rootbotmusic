FROM node:22-bookworm-slim

# Install mpv audio engine and necessary tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    mpv \
    ca-certificates \
    curl \
    python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy root and web package files
COPY package*.json ./
COPY web/package*.json ./web/

# Install dependencies (respecting allowScripts)
RUN npm install && npm --prefix web install

# Copy application source
COPY . .

# Build backend and Vite Web SPA
RUN npm run build

# Default Web UI and bot ports
EXPOSE 3456

# Start Mulyo
CMD ["npm", "start"]
