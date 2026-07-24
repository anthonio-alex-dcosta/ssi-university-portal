const http = require("http");
const httpProxy = require("http-proxy");

const HTTP_TARGET = process.env.HTTP_TARGET || "http://university-agent:8020";
const WS_TARGET = process.env.WS_TARGET || "http://university-agent:8022";
const PORT = process.env.PORT || 8023;

const proxy = httpProxy.createProxyServer({});

proxy.on("error", (err, req, res) => {
  console.error("Proxy error:", err.message);
  if (res && res.writeHead && !res.headersSent) {
    res.writeHead(502, { "Content-Type": "text/plain" });
    res.end("Bad gateway");
  }
});

const server = http.createServer((req, res) => {
  proxy.web(req, res, { target: HTTP_TARGET });
});

// A DIDComm WebSocket connection starts as a normal HTTP request with an
// "Upgrade: websocket" header — this is the only signal available to tell
// it apart from a plain HTTP DIDComm message on the same public port.
server.on("upgrade", (req, socket, head) => {
  proxy.ws(req, socket, head, { target: WS_TARGET });
});

server.listen(PORT, () => {
  console.log(`Transport proxy listening on :${PORT}`);
  console.log(`  HTTP -> ${HTTP_TARGET}`);
  console.log(`  WS   -> ${WS_TARGET}`);
});
