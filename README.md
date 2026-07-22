# SSI University Portal

A university student portal where login happens by **presenting a Verifiable
Credential** from a digital wallet (e.g. Aries Bifold) instead of typing a
password. Built with [ACA-Py](https://github.com/openwallet-foundation/acapy)
(Hyperledger Aries), a public Indy test ledger, an Express backend, and a
React/Tailwind frontend.

## How it works

1. The **registrar** (an admin page) issues a "Student ID" credential
   (`student_name`, `student_id`, `department`, `email`) to a student's
   wallet, over a DIDComm connection established by scanning a QR code.
2. The **student** logs in by scanning a second QR code on the portal's
   login page. That QR encodes a connectionless **present-proof request**
   for the Student ID credential — no prior connection needed.
3. The wallet presents the requested attributes as a zero-knowledge proof.
   ACA-Py verifies it against the credential definition on the ledger and
   webhooks the result to the backend.
4. The backend turns a successful, verified proof into a normal
   **httpOnly session cookie**, and the student can browse the Dashboard
   and Profile pages until they log out.

## Architecture & why these choices

| Piece | Choice | Why |
|---|---|---|
| SSI agent | **ACA-Py** (`ghcr.io/openwallet-foundation/acapy-agent:1.6.0`), one instance acting as issuer **and** verifier for the university, plus a second instance used only as a scriptable test wallet | One agent process can hold both the issuer and verifier roles for a single organization — running a separate "verifier agent" would add containers without adding anything a demo needs. |
| Ledger | **Public BCovrin Test network** (`https://test.bcovrin.vonx.io`), not a local VON-network | Aries wallets (Bifold included) ship with BCovrin Test as a **built-in, pre-configured ledger**. A local VON-network would need its genesis file side-loaded into Bifold (usually meaning a custom build), which is a much bigger risk to a phone-based demo actually working than depending on a public test ledger. ACA-Py itself still runs entirely locally in Docker — only ledger reads/writes go out to the public network, exactly like the standard ACA-Py "Faber/Alice" demos do. |
| Credential format | Legacy **Indy/AnonCreds** (`askar` wallet type, `/schemas`, `/credential-definitions`, `issue-credential-2.0`, `present-proof-2.0` with the `indy` format) | Most broadly supported format across Aries wallets today, including Bifold. |
| Backend | **Node/Express** | Fastest, most direct integration with ACA-Py's admin API (plain `fetch`) and webhook callbacks (plain Express routes). |
| Frontend | **React + Vite + Tailwind v4** | Fast dev loop for the QR/polling UI, and Tailwind for the visual polish the demo needs. |
| Session | `express-session` cookie, set the moment a `present-proof` exchange webhooks back `verified: true` | Simplest correct mapping from "proof verified" to "logged in", no separate token exchange needed. |

## Repository layout

```
docker-compose.yml         # university/student/faculty ACA-Py agents + backend
.env.example                # copy to .env — see scripts/setup-ledger.sh
backend/                    # Express API: webhooks, login/issuance/messaging routes, sessions
frontend/                   # React + Tailwind portal UI
scripts/
  setup-ledger.sh           # one-time: registers the university DID on BCovrin Test
  register-schema.js        # one-time: registers the Student ID schema + cred def
  simulate-wallet-scan.js   # stands in for "scan this QR" during automated testing
  e2e-test.sh               # full automated issue -> login -> protected pages -> logout test
  e2e-messaging-test.sh     # full automated bonus DIDComm messaging test
```

## Prerequisites

Already covered on this machine (WSL2 Ubuntu + Docker Desktop + Node), per the
project brief. You'll additionally need, **only if you want to test with a
real phone wallet**:

- A phone with [Aries Bifold](https://github.com/openwallet-foundation/bifold-wallet)
  installed (or built from source — see "Connecting a real wallet" below).
- [ngrok](https://ngrok.com/) (or any HTTP tunnel) — free tier is enough.

## 1. One-time setup

```bash
cd ~/ssi-university-portal

# Registers a DID for the university issuer on the public BCovrin Test ledger,
# and fills in .env with generated secrets (session secret, admin token, wallet keys).
bash scripts/setup-ledger.sh
```

This creates `.env` from `.env.example` if it doesn't exist yet, and is safe
to re-run (it won't overwrite an already-registered DID).

## 2. Start the agents + backend

```bash
docker compose up -d --build
```

This brings up four containers:

| Container | Purpose | Ports |
|---|---|---|
| `university-agent` | ACA-Py issuer + verifier for BRAC University | 8020 (DIDComm), 8021 (admin API) |
| `student-agent` | ACA-Py instance used as a scriptable stand-in for a phone wallet (credential login testing), and as the "student" side of the bonus messaging demo | 8030 (DIDComm), 8031 (admin API) |
| `faculty-agent` | ACA-Py instance used as the "faculty" side of the bonus messaging demo | 8040 (DIDComm), 8041 (admin API) |
| `portal-backend` | Express API | 5000 |

Each agent's wallet is stored in a named Docker volume, so recreating a
container (e.g. after a `docker-compose.yml` change) does **not** lose
issued credentials or connections — only `docker compose down -v` or
deleting the volume does.

Wait for all agents to report healthy:

```bash
docker compose ps
```

Then register the Student ID schema and credential definition (one-time,
safe to re-run):

```bash
node scripts/register-schema.js
```

This writes `backend/ledger-config.json`, which the backend reads (live,
on every request — no restart needed) to know the credential definition ID
to request proofs against.

## 3. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Visit **http://localhost:5173**.

## 4. Run the demo

### Automated (no phone required)

The `student-agent` container is a second ACA-Py instance with ACA-Py's
built-in holder auto-response flags turned on
(`--auto-respond-credential-offer --auto-store-credential
--auto-respond-presentation-request`), so it behaves like an
always-accepting wallet. `scripts/simulate-wallet-scan.js` feeds it an
invitation URL exactly as a phone would after scanning a QR code.

```bash
bash scripts/e2e-test.sh
```

This runs the entire flow end-to-end: issues a credential, logs in via
proof, hits `/api/me`, `/api/dashboard`, `/api/profile`, logs out, and
confirms the protected routes are denied afterward. Useful for confirming
the whole pipeline works after any change, without touching a phone.

### With the real UI (still no phone — using the test wallet)

1. Open **http://localhost:5173/admin/issue**.
2. Enter the admin token (find it with `grep ADMIN_TOKEN .env`).
3. Fill in a student's details and click **Generate issuance QR**.
4. In a terminal, run:
   ```bash
   node scripts/simulate-wallet-scan.js "<invitationUrl printed under the QR — copy from browser devtools network tab, or see below>"
   ```
   Tip: the invitation URL is also returned in the JSON body of the
   `/api/admin/issue` request, visible in the browser's Network tab.
5. Wait for the status under the QR to reach **"Credential issued!"**.
6. Open **http://localhost:5173/login**, and again run
   `simulate-wallet-scan.js` with the *login* QR's invitation URL (same
   way, via the Network tab on the `/api/login/init` request).
7. The status indicator goes **Waiting for scan… → Verifying… → Success**,
   and you land on the Dashboard.
8. Visit **Profile**, then **Log out**, and confirm you're returned to the
   login page.

### With a real phone wallet (Bifold)

This is the one part of the demo that needs manual, outside-of-code steps:

**Manual steps you do:**

1. **Expose the university agent publicly.** ACA-Py needs a DIDComm
   endpoint your phone can reach — your laptop's `localhost` isn't
   reachable from a phone on its own network.
   ```bash
   ngrok http 8020
   ```
   Copy the `https://....ngrok-free.app` URL it prints.
2. **Point the agent at that URL.** Edit `.env`:
   ```
   UNIVERSITY_ENDPOINT=https://<your-ngrok-subdomain>.ngrok-free.app
   ```
   Then recreate the agent so it re-announces this endpoint:
   ```bash
   docker compose up -d university-agent
   ```
   The agent's wallet persists across this (see the volumes note above), so
   there's no need to re-run the setup scripts — just recreate the
   container and it picks up the new endpoint on its next connection.
3. **Install Bifold.** Either sideload a release APK/TestFlight build if
   one is available for your platform, or build it from source
   (`git clone https://github.com/openwallet-foundation/bifold-wallet`) —
   Bifold ships with **BCovrin Test** as a selectable ledger, which is
   exactly the ledger this project uses, so no genesis file needs to be
   configured by hand.
4. **Scan the issuance QR** from `http://localhost:5173/admin/issue` with
   Bifold, accept the connection, then accept the incoming Student ID
   credential offer.
5. **Scan the login QR** from `http://localhost:5173/login` with Bifold,
   and approve sharing the requested attributes.
6. The portal logs you in exactly as in the automated flow above.

## Troubleshooting

- **`docker compose ps` shows a container unhealthy** — check
  `docker logs university-agent` / `docker logs student-agent`; the most
  common cause is the BCovrin Test ledger being briefly unreachable
  (`GENESIS_URL` fetch failure at startup) — just restart the container.
- **Starting fresh / wiping everything** — `docker compose down -v` removes
  the named wallet volumes too, so the next `docker compose up -d --build`
  starts with genuinely empty wallets (you'll need to redo the one-time
  setup: `setup-ledger.sh` then `register-schema.js`).
- **QR code fails to render ("data too big")** — this only ever hit the
  *login* QR during development, because a connectionless proof request is
  larger than a plain connection invitation. Already fixed by using
  `errorCorrectionLevel: "L"` in `backend/src/routes/login.js` — mentioned
  here in case a future change to the requested attributes pushes the
  payload past a single QR's practical size limit.

## Bonus: 1-to-1 DIDComm messaging

Two independent ACA-Py agents (`student-agent`, `faculty-agent` — the same
containers used for automated credential-login testing) each expose a small
chat UI. Either side generates a connection invitation; the other side
scans/pastes it to connect directly, peer-to-peer, with no involvement from
the university agent. Once connected, both sides exchange plain text
messages over DIDComm's `basicmessage` protocol.

This is deliberately **separate from the student login system** — there's
no session/auth requirement to reach it, since it's a standalone protocol
demo, not a portal feature.

### Automated (no phone required)

```bash
bash scripts/e2e-messaging-test.sh
```

Creates a faculty invitation, connects the student side to it, sends a
message each way, and confirms both sides received the other's message.

### With the real UI

1. Open **http://localhost:5173/messaging/faculty** in one browser tab/window.
2. Open **http://localhost:5173/messaging/student** in another.
3. On the faculty tab, click **Generate invitation** — a QR code and a
   copyable link both appear.
4. On the student tab, paste that link into **Connect to a faculty member**
   and click **Connect**. (To use a real phone wallet instead of the second
   browser tab for one side, scan the QR with Bifold — the same
   ngrok/endpoint setup described above applies.)
5. Within a few seconds, both tabs show the other party under
   **Conversations** — click it to open the chat thread.
6. Type a message on either side and hit **Send**; it appears on the other
   tab within ~1.5s (polling interval).

A shortcut link to `/messaging/student` is also on the Dashboard, under
"Bonus: DIDComm messaging demo".
