# ── Build stage ───────────────────────────────────────────────────────────────
FROM oven/bun:1.3-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy manifests first for layer caching
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# Copy source and build
COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM oven/bun:1.3-alpine

WORKDIR /app

# Install git (needed for git-context and cloud mode)
RUN apk add --no-cache git

# Copy compiled output and runtime deps
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Copy the launcher wrapper
COPY cursor-cli ./cursor-cli
RUN chmod +x cursor-cli

# Config and session history live in a volume
VOLUME ["/root/.cursor-cli"]

# Default workspace — mount your project here
WORKDIR /workspace

ENV CURSOR_API_KEY=""
ENV CURSOR_MODEL=""

ENTRYPOINT ["bun", "/app/dist/index.js"]
CMD ["--help"]
