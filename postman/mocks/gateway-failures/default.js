const http = require("http");

// Deliberate dependency failures, based on the gateway's error/header contract.
// This is a local diagnostic mock owned by this repository, not provider data.
http
  .createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/health/ready") {
      setTimeout(() => res.end(JSON.stringify({ status: "ready" })), 2000);
      return;
    }
    if (
      req.method === "DELETE" &&
      /^\/rag\/documents\/[a-f\d-]{36}\/index$/.test(req.url)
    ) {
      res.setHeader("Retry-After", "23");
      res.writeHead(
        req.url.includes("00000000-0000-4000-8000-000000000001") ? 429 : 503,
      );
      res.end(JSON.stringify({ error: "Simulated vector cleanup failure" }));
      return;
    }
    if (req.method === "GET" && req.url === "/v1/documents?pageSize=100") {
      res.setHeader("Retry-After", "17"); res.writeHead(429); res.end(JSON.stringify({ error: "Too many requests" })); return;
    }
    if (req.method === "POST" && req.url === "/developer/authorize") {
      let data = ""; req.on("data", chunk => data += chunk); req.on("end", () => {
        const { createHash } = require("crypto");
        const digest = value => createHash("sha256").update(`hrt_live_${value.repeat(43)}`).digest("hex");
        const hash = JSON.parse(data).hash;
        if (hash === digest("B")) { res.setHeader("Content-Type", "text/html"); res.writeHead(503); res.end("<html>private proxy diagnostic</html>"); return; }
        if (hash === digest("C") || hash === digest("D")) { res.end(JSON.stringify({ id: "00000000-0000-4000-8000-000000000001", organizationId: "00000000-0000-4000-8000-000000000002", ownerId: "00000000-0000-4000-8000-000000000003", scopes: hash === digest("D") ? ["chat:write"] : ["documents:read"], token: "diagnostic-delegation" })); return; }
        res.setHeader("Retry-After", "19"); res.writeHead(503); res.end(JSON.stringify({ error: "Authorization temporarily unavailable" }));
      }); return;
    }
    if (req.method === "GET" && req.url.startsWith("/documents?")) { res.setHeader("Retry-After", "23"); res.writeHead(503); res.end(JSON.stringify({ error: "Documents temporarily unavailable" })); return; }
    if (req.method === "POST" && req.url === "/login") {
      res.setHeader("Retry-After", "17");
      res.setHeader("RateLimit-Limit", "5");
      res.setHeader("RateLimit-Remaining", "0");
      res.writeHead(429);
      res.end(JSON.stringify({ error: "Too many requests" }));
      return;
    }
    if (req.method === "POST" && req.url === "/register") {
      res.setHeader("Content-Type", "text/html");
      res.writeHead(503);
      res.end(
        "<html>Internal proxy diagnostic - never show this to a customer</html>",
      );
      return;
    }
    if (req.method === "GET" && req.url === "/me") {
      res.writeHead(401);
      res.end(JSON.stringify({ error: "Account is unavailable" }));
      return;
    }
    if (req.method === "GET" && req.url === "/organizations") {
      res.setHeader("Retry-After", "1");
      res.writeHead(503);
      res.end(JSON.stringify({ error: "Service temporarily unavailable" }));
      return;
    }
    res.writeHead(501);
    res.end(JSON.stringify({ error: "Endpoint not modeled" }));
  })
  .listen(process.env.PORT);
