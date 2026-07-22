const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export async function api(path, opts = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json() : await res.text();
  if (!res.ok) {
    const message = (body && body.error) || `Request to ${path} failed (${res.status})`;
    throw new Error(message);
  }
  return body;
}

export { API_URL };
