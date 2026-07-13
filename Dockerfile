# G0DM0D3 Research Preview API
# Deploy on Hugging Face Spaces (Docker SDK) or any container host.
#
# Build:  docker build -t g0dm0d3-api .
# Run:    docker run -p 7860:7860 \
#           -e OPENROUTER_API_KEY=sk-or-... \
#           -e GODMODE_API_KEY=your-secret-key \
#           g0dm0d3-api
#
# OPENROUTER_API_KEY: Your OpenRouter key (powers all model calls)
# GODMODE_API_KEY:    Auth key callers must send as Bearer token
# HF_TOKEN:           HuggingFace write token for auto-publishing data
# HF_DATASET_REPO:    Target HF dataset repo (e.g. LYS10S/g0dm0d3-research)

FROM node:20-slim

WORKDIR /app

# Install curl for health check + clean apt cache in one layer
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Copy package files and install deps
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# Copy source (api + engine libs)
COPY api/ ./api/
COPY src/lib/ ./src/lib/
COPY src/stm/ ./src/stm/

# Create non-root user for security
RUN addgroup --system app && adduser --system --ingroup app app

# HF Spaces expects port 7860
ENV PORT=7860
EXPOSE 7860

# Health check — curl is now installed, start-period=30s for tsx cold start
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD curl -fsS http://localhost:7860/v1/health || exit 1

# Switch to non-root user
USER app

CMD ["npx", "tsx", "api/server.ts"]
