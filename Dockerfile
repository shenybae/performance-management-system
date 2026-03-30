# Multi-stage Dockerfile for production
# - Builder: installs deps and builds frontend (Vite)
# - Runner: copies built assets + server and runs server via tsx

FROM node:18-slim AS builder
WORKDIR /app

# Install system build tools required to compile optional native modules
# (some Tailwind/oxide packages ship native bindings that need C toolchain)
RUN apt-get update \
	&& apt-get install -y --no-install-recommends build-essential python3 make g++ libc6-dev \
	&& rm -rf /var/lib/apt/lists/*

# Install dependencies (including dev so `tsx` is available)
COPY package.json package-lock.json ./
# Run npm ci so optional native modules are compiled against the image's libc/ABI
RUN npm ci

# Copy source and build frontend
COPY . .
RUN npm run build

FROM node:18-slim AS runner
WORKDIR /app

# Set production env (can be overridden by runtime envs)
ENV NODE_ENV=production

# Copy node_modules from builder (includes tsx)
COPY --from=builder /app/node_modules ./node_modules

# Copy built frontend and server code
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/scripts ./scripts
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Expose port (the app reads PORT env var; default 3000)
EXPOSE 3000

# Use entrypoint so we can run optional seeders before starting
ENTRYPOINT ["/bin/sh", "/app/docker-entrypoint.sh"]
CMD ["npx", "tsx", "server.ts"]
