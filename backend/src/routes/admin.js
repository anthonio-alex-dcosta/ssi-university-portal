const fs = require("fs");
const path = require("path");
const express = require("express");
const QRCode = require("qrcode");
const { acapy } = require("../lib/acapy");
const { issuanceAttempts } = require("../lib/store");
const config = require("../config");

const PENDING_DIR = "/shared/pending";

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
  offer_sent: "Offer sent — check your wallet app and tap Accept…",
  awaiting_wallet_ack: "Wallet is storing the credential…",
  issued: "Credential issued",
  failed: "Issuance failed",
};

// Start issuing a Student ID credential: creates a connection invitation.
// Credential offers carry real AnonCreds crypto material (key correctness
// proof, etc.) and are too large to embed directly in a connectionless
// invitation QR (unlike present-proof requests, which are much lighter) —
// confirmed by hitting "amount of data is too big" even at the QR format's
// lowest error-correction level. So issuance has to stay connection-based.
//
// Sending the offer itself is handled by the auto_issue_bridge ACA-Py
// plugin (acapy-plugins/auto_issue_bridge), not by a webhook back to this
// backend: mobile wallets have no public inbound endpoint, so by the time
// an external webhook roundtrip gets back to ACA-Py to send the offer, the
// wallet's connection request has no open transport left to deliver
// through ("no supported transport"). The plugin reacts to the connection
// going active *synchronously inside ACA-Py's own process*, while that
// transport session is still open. We hand it the student data via a
// shared volume, keyed by the invitation's message ID, since the plugin
// runs in a separate (Python) container.
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

    fs.writeFileSync(
      path.join(PENDING_DIR, `${issuanceId}.json`),
      JSON.stringify({
        studentData: { student_name, student_id, department, email },
        credDefId: config.credDefId,
      })
    );

    const invitationUrl = oobResp.invitation_url;
    const phoneReady = /^https:\/\//i.test(invitationUrl);

    // High-contrast, phone-camera-friendly QR (same style that worked with Bifold).
    const qrDataUrl = await QRCode.toDataURL(invitationUrl, {
      errorCorrectionLevel: "M",
      margin: 4,
      width: 720,
      color: { dark: "#000000", light: "#ffffff" },
    });

    if (!phoneReady) {
      console.warn(
        "admin/issue: invitation is not HTTPS — Bifold will reject this QR. " +
          "Set UNIVERSITY_ENDPOINT/UNIVERSITY_WS_ENDPOINT to a Cloudflare/ngrok URL and recreate university-agent."
      );
    }

    res.json({
      issuanceId,
      qrDataUrl,
      invitationUrl,
      phoneReady,
      student: { student_name, student_id, department, email },
    });
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
