const express = require("express");
const { acapy } = require("../lib/acapy");
const {
  loginAttempts,
  issuanceAttempts,
  credExToIssuanceId,
  messagesByConnection,
} = require("../lib/store");

const router = express.Router();

function extractRevealedAttrs(presRecord) {
  const indyPres = presRecord?.by_format?.pres?.indy;
  const revealed = indyPres?.requested_proof?.revealed_attrs || {};
  const out = {};
  for (const [name, entry] of Object.entries(revealed)) {
    out[name] = entry.raw;
  }
  return out;
}

async function handlePresentProof(body) {
  const { pres_ex_id: presExId, state } = body;
  if (!presExId || !loginAttempts.has(presExId)) return;

  if (state === "presentation-received") {
    loginAttempts.set(presExId, {
      ...loginAttempts.get(presExId),
      status: "presentation-received",
    });
    return;
  }

  if (state === "done") {
    let record = body;
    try {
      record = await acapy(`/present-proof-2.0/records/${presExId}`);
    } catch (e) {
      console.error("Failed to fetch presentation record", e);
    }
    const verified = record.verified === true || record.verified === "true";
    if (verified) {
      const studentData = extractRevealedAttrs(record);
      loginAttempts.set(presExId, {
        ...loginAttempts.get(presExId),
        status: "success",
        studentData,
      });
    } else {
      loginAttempts.set(presExId, {
        ...loginAttempts.get(presExId),
        status: "failed",
      });
    }
    return;
  }

  if (state === "abandoned") {
    loginAttempts.set(presExId, { ...loginAttempts.get(presExId), status: "failed" });
  }
}

async function handleConnections(body) {
  const { state, connection_id: connectionId, invitation_msg_id: invitationMsgId } = body;
  if (state !== "completed" && state !== "active") return;
  if (!invitationMsgId) return;

  const attempt = issuanceAttempts.get(invitationMsgId);
  if (!attempt || attempt.status !== "pending_connection") return;

  attempt.status = "connected";
  attempt.connectionId = connectionId;
  issuanceAttempts.set(invitationMsgId, attempt);

  try {
    const attrs = Object.entries(attempt.studentData).map(([name, value]) => ({
      name,
      value: String(value),
    }));

    const offerResp = await acapy("/issue-credential-2.0/send-offer", {
      method: "POST",
      body: {
        connection_id: connectionId,
        auto_issue: true,
        credential_preview: { "@type": "issue-credential/2.0/credential-preview", attributes: attrs },
        filter: { indy: { cred_def_id: require("../config").credDefId } },
      },
    });

    attempt.status = "offer_sent";
    attempt.credExId = offerResp.cred_ex_id;
    issuanceAttempts.set(invitationMsgId, attempt);
    credExToIssuanceId.set(offerResp.cred_ex_id, invitationMsgId);
  } catch (err) {
    console.error("Failed to send credential offer", err);
    attempt.status = "failed";
    issuanceAttempts.set(invitationMsgId, attempt);
  }
}

async function handleIssueCredential(body) {
  const { cred_ex_id: credExId, state } = body;
  const issuanceId = credExToIssuanceId.get(credExId);
  if (!issuanceId) return;
  const attempt = issuanceAttempts.get(issuanceId);
  if (!attempt) return;

  if (state === "done" || state === "credential-issued") {
    attempt.status = "issued";
    issuanceAttempts.set(issuanceId, attempt);
  } else if (state === "abandoned") {
    attempt.status = "failed";
    issuanceAttempts.set(issuanceId, attempt);
  }
}

function handleBasicMessage(body) {
  const { connection_id: connectionId, content } = body;
  if (!connectionId || !content) return;
  const history = messagesByConnection.get(connectionId) || [];
  history.push({ sender: "them", content, timestamp: new Date().toISOString() });
  messagesByConnection.set(connectionId, history);
}

// ACA-Py is configured (see docker-compose.yml) to post webhooks to
// /webhooks/<agent>/topic/<topic>, where <agent> is "university", "student",
// or "faculty" — that lets one backend disambiguate which of the three
// agent containers an event came from.
router.post("/:agent/topic/:topic", async (req, res) => {
  const { agent, topic } = req.params;
  const body = req.body;
  try {
    if (agent === "university") {
      if (topic === "present_proof_v2_0") await handlePresentProof(body);
      else if (topic === "connections") await handleConnections(body);
      else if (topic === "issue_credential_v2_0") await handleIssueCredential(body);
    } else if (agent === "student" || agent === "faculty") {
      if (topic === "basicmessages") handleBasicMessage(body);
    }
  } catch (err) {
    console.error(`Error handling webhook ${agent}/${topic}`, err);
  }
  res.status(200).json({ ok: true });
});

module.exports = router;
