import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PortalLayout from "../components/PortalLayout";
import { api } from "../lib/api";

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api("/api/dashboard")
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <PortalLayout title="Dashboard">
      {error && <p className="text-red-600">{error}</p>}
      {!data && !error && <p className="text-slate-500">Loading…</p>}
      {data && (
        <div className="space-y-8">
          <div className="rounded-2xl bg-gradient-to-r from-brand-700 to-brand-900 p-8 text-white">
            <p className="text-sm text-brand-200">Welcome back,</p>
            <h2 className="mt-1 text-2xl font-semibold">{data.student.student_name}</h2>
            <p className="mt-2 text-sm text-brand-200">
              Logged in with your verified Student ID credential — no password required.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            {data.quickStats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  {stat.label}
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{stat.value}</p>
              </div>
            ))}
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Announcements
            </h3>
            <div className="space-y-4">
              {data.announcements.map((a) => (
                <div
                  key={a.title}
                  className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <h4 className="font-medium text-slate-900">{a.title}</h4>
                    <span className="shrink-0 text-xs text-slate-400">{a.date}</span>
                  </div>
                  <p className="mt-1.5 text-sm text-slate-600">{a.body}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-dashed border-brand-200 bg-brand-50 p-5">
            <div>
              <p className="text-sm font-semibold text-brand-900">
                Bonus: DIDComm messaging demo
              </p>
              <p className="mt-0.5 text-sm text-brand-700">
                Connect wallet-to-wallet with a faculty member and exchange messages directly.
              </p>
            </div>
            <Link
              to="/messaging/student"
              target="_blank"
              className="shrink-0 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Open messaging
            </Link>
          </div>
        </div>
      )}
    </PortalLayout>
  );
}
