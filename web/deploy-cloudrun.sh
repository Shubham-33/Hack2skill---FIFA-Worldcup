#!/usr/bin/env bash
#
# Deploy GateReady to Cloud Run.
#
# Usage:
#   ./deploy-cloudrun.sh PROJECT_ID
#
# Prerequisites (all free-tier, but a billing account MUST be linked to the project):
#   - gcloud CLI, authenticated (pre-installed and pre-authed in Cloud Shell)
#   - the four app secrets exported in your shell, or pasted when prompted
#
# What it does: enables the needed APIs, stores secrets in Secret Manager, grants the
# Cloud Run runtime service account access to them, then builds from source and deploys.
set -euo pipefail

PROJECT_ID="${1:?Usage: ./deploy-cloudrun.sh PROJECT_ID}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-gateready}"

gcloud config set project "$PROJECT_ID"

echo "▸ Enabling APIs (first run can take a minute)…"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com

# ── Secrets ────────────────────────────────────────────────────────────────
# Read from the environment if present, otherwise prompt. GOOGLE_SHEETS_ID is not
# secret, so it is passed as a plain env var below rather than through Secret Manager.
: "${GEMINI_API_KEY:?export GEMINI_API_KEY before running}"
: "${NVIDIA_API_KEY:?export NVIDIA_API_KEY before running}"

put_secret() {
  local name="$1" value="$2"
  if gcloud secrets describe "$name" >/dev/null 2>&1; then
    printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=-
  else
    printf '%s' "$value" | gcloud secrets create "$name" --data-file=- --replication-policy=automatic
  fi
}

echo "▸ Storing secrets in Secret Manager…"
put_secret gemini-api-key "$GEMINI_API_KEY"
put_secret nvidia-api-key "$NVIDIA_API_KEY"

# Grant the Cloud Run runtime SA read access to the secrets.
PROJECT_NUM="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
RUNTIME_SA="${PROJECT_NUM}-compute@developer.gserviceaccount.com"
for s in gemini-api-key nvidia-api-key; do
  gcloud secrets add-iam-policy-binding "$s" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role="roles/secretmanager.secretAccessor" --quiet
done

# ── Deploy ─────────────────────────────────────────────────────────────────
echo "▸ Building and deploying…"
gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --set-secrets "GEMINI_API_KEY=gemini-api-key:latest,NVIDIA_API_KEY=nvidia-api-key:latest" \
  --set-env-vars "NVIDIA_MODEL=nvidia/nemotron-nano-12b-v2-vl,GOOGLE_SHEETS_ID=${GOOGLE_SHEETS_ID:-}" \
  --memory 512Mi \
  --min-instances 1 \
  --cpu-boost \
  --timeout 60 \
  --quiet

URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
echo
echo "✅ Deployed: $URL"
echo "   Smoke test: curl -sI $URL/ | head -3"
