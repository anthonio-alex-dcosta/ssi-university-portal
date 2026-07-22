const express = require("express");
const QRCode = require("qrcode");
const { acapy } = require("../lib/acapy");
const { issuanceAttempts } = require("../lib/store");
const config = require("../config");

const router = express.Router();

function requireAdmin(req, res, next) {
  if (req.headers["x-admin-token"] !== config.adminToken) {
    return res.status(401).json({ error: "Missing or invalid admin token" });
  }
  next();
}

const STATUS_MESSAGES = {
  pending_connection: "Waiting for wallet to scan and connect…",
  connected: "Connected — sending credential offer…",
  offer_sent: "Offer sent — waiting for wallet to accept…",
  issued: "Credential issued",
  failed: "Issuance failed",
};

// Start issuing a Student ID credential: creates a connection invitation.
// Once the wallet scans it and the connection completes, the webhook
// handler automatically sends the credential offer (auto-issued on request).
router.post("/issue", requireAdmin, async (req, res) => {
  try {
    const { student_name, student_id, department, email } = req.body || {};
    if (!student_name || !student_id || !department || !email) {
      return res.status(400).json({
        error: "student_name, student_id, department, and email are all required",
      });
    }
    if (!config.credDefId) {
      return res.status(500).json({
        error: "No credential definition registered yet. Run scripts/register-schema.js first.",
      });
    }

    const oobResp = await acapy("/out-of-band/create-invitation?auto_accept=true", {
      method: "POST",
      body: {
        alias: `Issue credential to ${student_name}`,
        my_label: "BRAC University",
        goal_code: "issue-vc",
        goal: "Issue a BRAC University Student ID credential",
        handshake_protocols: ["https://didcomm.org/didexchange/1.0"],
      },
    });

    const issuanceId = oobResp.invi_msg_id;
    issuanceAttempts.set(issuanceId, {
      status: "pending_connection",
      studentData: { student_name, student_id, department, email },
      createdAt: Date.now(),
    });

    const qrDataUrl = await QRCode.toDataURL(oobResp.invitation_url, {
      margin: 1,
      width: 320,
    });

    res.json({ issuanceId, qrDataUrl, invitationUrl: oobResp.invitation_url });
  } catch (err) {
    console.error("admin/issue failed", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/issue-status/:issuanceId", requireAdmin, (req, res) => {
  const attempt = issuanceAttempts.get(req.params.issuanceId);
  if (!attempt) return res.status(404).json({ error: "Unknown issuance attempt" });
  res.json({
    status: attempt.status,
    message: STATUS_MESSAGES[attempt.status] || attempt.status,
  });
});

module.exports = { router, requireAdmin };
