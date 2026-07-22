const express = require("express");
const QRCode = require("qrcode");
const { acapy } = require("../lib/acapy");
const { loginAttempts } = require("../lib/store");
const config = require("../config");

const router = express.Router();

function buildProofRequest() {
  const credDefId = config.credDefId;
  if (!credDefId) {
    throw new Error(
      "No credential definition registered yet. Run scripts/register-schema.js first."
    );
  }
  const attrNames = config.schemaAttributes;
  const requested_attributes = {};
  for (const attr of attrNames) {
    requested_attributes[attr] = {
      name: attr,
      restrictions: [{ cred_def_id: credDefId }],
    };
  }
  return {
    name: "BRAC University Portal Login",
    version: "1.0",
    requested_attributes,
    requested_predicates: {},
  };
}

// Kick off a new login attempt: create a connectionless proof request,
// wrap it in an out-of-band invitation, and return a QR code for it.
router.get("/init", async (req, res) => {
  try {
    const presRequest = buildProofRequest();

    const createResp = await acapy("/present-proof-2.0/create-request", {
      method: "POST",
      body: {
        presentation_request: { indy: presRequest },
        auto_verify: true,
        auto_remove: false,
        comment: "BRAC University Portal login",
      },
    });
    const presExId = createResp.pres_ex_id;

    const oobResp = await acapy("/out-of-band/create-invitation?auto_accept=true", {
      method: "POST",
      body: {
        alias: "BRAC University Portal Login",
        goal_code: "aries.vc.verify",
        goal: "Log in to the BRAC University Student Portal",
        attachments: [{ id: presExId, type: "present-proof" }],
      },
    });

    loginAttempts.set(presExId, { status: "pending", createdAt: Date.now() });

    const qrDataUrl = await QRCode.toDataURL(oobResp.invitation_url, {
      margin: 1,
      width: 320,
      errorCorrectionLevel: "L",
    });

    res.json({ loginId: presExId, qrDataUrl, invitationUrl: oobResp.invitation_url });
  } catch (err) {
    console.error("login/init failed", err);
    res.status(500).json({ error: err.message });
  }
});

const STATUS_MESSAGES = {
  pending: "Waiting for scan…",
  "presentation-received": "Verifying…",
  verifying: "Verifying…",
  success: "Success",
  failed: "Verification failed",
  abandoned: "Verification failed",
};

router.get("/status/:loginId", (req, res) => {
  const attempt = loginAttempts.get(req.params.loginId);
  if (!attempt) return res.status(404).json({ error: "Unknown login attempt" });

  if (attempt.status === "success") {
    req.session.student = attempt.studentData;
    req.session.loginId = req.params.loginId;
  }

  res.json({
    status: attempt.status,
    message: STATUS_MESSAGES[attempt.status] || "Waiting for scan…",
    studentData: attempt.status === "success" ? attempt.studentData : undefined,
  });
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

module.exports = router;
