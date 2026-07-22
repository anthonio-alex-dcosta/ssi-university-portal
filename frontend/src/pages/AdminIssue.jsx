import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

const STATUS_LABELS = {
  pending_connection: "Waiting for wallet to scan and connect…",
  connected: "Connected — sending credential offer…",
  offer_sent: "Offer sent — waiting for wallet to accept…",
  issued: "Credential issued!",
  failed: "Issuance failed",
};

const emptyForm = { student_name: "", student_id: "", department: "", email: "" };

export default function AdminIssue() {
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem("adminToken") || "");
  const [form, setForm] = useState(emptyForm);
  const [issuance, setIssuance] = useState(null); // { issuanceId, qrDataUrl }
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef(null);

  useEffect(() => {
    localStorage.setItem("adminToken", adminToken);
  }, [adminToken]);

  useEffect(() => () => pollRef.current && clearInterval(pollRef.current), []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
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

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-950 text-gold-400 font-bold">
            BU
          </div>
          <div>
            <p className="font-semibold text-slate-900">BRAC University &mdash; Registrar Tools</p>
            <p className="text-sm text-slate-500">Issue a Student ID verifiable credential</p>
          </div>
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
                value={adminToken}
                onChange={(e) => setAdminToken(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                placeholder="Shared admin token (.env ADMIN_TOKEN)"
              />
            </div>

            {[
              ["student_name", "Full name", "Alex D Costa"],
              ["student_id", "Student ID", "BRAC-20220001"],
              ["department", "Department", "Computer Science"],
              ["email", "Email address", "alex@bracu.ac.bd"],
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

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting ? "Creating invitation…" : "Generate issuance QR"}
            </button>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </form>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Wallet connection
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Scan with the student's wallet app to receive the credential. For automated
              testing without a phone, run{" "}
              <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">
                node scripts/simulate-wallet-scan.js &lt;invitationUrl&gt;
              </code>
              .
            </p>

            <div className="mt-6 flex items-center justify-center">
              <div className="flex h-56 w-56 items-center justify-center rounded-xl border-2 border-dashed border-brand-200 bg-brand-50 p-3">
                {issuance ? (
                  <img src={issuance.qrDataUrl} alt="Issuance QR code" className="h-full w-full rounded-lg" />
                ) : (
                  <p className="px-4 text-center text-sm text-slate-400">
                    Fill in the form to generate a QR code
                  </p>
                )}
              </div>
            </div>

            {status && (
              <div className="mt-5 flex items-center justify-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    status === "issued"
                      ? "bg-emerald-500"
                      : status === "failed"
                      ? "bg-red-500"
                      : "bg-amber-500"
                  }`}
                />
                <span className="text-sm font-medium text-slate-700">
                  {STATUS_LABELS[status] || status}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
