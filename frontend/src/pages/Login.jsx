import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const STAGES = {
  pending: { label: "Waiting for scan…", tone: "waiting" },
  "presentation-received": { label: "Verifying…", tone: "verifying" },
  success: { label: "Success", tone: "success" },
  failed: { label: "Verification failed", tone: "failed" },
};

export default function Login() {
  const [phase, setPhase] = useState("loading"); // loading | ready | polling | error
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [stage, setStage] = useState("pending");
  const [error, setError] = useState(null);
  const pollRef = useRef(null);
  const navigate = useNavigate();
  const { refresh } = useAuth();

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startLogin = useCallback(async () => {
    stopPolling();
    setError(null);
    setStage("pending");
    setPhase("loading");
    try {
      const { loginId, qrDataUrl } = await api("/api/login/init");
      setQrDataUrl(qrDataUrl);
      setPhase("polling");

      pollRef.current = setInterval(async () => {
        try {
          const status = await api(`/api/login/status/${loginId}`);
          setStage(status.status);
          if (status.status === "success") {
            stopPolling();
            await refresh();
            setTimeout(() => navigate("/dashboard", { replace: true }), 600);
          } else if (status.status === "failed") {
            stopPolling();
          }
        } catch (err) {
          stopPolling();
          setError(err.message);
          setPhase("error");
        }
      }, 2000);
    } catch (err) {
      setError(err.message);
      setPhase("error");
    }
  }, [navigate, refresh, stopPolling]);

  useEffect(() => {
    startLogin();
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeStage = STAGES[stage] || STAGES.pending;

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-brand-950 p-12 text-white lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, #6089fa 0%, transparent 40%), radial-gradient(circle at 80% 70%, #f2c94c 0%, transparent 35%)",
          }}
        />
        <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-gold-500 text-brand-950 font-bold">
            BU
          </div>
          <div>
            <p className="font-semibold leading-tight">BRAC University</p>
            <p className="text-sm text-brand-300">Student Portal</p>
          </div>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-3xl font-semibold leading-tight">
            Sign in with your Student ID credential.
          </h1>
          <p className="mt-4 text-brand-200">
            No passwords to remember or leak. Your university-issued verifiable credential,
            held privately in your own wallet app, proves who you are — cryptographically,
            in seconds.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-brand-200">
            <li className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-400" />
              You control your identity data — it never leaves your device.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-400" />
              Built on the Hyperledger Aries / AnonCreds SSI stack.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-400" />
              Verified on a public Indy test ledger, in real time.
            </li>
          </ul>
        </div>

        <p className="relative text-xs text-brand-400">
          &copy; {new Date().getFullYear()} BRAC University &mdash; SSI Research Assistant Demo
        </p>
      </div>

      <div className="flex flex-col items-center justify-center bg-slate-50 p-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center lg:hidden">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-brand-950 text-gold-400 font-bold">
              BU
            </div>
            <p className="font-semibold text-slate-900">BRAC University Student Portal</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Scan to log in</h2>
            <p className="mt-1 text-sm text-slate-500">
              Open your Aries wallet app (e.g. Bifold) and scan the code below to present your
              Student ID credential.
            </p>

            <div className="mt-6 flex items-center justify-center">
              <div className="relative flex h-64 w-64 items-center justify-center rounded-xl border-2 border-dashed border-brand-200 bg-brand-50 p-3">
                {phase === "loading" && (
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
                )}
                {phase !== "loading" && qrDataUrl && stage !== "success" && (
                  <img src={qrDataUrl} alt="Login QR code" className="h-full w-full rounded-lg" />
                )}
                {stage === "success" && (
                  <div className="flex flex-col items-center gap-2 text-brand-700">
                    <CheckIcon className="h-14 w-14" />
                  </div>
                )}
                {phase === "error" && (
                  <div className="px-4 text-center text-sm text-red-600">{error}</div>
                )}
              </div>
            </div>

            <div className="mt-6 flex items-center justify-center gap-2">
              <StatusDot tone={activeStage.tone} />
              <span
                className={`text-sm font-medium ${
                  activeStage.tone === "success"
                    ? "text-emerald-600"
                    : activeStage.tone === "failed"
                    ? "text-red-600"
                    : "text-slate-600"
                }`}
              >
                {phase === "error" ? "Something went wrong" : activeStage.label}
              </span>
            </div>

            {(stage === "failed" || phase === "error") && (
              <button
                onClick={startLogin}
                className="mt-6 w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
              >
                Try again
              </button>
            )}

            <p className="mt-6 text-center text-xs text-slate-400">
              Don't have the credential yet? Ask the registrar's office to issue your Student ID
              credential via the admin panel.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusDot({ tone }) {
  const color =
    tone === "success"
      ? "bg-emerald-500"
      : tone === "failed"
      ? "bg-red-500"
      : tone === "verifying"
      ? "bg-amber-500"
      : "bg-brand-500";
  return (
    <span className="relative flex h-2.5 w-2.5">
      {(tone === "waiting" || tone === "verifying") && (
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full ${color} opacity-75`}
        />
      )}
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${color}`} />
    </span>
  );
}

function CheckIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <circle cx="12" cy="12" r="10" className="text-emerald-100" fill="currentColor" stroke="none" />
      <path d="M8 12.5l2.5 2.5L16 9" stroke="#059669" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
