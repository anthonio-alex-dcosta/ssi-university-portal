import { useEffect, useState } from "react";
import PortalLayout from "../components/PortalLayout";
import { api } from "../lib/api";

const FIELD_LABELS = {
  student_name: "Full name",
  student_id: "Student ID",
  department: "Department",
  email: "Email address",
};

export default function Profile() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api("/api/profile")
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <PortalLayout title="Profile">
      {error && <p className="text-red-600">{error}</p>}
      {!data && !error && <p className="text-slate-500">Loading…</p>}
      {data && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
            <h3 className="mb-5 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Student information
            </h3>
            <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {data.credential.fields.map((field) => (
                <div key={field}>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    {FIELD_LABELS[field] || field}
                  </dt>
                  <dd className="mt-1 text-base font-medium text-slate-900">
                    {data.student[field]}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Verified credential
            </h3>
            <div className="rounded-xl border border-brand-100 bg-brand-50 p-4">
              <div className="flex items-center gap-2">
                <ShieldIcon className="h-5 w-5 text-brand-600" />
                <p className="font-medium text-brand-900">{data.credential.type}</p>
              </div>
              <p className="mt-2 text-sm text-brand-700">
                Issued by <span className="font-medium">{data.credential.issuer}</span>
              </p>
              <div className="mt-4 flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Verified via zero-knowledge proof
              </div>
            </div>
            <p className="mt-4 text-xs text-slate-400">
              This information was presented from your own wallet and cryptographically verified
              against BRAC University's credential definition &mdash; no central password
              database was involved.
            </p>
          </div>
        </div>
      )}
    </PortalLayout>
  );
}

function ShieldIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
