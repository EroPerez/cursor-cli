# ── Build stage ───────────────────────────────────────────────────────────────
FROM oven/bun:1.3-alpine AS builder

WORKDIR /app

# Install pnpm using the official installer (no npm required)
RUN wget -qO- https://get.pnpm.io/install.sh | sh - && \
    mv /root/.local/share/pnpm/pnpm /usr/local/bin/ && \
    mv /root/.local/share/pnpm/pnpm-corepack /usr/local/bin/ 2>/dev/null || true

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

# Environment variables (do NOT include secrets in image)
# User should pass at runtime: docker run -e CURSOR_API_KEY="crsr_..."
ENV CURSOR_MODEL=""

ENTRYPOINT ["bun", "/app/dist/index.js"]
CMD ["--help"]

