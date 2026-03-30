# Multi-stage Dockerfile for production
# - Builder: installs deps and builds frontend (Vite)
# - Runner: copies built assets + server and runs server via tsx

FROM node:18-alpine AS builder
WORKDIR /app

# Install dependencies (including dev so `tsx` is available)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build frontend
COPY . .
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app

# Set production env (can be overridden by runtime envs)
ENV NODE_ENV=production

# Copy node_modules from builder (includes tsx)
COPY --from=builder /app/node_modules ./node_modules

# Copy built frontend and server code
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/package.json ./package.json

# Expose port (the app reads PORT env var; default 3000)
EXPOSE 3000

# Start the server using tsx (available from node_modules)
CMD ["npx", "tsx", "server.ts"]
