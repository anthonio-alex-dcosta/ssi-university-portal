const config = require("../config");

function makeClient(baseUrl) {
  return async function acapyCall(urlPath, { method = "GET", body } = {}) {
    const res = await fetch(`${baseUrl}${urlPath}`, {
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
  };
}

const acapy = makeClient(config.universityAdminUrl);

const agentAdminUrls = {
  university: config.universityAdminUrl,
  student: config.studentAdminUrl,
  faculty: config.facultyAdminUrl,
};

function acapyFor(role) {
  const baseUrl = agentAdminUrls[role];
  if (!baseUrl) throw new Error(`Unknown agent role: ${role}`);
  return makeClient(baseUrl);
}

module.exports = { acapy, acapyFor };
