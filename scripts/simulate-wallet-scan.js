// Stands in for "scan this QR code with your phone" during automated testing.
// Decodes an out-of-band invitation URL and feeds it to the student-agent's
// admin API, exactly as a wallet app does after scanning the QR image.
//
// Usage: node scripts/simulate-wallet-scan.js "<invitationUrl>"

const STUDENT_ADMIN_URL = process.env.STUDENT_ADMIN_URL || "http://localhost:8031";

function decodeInvitation(invitationUrl) {
  const url = new URL(invitationUrl);
  const encoded = url.searchParams.get("oob") || url.searchParams.get("c_i");
  if (!encoded) throw new Error(`No oob/c_i param found in ${invitationUrl}`);
  const json = Buffer.from(encoded, "base64").toString("utf8");
  return JSON.parse(json);
}

async function main() {
  const invitationUrl = process.argv[2];
  if (!invitationUrl) {
    console.error("Usage: node scripts/simulate-wallet-scan.js <invitationUrl>");
    process.exit(1);
  }

  const invitation = decodeInvitation(invitationUrl);
  const res = await fetch(
    `${STUDENT_ADMIN_URL}/out-of-band/receive-invitation?auto_accept=true`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(invitation),
    }
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`receive-invitation failed (${res.status}): ${text}`);
  }
  console.log("Wallet accepted invitation:", text);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
