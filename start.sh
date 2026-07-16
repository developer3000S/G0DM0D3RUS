#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  G0DM0D3 API — build & run helper
#  Usage: ./start.sh [--port PORT] [--name NAME] [--no-build]
# ─────────────────────────────────────────────────────────────
set -euo pipefail

# ── Default config ────────────────────────────────────────────
IMAGE_NAME="g0dm0d3-api"
CONTAINER_NAME="g0dm0d3-api"
PORT="${PORT:-7860}"

# ── Parse flags ───────────────────────────────────────────────
NO_BUILD=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)   PORT="$2";           shift 2 ;;
    --name)   CONTAINER_NAME="$2"; shift 2 ;;
    --no-build) NO_BUILD=1;        shift   ;;
    *)  echo "Unknown option: $1"; exit 1  ;;
  esac
done

# ── Load .env if present ──────────────────────────────────────
ENV_FILE="$(dirname "$0")/.env"
if [[ -f "$ENV_FILE" ]]; then
  echo "📄 Loading environment from .env"
  set -o allexport
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +o allexport
fi

# ── Validate required variables ────────────────────────────────
: "${OPENROUTER_API_KEY:?❌  Set OPENROUTER_API_KEY in .env or export it}"
: "${GODMODE_API_KEY:?❌  Set GODMODE_API_KEY in .env or export it}"

# ── Free the port if already allocated ────────────────────────
echo "🔍 Checking port ${PORT}…"
BLOCKING=$(docker ps -q --filter "publish=${PORT}" 2>/dev/null || true)
if [[ -n "$BLOCKING" ]]; then
  echo "⚠️  Port ${PORT} is in use by container(s): ${BLOCKING}"
  echo "🛑 Stopping conflicting container(s)…"
  docker stop $BLOCKING
fi

# ── Remove old container with same name ───────────────────────
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "🗑️  Removing old container '${CONTAINER_NAME}'…"
  docker rm -f "${CONTAINER_NAME}"
fi

# ── Build image ───────────────────────────────────────────────
if [[ "$NO_BUILD" -eq 0 ]]; then
  echo "🔨 Building image '${IMAGE_NAME}'…"
  docker build --no-cache -t "${IMAGE_NAME}" "$(dirname "$0")"
else
  echo "⏭️  Skipping build (--no-build)"
fi

# ── Run container ─────────────────────────────────────────────
echo "🚀 Starting container '${CONTAINER_NAME}' on port ${PORT}…"
mkdir -p "$(dirname "$0")/cache"
chmod 777 "$(dirname "$0")/cache"

NOW_MS=$(date +%s%3N)
cat <<EOF > "$(dirname "$0")/cache/godmode-model-pool.json"
{
  "working": [
    "groq/llama-3.3-70b-versatile",
    "groq/llama-3.1-8b-instant",
    "mistral/mistral-large-latest",
    "mistral/mistral-small-latest",
    "mistral/codestral-latest",
    "mistral/open-mistral-7b",
    "meta-llama/llama-3.3-70b-instruct:free",
    "meta-llama/llama-3.2-3b-instruct:free",
    "nousresearch/hermes-3-llama-3.1-405b:free",
    "qwen/qwen3-coder:free",
    "google/gemma-4-31b-it:free",
    "google/gemma-4-26b-a4b-it:free",
    "nvidia/nemotron-3-nano-30b-a3b:free",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    "nvidia/nemotron-3-super-120b-a12b:free",
    "nvidia/nemotron-3-ultra-550b-a55b:free",
    "openai/gpt-oss-120b:free",
    "openai/gpt-oss-20b:free"
  ],
  "freeOnRouter": [
    "meta-llama/llama-3.3-70b-instruct:free",
    "meta-llama/llama-3.2-3b-instruct:free",
    "nousresearch/hermes-3-llama-3.1-405b:free",
    "qwen/qwen3-coder:free",
    "google/gemma-4-31b-it:free",
    "google/gemma-4-26b-a4b-it:free",
    "nvidia/nemotron-3-nano-30b-a3b:free",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    "nvidia/nemotron-3-super-120b-a12b:free",
    "nvidia/nemotron-3-ultra-550b-a55b:free",
    "openai/gpt-oss-120b:free",
    "openai/gpt-oss-20b:free"
  ],
  "savedAt": ${NOW_MS}
}
EOF
chmod 777 "$(dirname "$0")/cache/godmode-model-pool.json"

# ── Collect all rotating API keys from environment ───────────────────
ROUTED_KEYS=()
while IFS= read -r line; do
  var_name="${line%%=*}"
  var_val="${line#*=}"
  if [[ "$var_name" =~ ^(OPENROUTER_API_KEY[0-9]*|MISTRAL_API_KEY[0-9]*|GROQ_API_KEY[0-9]*|OLLAMA_API_KEY[0-9]*|NVIDIA_KEY[0-9]*|NVIDIA_API_KEY[0-9]*)$ ]]; then
    ROUTED_KEYS+=("-e" "${var_name}=${var_val}")
  fi
done < <(env)

docker run -d \
  --name "${CONTAINER_NAME}" \
  --restart unless-stopped \
  -p "${PORT}:7860" \
  -v "$(pwd)/cache:/app/cache" \
  -e MODEL_CACHE_DIR="/app/cache" \
  -e OPENROUTER_API_KEY="${OPENROUTER_API_KEY}" \
  -e GODMODE_API_KEY="${GODMODE_API_KEY}" \
  -e GODMODE_TIER_KEYS="${GODMODE_TIER_KEYS:-enterprise:${GODMODE_API_KEY}}" \
  "${ROUTED_KEYS[@]}" \
  ${HF_TOKEN:+-e HF_TOKEN="${HF_TOKEN}"} \
  ${HF_DATASET_REPO:+-e HF_DATASET_REPO="${HF_DATASET_REPO}"} \
  ${HF_FLUSH_THRESHOLD:+-e HF_FLUSH_THRESHOLD="${HF_FLUSH_THRESHOLD}"} \
  ${HF_FLUSH_INTERVAL_MS:+-e HF_FLUSH_INTERVAL_MS="${HF_FLUSH_INTERVAL_MS}"} \
  ${CORS_ORIGIN:+-e CORS_ORIGIN="${CORS_ORIGIN}"} \
  "${IMAGE_NAME}"

# ── Health check ──────────────────────────────────────────────
echo "⏳ Waiting for health check…"
MAX_WAIT=120
ELAPSED=0
until curl -sf "http://localhost:${PORT}/v1/health" > /dev/null 2>&1; do
  sleep 2
  ELAPSED=$((ELAPSED + 2))
  if [[ $ELAPSED -ge $MAX_WAIT ]]; then
    echo "❌ Service did not become healthy after ${MAX_WAIT}s"
    echo "   Check logs: docker logs ${CONTAINER_NAME}"
    exit 1
  fi
  echo "   … still waiting (${ELAPSED}s)"
done

echo ""
echo "✅ G0DM0D3 API is live!"
echo "   🌐 http://localhost:${PORT}/v1/health"
echo "   📋 Logs: docker logs -f ${CONTAINER_NAME}"
