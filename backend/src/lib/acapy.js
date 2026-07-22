const config = require("../config");

async function acapy(urlPath, { method = "GET", body } = {}) {
  const res = await fetch(`${config.universityAdminUrl}${urlPath}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch (e) {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`ACA-Py ${method} ${urlPath} failed: ${res.status} ${text}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

module.exports = { acapy };
