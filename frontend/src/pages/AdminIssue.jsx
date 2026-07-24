import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

const STATUS_LABELS = {
  pending_connection: "Waiting for wallet to scan and connect…",
  connected: "Connected — sending credential offer…",
  offer_sent: "Offer sent — check your wallet and tap Accept…",
  awaiting_wallet_ack: "Wallet is storing the credential…",
  issued: "Credential issued!",
  failed: "Issuance failed",
};

const emptyForm = { student_name: "", student_id: "", department: "", email: "" };

export default function AdminIssue() {
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem("adminToken") || "");
  const [form, setForm] = useState(emptyForm);
  const [issuance, setIssuance] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef(null);

  useEffect(() => {
    localStorage.setItem("adminToken", adminToken);
  }, [adminToken]);

  useEffect(() => () => pollRef.current && clearInterval(pollRef.current), []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setCopied(false);
    setSubmitting(true);
    setIssuance(null);
    setStatus(null);
    if (pollRef.current) clearInterval(pollRef.current);

    try {
      const resp = await api("/api/admin/issue", {
        method: "POST",
        headers: { "x-admin-token": adminToken },
        body: JSON.stringify(form),
      });

      if (resp.phoneReady === false) {
        setError(
          "This QR is not HTTPS. Bifold will reject it. Keep the Cloudflare tunnel running, set UNIVERSITY_ENDPOINT / UNIVERSITY_WS_ENDPOINT in .env, recreate university-agent, then try again."
        );
      }

      setIssuance(resp);
      setStatus("pending_connection");

      pollRef.current = setInterval(async () => {
        try {
          const s = await api(`/api/admin/issue-status/${resp.issuanceId}`, {
            headers: { "x-admin-token": adminToken },
          });
          setStatus(s.status);
          if (s.status === "issued" || s.status === "failed") {
            clearInterval(pollRef.current);
          }
        } catch (err) {
          clearInterval(pollRef.current);
          setError(err.message);
        }
      }, 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    if (pollRef.current) clearInterval(pollRef.current);
    setForm(emptyForm);
    setIssuance(null);
    setStatus(null);
    setError(null);
    setCopied(false);
  }

  async function copyInvite() {
    if (!issuance?.invitationUrl) return;
    try {
      await navigator.clipboard.writeText(issuance.invitationUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy invite URL — select it manually below.");
    }
  }

  const statusTone =
    status === "issued" ? "ok" : status === "failed" ? "bad" : status ? "wait" : null;

  return (
    <div className="min-h-screen bg-slate-50 p-6 sm:p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-950 text-gold-400 font-bold">
              BU
            </div>
            <div>
              <p className="font-semibold text-slate-900">BRAC University — Registrar Tools</p>
              <p className="text-sm text-slate-500">Issue a Student ID verifiable credential</p>
            </div>
          </div>
          <Link
            to="/login"
            className="text-sm font-medium text-brand-700 underline-offset-2 hover:underline"
          >
            Go to student login →
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <form
            onSubmit={handleSubmit}
            className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Admin token
              </label>
              <input
                type="password"
                required
                autoComplete="off"
                value={adminToken}
                onChange={(e) => setAdminToken(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                placeholder="Shared admin token (.env ADMIN_TOKEN)"
              />
            </div>

            {[
              ["student_name", "Full name", "Maria"],
              ["student_id", "Student ID", "BRAC-20240002"],
              ["department", "Department", "Computer Science"],
              ["email", "Email address", "maria@bracu.ac.bd"],
            ].map(([key, label, placeholder]) => (
              <div key={key}>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                  {label}
                </label>
                <input
                  required
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              </div>
            ))}

            <div className="flex gap-3 pt-1">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
              >
                {submitting ? "Creating invitation…" : "Generate issuance QR"}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Reset
              </button>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </form>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Wallet QR
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Open <strong>Bifold → Scan</strong> (not the phone browser). Accept the connection,
              then accept the credential offer.
            </p>

            <div className="mt-5 flex justify-center">
              <div className="rounded-2xl bg-black p-4 shadow-lg">
                <div className="flex h-[min(72vw,22rem)] w-[min(72vw,22rem)] items-center justify-center bg-white p-3">
                  {issuance?.qrDataUrl ? (
                    <img
                      src={issuance.qrDataUrl}
                      alt="Issuance QR code"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <p className="px-4 text-center text-sm text-slate-400">
                      Fill in the form to generate a QR code
                    </p>
                  )}
                </div>
              </div>
            </div>

            {issuance && (
              <div className="mt-5 space-y-3">
                {issuance.student?.student_name && (
                  <p className="text-center text-sm font-semibold text-slate-800">
                    Issuing to {issuance.student.student_name}
                    {issuance.student.student_id ? ` (${issuance.student.student_id})` : ""}
                  </p>
                )}

                {status && (
                  <div className="flex items-center justify-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        statusTone === "ok"
                          ? "bg-emerald-500"
                          : statusTone === "bad"
                            ? "bg-red-500"
                            : "bg-amber-500"
                      }`}
                    />
                    <span
                      className={`text-sm font-medium ${
                        statusTone === "ok"
                          ? "text-emerald-700"
                          : statusTone === "bad"
                            ? "text-red-700"
                            : "text-slate-700"
                      }`}
                    >
                      {STATUS_LABELS[status] || status}
                    </span>
                  </div>
                )}

                {issuance.phoneReady !== false && status === "pending_connection" && (
                  <p className="text-center text-sm font-semibold text-emerald-700">
                    Credential offer ready — scan this QR with Bifold
                  </p>
                )}

                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={copyInvite}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {copied ? "Copied!" : "Copy invitation URL"}
                  </button>
                  {status === "issued" && (
                    <Link
                      to="/login"
                      className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
                    >
                      Test login →
                    </Link>
                  )}
                </div>

                <p className="break-all rounded-lg bg-slate-50 p-2 font-mono text-[10px] leading-relaxed text-slate-500">
                  {issuance.invitationUrl}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
