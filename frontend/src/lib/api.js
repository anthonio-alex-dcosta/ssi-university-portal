// Prefer same-origin /api (Vite proxy → backend). Override with VITE_API_URL if set.
const API_URL = import.meta.env.VITE_API_URL || "";

export async function api(path, opts = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
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
