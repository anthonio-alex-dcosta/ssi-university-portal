#!/usr/bin/env bash
# Automated end-to-end test of the bonus DIDComm messaging feature, using
# student-agent and faculty-agent as stand-ins for two people's wallets.
# No phone required.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== 1. Faculty generates an invitation =="
FAC_RESP=$(curl -sf -X POST http://localhost:5000/api/messaging/faculty/invite)
FAC_INVITE=$(echo "$FAC_RESP" | python3 -c 'import json,sys;print(json.load(sys.stdin)["invitationUrl"])')

echo "== 2. Student connects using the faculty's invitation =="
STUDENT_CONN=$(curl -sf -X POST http://localhost:5000/api/messaging/student/connect \
  -H 'Content-Type: application/json' \
  -d "{\"invitationUrl\":\"$FAC_INVITE\"}")
echo "$STUDENT_CONN" | python3 -m json.tool

echo "== 3. Wait for both sides to see an active connection =="
for i in $(seq 1 20); do
  STU_CONNS=$(curl -sf http://localhost:5000/api/messaging/student/connections)
  FAC_CONNS=$(curl -sf http://localhost:5000/api/messaging/faculty/connections)
  STU_COUNT=$(echo "$STU_CONNS" | python3 -c 'import json,sys;print(len(json.load(sys.stdin)["connections"]))')
  FAC_COUNT=$(echo "$FAC_CONNS" | python3 -c 'import json,sys;print(len(json.load(sys.stdin)["connections"]))')
  echo "  student active connections: $STU_COUNT, faculty active connections: $FAC_COUNT"
  if [ "$STU_COUNT" -gt 0 ] && [ "$FAC_COUNT" -gt 0 ]; then break; fi
  sleep 2
done

STUDENT_CONN_ID=$(echo "$STU_CONNS" | python3 -c 'import json,sys;print(json.load(sys.stdin)["connections"][0]["connectionId"])')
FACULTY_CONN_ID=$(echo "$FAC_CONNS" | python3 -c 'import json,sys;print(json.load(sys.stdin)["connections"][0]["connectionId"])')
echo "studentConnId=$STUDENT_CONN_ID facultyConnId=$FACULTY_CONN_ID"

echo "== 4. Student sends a message to faculty =="
curl -sf -X POST http://localhost:5000/api/messaging/student/send \
  -H 'Content-Type: application/json' \
  -d "{\"connectionId\":\"$STUDENT_CONN_ID\",\"content\":\"Hello Professor, quick question about the assignment.\"}"
echo

# Webhook delivery for a basicmessage is fast but not instant, so poll
# rather than sleeping a fixed amount before asserting.
wait_for_message() {
  local role="$1" connId="$2" needle="$3" out=""
  for i in $(seq 1 10); do
    out=$(curl -sf "http://localhost:5000/api/messaging/$role/messages/$connId")
    if echo "$out" | grep -q "$needle"; then
      echo "$out"
      return 0
    fi
    sleep 1
  done
  echo "$out"
  return 1
}

echo "== 5. Faculty sends a reply =="
curl -sf -X POST http://localhost:5000/api/messaging/faculty/send \
  -H 'Content-Type: application/json' \
  -d "{\"connectionId\":\"$FACULTY_CONN_ID\",\"content\":\"Sure, go ahead.\"}"
echo

echo "== 6. Confirm faculty received the student's message =="
if FAC_MSGS=$(wait_for_message faculty "$FACULTY_CONN_ID" "quick question"); then
  echo "$FAC_MSGS" | python3 -m json.tool
  echo "OK: faculty received student's message"
else
  echo "$FAC_MSGS" | python3 -m json.tool
  echo "FAIL: faculty did not receive student's message"; exit 1
fi

echo "== 7. Confirm student received the faculty's reply =="
if STU_MSGS=$(wait_for_message student "$STUDENT_CONN_ID" "Sure, go ahead"); then
  echo "$STU_MSGS" | python3 -m json.tool
  echo "OK: student received faculty's reply"
else
  echo "$STU_MSGS" | python3 -m json.tool
  echo "FAIL: student did not receive faculty's reply"; exit 1
fi

echo
echo "ALL MESSAGING CHECKS PASSED"
