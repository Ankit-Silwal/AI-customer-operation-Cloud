const http = require("http");

http
  .createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.method !== "POST" || req.url !== "/v1/chat/completions") {
      res.writeHead(501);
      res.end(JSON.stringify({ error: { message: "Endpoint not modeled" } }));
      return;
    }
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        const input = req.body || JSON.parse(body);
        if (
          input.model !== "gemini-3.1-flash-lite" ||
          input.messages?.[0]?.role !== "system" ||
          input.messages?.at(-1)?.role !== "user" ||
          !input.messages.at(-1).content.includes("Source excerpts:")
        ) {
          res.writeHead(400);
          res.end(
            JSON.stringify({
              error: { message: "Invalid completion request" },
            }),
          );
          return;
        }
        const latest = input.messages.at(-1).content;
        const middle = input.messages.slice(1, -1);
        if (
          middle.length % 2 ||
          middle.some(
            (message, i) => message.role !== (i % 2 ? "assistant" : "user"),
          )
        ) {
          res.writeHead(400);
          res.end(
            JSON.stringify({
              error: { message: "Invalid conversation history" },
            }),
          );
          return;
        }
        // These diagnostic follow-ups must actually carry earlier turns.
        if (
          (latest.includes("What is that deadline again?") &&
            middle.length !== 2) ||
          (latest.includes("Please confirm it once more.") &&
            middle.length !== 4)
        ) {
          res.writeHead(400);
          res.end(
            JSON.stringify({
              error: { message: "Follow-up lost its history" },
            }),
          );
          return;
        }
        const excerpt = latest
          .split("Source excerpts:\n")[1]
          .split("\n\nQuestion:")[0]
          .split("\n")
          .slice(1)
          .join("\n")
          .split("\n\n[2]")[0];
        const answer = excerpt.trim() + " [1]";
        res.end(
          JSON.stringify({
            id: "chatcmpl-local-contract",
            object: "chat.completion",
            created: 1,
            model: input.model,
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: answer },
                finish_reason: "stop",
              },
            ],
            usage: {
              prompt_tokens: 40,
              completion_tokens: 12,
              total_tokens: 52,
            },
          }),
        );
      } catch {
        res.writeHead(400);
        res.end(JSON.stringify({ error: { message: "Invalid JSON" } }));
      }
    });
  })
  .listen(process.env.PORT);
