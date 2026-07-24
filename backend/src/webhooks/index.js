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
  const requestedProof = indyPres?.requested_proof || {};
  const out = {};
  for (const [name, entry] of Object.entries(requestedProof.revealed_attrs || {})) {
    out[name] = entry.raw;
  }
  for (const group of Object.values(requestedProof.revealed_attr_groups || {})) {
    for (const [name, entry] of Object.entries(group.values || {})) {
      out[name] = entry.raw;
    }
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

// The actual credential offer is sent by the auto_issue_bridge ACA-Py
// plugin (see acapy-plugins/auto_issue_bridge), not from here — it reacts
// to this same "connection active" event synchronously, inside ACA-Py's
// own process, which is required for delivery to succeed for wallets with
// no public inbound endpoint (see the comment in admin.js's /issue route).
// This handler only updates status for the admin UI's benefit.
async function handleConnections(body) {
  const { state, connection_id: connectionId, invitation_msg_id: invitationMsgId } = body;
  if (state !== "completed" && state !== "active") return;
  if (!invitationMsgId) return;

  const attempt = issuanceAttempts.get(invitationMsgId);
  if (!attempt || attempt.status !== "pending_connection") return;

  attempt.status = "connected";
  attempt.connectionId = connectionId;
  issuanceAttempts.set(invitationMsgId, attempt);
}

function findIssuanceAttemptByConnection(connectionId) {
  for (const [issuanceId, attempt] of issuanceAttempts) {
    if (attempt.connectionId === connectionId && !attempt.credExId) {
      return issuanceId;
    }
  }
  return null;
}

async function handleIssueCredential(body) {
  const { cred_ex_id: credExId, connection_id: connectionId, state } = body;
  let issuanceId = credExToIssuanceId.get(credExId);
  if (!issuanceId && connectionId) {
    issuanceId = findIssuanceAttemptByConnection(connectionId);
    if (issuanceId) credExToIssuanceId.set(credExId, issuanceId);
  }
  if (!issuanceId) return;
  const attempt = issuanceAttempts.get(issuanceId);
  if (!attempt) return;

  attempt.credExId = credExId;
  if (state === "done") {
    attempt.status = "issued";
  } else if (state === "offer-sent") {
    attempt.status = "offer_sent";
  } else if (state === "credential-issued") {
    attempt.status = "awaiting_wallet_ack";
  } else if (state === "abandoned") {
    attempt.status = "failed";
  }
  issuanceAttempts.set(issuanceId, attempt);
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
