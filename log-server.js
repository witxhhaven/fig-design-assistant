const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 3001;
const LOGS_DIR = path.join(__dirname, "logs");
const ERRORS_FILE = path.join(LOGS_DIR, "_errors.json");

if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR);
}

// Load existing errors
let errors = [];
if (fs.existsSync(ERRORS_FILE)) {
  try {
    errors = JSON.parse(fs.readFileSync(ERRORS_FILE, "utf8"));
  } catch (_e) {
    errors = [];
  }
}

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/log") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        const sessionId = data.sessionId || "unknown";
        const filePath = path.join(LOGS_DIR, sessionId + ".json");
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        console.log("Saved:", path.basename(filePath));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        console.error("Log error:", e.message);
        res.writeHead(400);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/error") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        errors.push(data);
        fs.writeFileSync(ERRORS_FILE, JSON.stringify(errors, null, 2));
        const label = data.errorType || "error";
        console.log("\x1b[31m[ERROR]\x1b[0m", label + ":", data.error || "unknown");
        if (data.userRequest) {
          console.log("  Request:", data.userRequest);
        }
        if (data.code) {
          const preview = data.code.length > 80 ? data.code.slice(0, 80) + "..." : data.code;
          console.log("  Code:", preview);
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        console.error("Error log error:", e.message);
        res.writeHead(400);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log("Log server running at http://localhost:" + PORT);
  console.log("Session logs:", LOGS_DIR);
  console.log("Error log:", ERRORS_FILE);
});
