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
docker-compose.yml        # university-agent, student-agent (test wallet), backend
.env.example               # copy to .env — see scripts/setup-ledger.sh
backend/                   # Express API: webhooks, login/issuance routes, sessions
frontend/                  # React + Tailwind portal UI
scripts/
  setup-ledger.sh          # one-time: registers the university DID on BCovrin Test
  register-schema.js       # one-time: registers the Student ID schema + cred def
  simulate-wallet-scan.js  # stands in for "scan this QR" during automated testing
  e2e-test.sh              # full automated issue -> login -> protected pages -> logout test
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

This brings up three containers:

| Container | Purpose | Ports |
|---|---|---|
| `university-agent` | ACA-Py issuer + verifier for BRAC University | 8020 (DIDComm), 8021 (admin API) |
| `student-agent` | ACA-Py instance used **only** as a scriptable stand-in for a phone wallet, for automated testing | 8030 (DIDComm), 8031 (admin API) |
| `portal-backend` | Express API | 5000 |

Wait for both agents to report healthy:

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
   > ⚠️ This wipes the university agent's in-memory wallet (no volume is
   > mounted for it — this is a demo, not a production deployment). You'll
   > need to re-run `scripts/setup-ledger.sh` (it'll register a fresh DID
   > since `UNIVERSITY_SEED` is already set, it reuses it — safe) and
   > `node scripts/register-schema.js` again afterward.
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
- **Recreating `university-agent` or `student-agent` wipes their wallets.**
  Neither has a volume mounted, by design (this is a demo). If you edit
  `docker-compose.yml` and re-run `docker compose up -d`, any established
  connections/issued credentials on the recreated agent are gone — you'll
  need to re-issue.
- **QR code fails to render ("data too big")** — this only ever hit the
  *login* QR during development, because a connectionless proof request is
  larger than a plain connection invitation. Already fixed by using
  `errorCorrectionLevel: "L"` in `backend/src/routes/login.js` — mentioned
  here in case a future change to the requested attributes pushes the
  payload past a single QR's practical size limit.

## Bonus feature (not yet started)

The brief includes an optional bonus: 1-to-1 DIDComm messaging between two
wallets (e.g. student ↔ faculty). Per the brief, this is intentionally
**not implemented yet** — the core credential-login flow above is the
priority, and the bonus should only be started once you confirm you want
to spend time on it.
