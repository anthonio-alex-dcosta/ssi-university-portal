const express = require("express");
const QRCode = require("qrcode");
const { acapyFor } = require("../lib/acapy");
const { messagesByConnection } = require("../lib/store");

const router = express.Router();

const ROLE_LABELS = {
  student: "Student",
  faculty: "Faculty member",
};

function requireRole(req, res, next) {
  if (!ROLE_LABELS[req.params.role]) {
    return res.status(404).json({ error: `Unknown role: ${req.params.role}` });
  }
  next();
}

function decodeInvitation(invitationUrl) {
  const url = new URL(invitationUrl);
  const encoded = url.searchParams.get("oob") || url.searchParams.get("c_i");
  if (!encoded) throw new Error("No oob/c_i param found in that invitation URL");
  const json = Buffer.from(encoded, "base64").toString("utf8");
  return JSON.parse(json);
}

// Create a plain (non-credential) connection invitation from this role's
// agent, for the other party to scan/paste — the bonus 1:1 DIDComm chat.
router.post("/:role/invite", requireRole, async (req, res) => {
  try {
    const acapy = acapyFor(req.params.role);
    const oobResp = await acapy("/out-of-band/create-invitation?auto_accept=true", {
      method: "POST",
      body: {
        alias: `Chat with ${ROLE_LABELS[req.params.role]}`,
        my_label: ROLE_LABELS[req.params.role],
        handshake_protocols: ["https://didcomm.org/didexchange/1.0"],
      },
    });
    const qrDataUrl = await QRCode.toDataURL(oobResp.invitation_url, {
      margin: 4,
      width: 600,
      errorCorrectionLevel: "L",
    });
    res.json({ invitationUrl: oobResp.invitation_url, qrDataUrl });
  } catch (err) {
    console.error("messaging/invite failed", err);
    res.status(500).json({ error: err.message });
  }
});

// Accept the other party's invitation — the "scan their QR" step, done here
// via pasted URL so it works without a second physical device.
router.post("/:role/connect", requireRole, async (req, res) => {
  try {
    const { invitationUrl } = req.body || {};
    if (!invitationUrl) return res.status(400).json({ error: "invitationUrl is required" });
    const acapy = acapyFor(req.params.role);
    const invitation = decodeInvitation(invitationUrl);
    const record = await acapy("/out-of-band/receive-invitation?auto_accept=true", {
      method: "POST",
      body: invitation,
    });
    res.json({ connectionId: record.connection_id, state: record.state });
  } catch (err) {
    console.error("messaging/connect failed", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/:role/connections", requireRole, async (req, res) => {
  try {
    const acapy = acapyFor(req.params.role);
    const resp = await acapy("/connections");
    const connections = (resp.results || [])
      .filter((c) => c.state === "active" || c.state === "completed")
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map((c) => ({
        connectionId: c.connection_id,
        theirLabel: c.their_label || "Unknown",
        state: c.state,
        createdAt: c.created_at,
      }));
    res.json({ connections });
  } catch (err) {
    console.error("messaging/connections failed", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/:role/messages/:connectionId", requireRole, (req, res) => {
  res.json({ messages: messagesByConnection.get(req.params.connectionId) || [] });
});

router.post("/:role/send", requireRole, async (req, res) => {
  try {
    const { connectionId, content } = req.body || {};
    if (!connectionId || !content) {
      return res.status(400).json({ error: "connectionId and content are required" });
    }
    const acapy = acapyFor(req.params.role);
    await acapy(`/connections/${connectionId}/send-message`, {
      method: "POST",
      body: { content },
    });
    const history = messagesByConnection.get(connectionId) || [];
    history.push({ sender: "me", content, timestamp: new Date().toISOString() });
    messagesByConnection.set(connectionId, history);
    res.json({ ok: true });
  } catch (err) {
    console.error("messaging/send failed", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
