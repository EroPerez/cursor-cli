# ── Build stage ───────────────────────────────────────────────────────────────
FROM oven/bun:1.3-alpine AS builder

WORKDIR /app

# Copy manifests first for layer caching
COPY package.json ./

# Use bun install directly — no npm or pnpm needed
RUN bun install

# Copy source and build using bunx (bun's npx equivalent)
COPY tsconfig.json ./
COPY src ./src
RUN bunx tsc

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM oven/bun:1.3-alpine

WORKDIR /app

# Install git (needed for git-context and cloud mode)
RUN apk add --no-cache git

# Copy compiled output and runtime deps
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Config and session history live in a named volume
VOLUME ["/root/.cursor-cli"]

# Default workspace — mount your project here
WORKDIR /workspace

# Pass at runtime: docker run -e CURSOR_API_KEY="crsr_..."
ENV CURSOR_MODEL=""

ENTRYPOINT ["bun", "/app/dist/index.js"]
CMD ["--help"]
