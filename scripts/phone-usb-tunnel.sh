#!/usr/bin/env bash
# Point the university agent at the phone via ADB reverse port-forwarding.
# With the phone USB-debugging, Bifold can reach http://127.0.0.1:8023 on the
# phone, which ADB maps to the laptop's transport-proxy (HTTP + WebSocket).
# This avoids ngrok (and its free-tier browser interstitial that breaks DIDComm).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ADB="${ADB:-/mnt/c/Users/USER/tools/platform-tools/adb.exe}"
if [[ ! -x "$ADB" ]]; then
  ADB="$(command -v adb || true)"
fi
if [[ -z "$ADB" ]]; then
  echo "ERROR: adb not found. Set ADB=/path/to/adb" >&2
  exit 1
fi

echo "==> ADB devices"
"$ADB" devices -l
STATE="$("$ADB" devices | tr -d '\r' | awk 'NR>1 && $2!=""{print $2; exit}')"
if [[ "$STATE" == "unauthorized" ]]; then
  echo "ERROR: phone is unauthorized. Unlock the phone and tap Allow on the USB debugging prompt, then re-run." >&2
  exit 1
fi
if [[ "$STATE" != "device" ]]; then
  echo "ERROR: no authorized phone (state='${STATE:-none}'). Plug in USB and enable debugging." >&2
  exit 1
fi

echo "==> Ensuring stack is up (transport-proxy on :8023)"
docker compose up -d
echo "Waiting for university-agent admin..."
for i in $(seq 1 60); do
  if curl -sf http://localhost:8021/status/live >/dev/null; then
    break
  fi
  sleep 2
done
curl -sf http://localhost:8021/status/live >/dev/null || {
  echo "ERROR: university-agent did not become healthy" >&2
  docker compose ps
  exit 1
}

echo "==> ADB reverse: phone localhost:8023 -> laptop :8023"
"$ADB" reverse --remove-all || true
"$ADB" reverse tcp:8023 tcp:8023
"$ADB" reverse --list

ENDPOINT="http://127.0.0.1:8023"
WS_ENDPOINT="ws://127.0.0.1:8023"

if [[ ! -f .env ]]; then
  echo "ERROR: .env missing — run scripts/setup-ledger.sh first" >&2
  exit 1
fi

echo "==> Setting UNIVERSITY_ENDPOINT=$ENDPOINT (and WS) in .env"
tmp="$(mktemp)"
awk -v ep="$ENDPOINT" -v ws="$WS_ENDPOINT" '
  BEGIN{done_ep=0; done_ws=0}
  /^UNIVERSITY_ENDPOINT=/ {print "UNIVERSITY_ENDPOINT=" ep; done_ep=1; next}
  /^UNIVERSITY_WS_ENDPOINT=/ {print "UNIVERSITY_WS_ENDPOINT=" ws; done_ws=1; next}
  {print}
  END{
    if (!done_ep) print "UNIVERSITY_ENDPOINT=" ep
    if (!done_ws) print "UNIVERSITY_WS_ENDPOINT=" ws
  }
' .env > "$tmp"
mv "$tmp" .env

echo "==> Recreating university-agent so it re-announces the USB endpoint"
docker compose up -d --force-recreate university-agent
sleep 5
curl -sf http://localhost:8021/status/live >/dev/null

echo "==> Agent default endpoints from status/config:"
curl -s http://localhost:8021/status/config | python3 -c '
import json,sys
data=json.load(sys.stdin)
cfg=data.get("config") or data
if not isinstance(cfg, dict):
    print(data)
    raise SystemExit
for k,v in cfg.items():
    if "endpoint" in str(k).lower() or k in ("host","webhook_urls"):
        print(f"  {k}={v}")
'

echo
echo "Ready. On the phone:"
echo "  1. Open Bifold (keep USB connected)."
echo "  2. On the laptop open http://localhost:5173/admin/issue and Generate issuance QR."
echo "  3. Scan that QR. Accept the connection, then Accept the Student ID credential offer."
echo "  4. Credential should appear under Credentials."
echo
echo "If the offer still does not appear, check: docker logs -f university-agent | grep auto_issue"
