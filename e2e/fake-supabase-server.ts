/**
 * Runs the in-memory fake Supabase (seeded with Vietnam '26) as a local HTTP server,
 * so tools that drive their own browser (Lighthouse) can load real-looking screens.
 *   npx tsx e2e/fake-supabase-server.ts [port]
 * Realtime isn't served here; the app just keeps retrying the socket quietly.
 */
import { createServer } from "node:http";
import { createFakeSupabase } from "./fake-supabase";

const port = Number(process.argv[2] ?? 54321);
const fake = createFakeSupabase({ withSeed: true });

createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  if (req.method === "OPTIONS") return void res.writeHead(204).end();
  let raw = "";
  req.on("data", (c: Buffer) => (raw += c.toString()));
  req.on("end", () => {
    let body: unknown;
    try {
      body = raw ? JSON.parse(raw) : undefined;
    } catch {
      body = undefined;
    }
    const out = fake.respond({ method: req.method ?? "GET", url: `http://localhost:${port}${req.url}`, body });
    res.writeHead(out.status, { "Content-Type": "application/json" });
    res.end(out.body === undefined ? "" : JSON.stringify(out.body));
  });
}).listen(port, () => console.log(`fake supabase on http://localhost:${port}`));
