#!/usr/bin/env bash
# One-time (idempotent) setup: creates .env from .env.example if missing,
# registers a DID for the university issuer/verifier agent on the public
# BCovrin Test ledger, and fills in generated secrets.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi

# shellcheck disable=SC1091
source .env

GENESIS_REGISTER_URL="${LEDGER_REGISTER_URL:-https://test.bcovrin.vonx.io/register}"

gen_secret() { openssl rand -hex 16; }

set_env() {
  local key="$1" val="$2"
  if grep -q "^${key}=" .env; then
    sed -i "s#^${key}=.*#${key}=${val}#" .env
  else
    echo "${key}=${val}" >> .env
  fi
}

if [ -z "${UNIVERSITY_SEED:-}" ]; then
  echo "Registering university issuer DID on BCovrin Test ledger..."
  SEED=$(gen_secret)
  RESPONSE=$(curl -sf -X POST "$GENESIS_REGISTER_URL" \
    -H 'Content-Type: application/json' \
    -d "{\"seed\":\"${SEED}\",\"alias\":\"BRAC University Issuer\",\"role\":\"TRUST_ANCHOR\"}")
  DID=$(echo "$RESPONSE" | python3 -c 'import json,sys; print(json.load(sys.stdin)["did"])')
  echo "Registered DID: $DID"
  set_env UNIVERSITY_SEED "$SEED"
  set_env UNIVERSITY_DID "$DID"
else
  echo "UNIVERSITY_SEED already set in .env, skipping ledger registration."
fi

for key in UNIVERSITY_WALLET_KEY STUDENT_WALLET_KEY SESSION_SECRET ADMIN_TOKEN; do
  current=$(grep "^${key}=" .env | cut -d= -f2- || true)
  if [ -z "$current" ] || [ "$current" = "change-me-university-wallet-key" ] || [[ "$current" == change-me-* ]]; then
    set_env "$key" "$(gen_secret)"
  fi
done

echo "Done. Review .env, then run: docker compose up -d university-agent student-agent"
