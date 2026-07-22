// One-time setup: registers the "Student ID" schema and credential definition
// on the ledger via the university agent's admin API, then writes the
// resulting identifiers to backend/ledger-config.json for the backend to read.
const fs = require("fs");
const path = require("path");

const ADMIN_URL = process.env.UNIVERSITY_ADMIN_URL || "http://localhost:8021";
const OUT_FILE = path.join(__dirname, "..", "backend", "ledger-config.json");

const SCHEMA_NAME = "student_id";
const SCHEMA_VERSION = "1.0";
const ATTRIBUTES = ["student_name", "student_id", "department", "email"];

async function waitForAgent() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${ADMIN_URL}/status/ready`);
      if (res.ok) {
        const body = await res.json();
        if (body.ready) return;
      }
    } catch (e) {
      // keep retrying
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`University agent at ${ADMIN_URL} never became ready`);
}

async function postJson(urlPath, body) {
  const res = await fetch(`${ADMIN_URL}${urlPath}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`POST ${urlPath} failed (${res.status}): ${text}`);
  }
  return JSON.parse(text);
}

async function findExistingSchemaId() {
  const res = await fetch(
    `${ADMIN_URL}/schemas/created?schema_name=${SCHEMA_NAME}&schema_version=${SCHEMA_VERSION}`
  );
  if (!res.ok) return null;
  const body = await res.json();
  return (body.schema_ids || [])[0] || null;
}

async function findExistingCredDefId(schemaId) {
  const res = await fetch(
    `${ADMIN_URL}/credential-definitions/created?schema_id=${schemaId}`
  );
  if (!res.ok) return null;
  const body = await res.json();
  return (body.credential_definition_ids || [])[0] || null;
}

async function main() {
  console.log(`Waiting for university agent admin API at ${ADMIN_URL} ...`);
  await waitForAgent();

  let schemaId = await findExistingSchemaId();
  if (schemaId) {
    console.log(`Schema already registered: ${schemaId}`);
  } else {
    console.log("Registering student_id schema...");
    const schemaResp = await postJson("/schemas", {
      schema_name: SCHEMA_NAME,
      schema_version: SCHEMA_VERSION,
      attributes: ATTRIBUTES,
    });
    schemaId = schemaResp.schema_id || schemaResp.sent?.schema_id;
    console.log(`Schema registered: ${schemaId}`);
  }

  let credDefId = await findExistingCredDefId(schemaId);
  if (credDefId) {
    console.log(`Credential definition already registered: ${credDefId}`);
  } else {
    console.log("Registering credential definition...");
    const credDefResp = await postJson("/credential-definitions", {
      schema_id: schemaId,
      tag: "default-v2",
      support_revocation: false,
    });
    credDefId =
      credDefResp.credential_definition_id || credDefResp.sent?.credential_definition_id;
    console.log(`Credential definition registered: ${credDefId}`);
  }

  const config = {
    schemaId,
    schemaName: SCHEMA_NAME,
    schemaVersion: SCHEMA_VERSION,
    attributes: ATTRIBUTES,
    credDefId,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(OUT_FILE, JSON.stringify(config, null, 2));
  console.log(`Wrote ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
