const fs = require("fs");
const path = require("path");

const LEDGER_CONFIG_PATH = path.join(__dirname, "..", "ledger-config.json");

function loadLedgerConfig() {
  let raw = {};
  try {
    raw = JSON.parse(fs.readFileSync(LEDGER_CONFIG_PATH, "utf8"));
  } catch (e) {
    // file may not exist yet on very first boot
  }
  return raw;
}

const ledgerConfig = loadLedgerConfig();

module.exports = {
  port: process.env.PORT || 5000,
  universityAdminUrl: process.env.UNIVERSITY_ADMIN_URL || "http://localhost:8021",
  sessionSecret: process.env.SESSION_SECRET || "dev-secret-change-me",
  adminToken: process.env.ADMIN_TOKEN || "dev-admin-token",
  frontendOrigin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
  ledgerConfigPath: LEDGER_CONFIG_PATH,
  get credDefId() {
    return loadLedgerConfig().credDefId;
  },
  get schemaAttributes() {
    return loadLedgerConfig().attributes || ["student_name", "student_id", "department", "email"];
  },
};
