#!/usr/bin/env bash
# Full automated end-to-end test of the login/issuance flow using the
# student-agent as a scripted stand-in for a phone wallet. No manual
# QR scanning required.
set -euo pipefail
cd "$(dirname "$0")/.."
source .env

echo "== 1. Trigger credential issuance =="
ISSUE_RESP=$(curl -sf -X POST http://localhost:5000/api/admin/issue \
  -H 'Content-Type: application/json' \
  -H "x-admin-token: ${ADMIN_TOKEN}" \
  -d '{"student_name":"Alex D Costa","student_id":"BRAC-20220001","department":"Computer Science","email":"alex.dcosta@bracu.ac.bd"}')
echo "$ISSUE_RESP" | python3 -m json.tool
ISSUANCE_ID=$(echo "$ISSUE_RESP" | python3 -c 'import json,sys;print(json.load(sys.stdin)["issuanceId"])')
INVITATION_URL=$(echo "$ISSUE_RESP" | python3 -c 'import json,sys;print(json.load(sys.stdin)["invitationUrl"])')

echo "== 2. Simulated wallet scans the issuance invitation =="
node scripts/simulate-wallet-scan.js "$INVITATION_URL"

echo "== 3. Poll issuance status until credential is issued =="
for i in $(seq 1 30); do
  STATUS_RESP=$(curl -sf http://localhost:5000/api/admin/issue-status/$ISSUANCE_ID \
    -H "x-admin-token: ${ADMIN_TOKEN}")
  STATUS=$(echo "$STATUS_RESP" | python3 -c 'import json,sys;print(json.load(sys.stdin)["status"])')
  echo "  status: $STATUS"
  if [ "$STATUS" = "issued" ]; then break; fi
  if [ "$STATUS" = "failed" ]; then echo "Issuance failed"; exit 1; fi
  sleep 2
done
if [ "$STATUS" != "issued" ]; then echo "Timed out waiting for issuance"; exit 1; fi

echo "== 4. Start a login attempt (QR proof request) =="
LOGIN_RESP=$(curl -sf -c /tmp/ssi-cookies.txt http://localhost:5000/api/login/init)
LOGIN_ID=$(echo "$LOGIN_RESP" | python3 -c 'import json,sys;print(json.load(sys.stdin)["loginId"])')
LOGIN_INVITATION_URL=$(echo "$LOGIN_RESP" | python3 -c 'import json,sys;print(json.load(sys.stdin)["invitationUrl"])')
echo "loginId=$LOGIN_ID"

echo "== 5. Simulated wallet scans the login invitation and presents proof =="
node scripts/simulate-wallet-scan.js "$LOGIN_INVITATION_URL"

echo "== 6. Poll login status until success, using the same cookie jar =="
for i in $(seq 1 30); do
  STATUS_RESP=$(curl -sf -b /tmp/ssi-cookies.txt -c /tmp/ssi-cookies.txt http://localhost:5000/api/login/status/$LOGIN_ID)
  STATUS=$(echo "$STATUS_RESP" | python3 -c 'import json,sys;print(json.load(sys.stdin)["status"])')
  echo "  status: $STATUS"
  if [ "$STATUS" = "success" ]; then echo "$STATUS_RESP" | python3 -m json.tool; break; fi
  if [ "$STATUS" = "failed" ]; then echo "Login failed"; exit 1; fi
  sleep 2
done
if [ "$STATUS" != "success" ]; then echo "Timed out waiting for login"; exit 1; fi

echo "== 7. Access protected routes with the session cookie =="
echo "-- /api/me --"
curl -sf -b /tmp/ssi-cookies.txt http://localhost:5000/api/me | python3 -m json.tool
echo "-- /api/dashboard --"
curl -sf -b /tmp/ssi-cookies.txt http://localhost:5000/api/dashboard | python3 -m json.tool
echo "-- /api/profile --"
curl -sf -b /tmp/ssi-cookies.txt http://localhost:5000/api/profile | python3 -m json.tool

echo "== 8. Logout, then confirm protected routes are denied =="
curl -sf -b /tmp/ssi-cookies.txt -c /tmp/ssi-cookies.txt -X POST http://localhost:5000/api/login/logout
set +e
curl -sf -b /tmp/ssi-cookies.txt http://localhost:5000/api/me
DENIED=$?
set -e
if [ "$DENIED" -ne 0 ]; then
  echo "Correctly denied after logout."
else
  echo "ERROR: /api/me still accessible after logout"
  exit 1
fi

echo
echo "ALL CHECKS PASSED"
