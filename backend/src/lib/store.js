// In-memory state for the demo. A restart clears in-flight logins/issuances,
// which is fine: the ACA-Py agent + ledger remain the durable source of truth.

const loginAttempts = new Map(); // presExId -> { status, studentData?, createdAt }
const issuanceAttempts = new Map(); // issuanceId (invi_msg_id) -> { status, studentData, connectionId?, credExId? }
const credExToIssuanceId = new Map(); // credExId -> issuanceId

const LOGIN_TTL_MS = 5 * 60 * 1000;

function pruneLoginAttempts() {
  const now = Date.now();
  for (const [id, attempt] of loginAttempts) {
    if (now - attempt.createdAt > LOGIN_TTL_MS) loginAttempts.delete(id);
  }
}
setInterval(pruneLoginAttempts, 60 * 1000).unref();

module.exports = { loginAttempts, issuanceAttempts, credExToIssuanceId };
