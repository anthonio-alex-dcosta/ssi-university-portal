import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";

const ROLE_META = {
  student: { label: "Student", other: "faculty member", accent: "brand" },
  faculty: { label: "Faculty member", other: "student", accent: "gold" },
};

export default function Messaging() {
  const { role } = useParams();
  const meta = ROLE_META[role];

  const [connections, setConnections] = useState([]);
  const [activeConn, setActiveConn] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [myInvite, setMyInvite] = useState(null);
  const [pasteValue, setPasteValue] = useState("");
  const [error, setError] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const pollRef = useRef(null);

  const loadConnections = useCallback(async () => {
    try {
      const { connections } = await api(`/api/messaging/${role}/connections`);
      setConnections(connections);
    } catch (err) {
      setError(err.message);
    }
  }, [role]);

  useEffect(() => {
    if (!meta) return;
    loadConnections();
    const id = setInterval(loadConnections, 3000);
    return () => clearInterval(id);
  }, [meta, loadConnections]);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (!activeConn) return;
    const poll = async () => {
      try {
        const { messages } = await api(
          `/api/messaging/${role}/messages/${activeConn.connectionId}`
        );
        setMessages(messages);
      } catch (err) {
        setError(err.message);
      }
    };
    poll();
    pollRef.current = setInterval(poll, 1500);
    return () => clearInterval(pollRef.current);
  }, [activeConn, role]);

  async function generateInvite() {
    setError(null);
    try {
      const resp = await api(`/api/messaging/${role}/invite`, { method: "POST" });
      setMyInvite(resp);
    } catch (err) {
      setError(err.message);
    }
  }

  async function connectToOther() {
    if (!pasteValue.trim()) return;
    setError(null);
    setConnecting(true);
    try {
      await api(`/api/messaging/${role}/connect`, {
        method: "POST",
        body: JSON.stringify({ invitationUrl: pasteValue.trim() }),
      });
      setPasteValue("");
      await loadConnections();
    } catch (err) {
      setError(err.message);
    } finally {
      setConnecting(false);
    }
  }

  async function sendMessage(e) {
    e.preventDefault();
    if (!draft.trim() || !activeConn) return;
    const content = draft.trim();
    setDraft("");
    setMessages((m) => [...m, { sender: "me", content, timestamp: new Date().toISOString() }]);
    try {
      await api(`/api/messaging/${role}/send`, {
        method: "POST",
        body: JSON.stringify({ connectionId: activeConn.connectionId, content }),
      });
    } catch (err) {
      setError(err.message);
    }
  }

  if (!meta) {
    return (
      <div className="p-8 text-red-600">
        Unknown role "{role}". Use /messaging/student or /messaging/faculty.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-950 text-gold-400 font-bold">
              BU
            </div>
            <div>
              <p className="font-semibold text-slate-900">
                DIDComm Messaging &mdash; {meta.label} view
              </p>
              <p className="text-sm text-slate-500">
                Bonus demo: connect directly with a {meta.other}'s wallet and exchange messages.
              </p>
            </div>
          </div>
          <Link to="/dashboard" className="text-sm text-brand-600 hover:underline">
            &larr; Back to portal
          </Link>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-1">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Your invitation
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Share this so a {meta.other} can connect to you.
              </p>
              {!myInvite ? (
                <button
                  onClick={generateInvite}
                  className="mt-3 w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                >
                  Generate invitation
                </button>
              ) : (
                <div className="mt-3">
                  <img
                    src={myInvite.qrDataUrl}
                    alt="Invitation QR"
                    className="mx-auto h-40 w-40 rounded-lg border border-slate-200"
                  />
                  <textarea
                    readOnly
                    value={myInvite.invitationUrl}
                    onClick={(e) => e.target.select()}
                    className="mt-3 h-16 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-500"
                  />
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Connect to a {meta.other}
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Paste the invitation link they shared with you.
              </p>
              <textarea
                value={pasteValue}
                onChange={(e) => setPasteValue(e.target.value)}
                placeholder="https://...?oob=..."
                className="mt-3 h-20 w-full resize-none rounded-lg border border-slate-300 p-2 text-xs focus:border-brand-500 focus:outline-none"
              />
              <button
                onClick={connectToOther}
                disabled={connecting}
                className="mt-2 w-full rounded-lg border border-brand-600 px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50"
              >
                {connecting ? "Connecting…" : "Connect"}
              </button>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                Conversations
              </h3>
              {connections.length === 0 && (
                <p className="text-sm text-slate-400">No connections yet.</p>
              )}
              <div className="space-y-1.5">
                {connections.map((c) => (
                  <button
                    key={c.connectionId}
                    onClick={() => setActiveConn(c)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      activeConn?.connectionId === c.connectionId
                        ? "bg-brand-600 text-white"
                        : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {c.theirLabel}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-span-2">
            {!activeConn ? (
              <div className="flex h-full min-h-[400px] items-center justify-center p-8 text-center text-sm text-slate-400">
                Select a conversation, or connect to a {meta.other} to start one.
              </div>
            ) : (
              <div className="flex h-[500px] flex-col">
                <div className="border-b border-slate-200 px-5 py-3">
                  <p className="font-medium text-slate-900">{activeConn.theirLabel}</p>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto p-5">
                  {messages.length === 0 && (
                    <p className="text-center text-sm text-slate-400">No messages yet — say hi.</p>
                  )}
                  {messages.map((m, i) => (
                    <div
                      key={i}
                      className={`flex ${m.sender === "me" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-xs rounded-2xl px-4 py-2 text-sm ${
                          m.sender === "me"
                            ? "bg-brand-600 text-white"
                            : "bg-slate-100 text-slate-800"
                        }`}
                      >
                        {m.content}
                      </div>
                    </div>
                  ))}
                </div>
                <form onSubmit={sendMessage} className="flex gap-2 border-t border-slate-200 p-3">
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Type a message…"
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                  >
                    Send
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
