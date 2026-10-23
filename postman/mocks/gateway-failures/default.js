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
