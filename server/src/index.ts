import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { VillageRoom, liveRoster } from "./VillageRoom";

const PORT = Number(process.env.PORT ?? 2567);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WALLETS_FILE = path.resolve(ROOT, ".testwallets.json");

const LOCAL_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

const httpServer = http.createServer((req, res) => {
  const cors = { "Access-Control-Allow-Origin": "*" };

  // dev-only: serve throwaway test wallet keys to local clients (dual test page)
  if (req.url?.startsWith("/dev/wallets")) {
    if (!LOCAL_ADDRESSES.has(req.socket.remoteAddress ?? "")) {
      res.writeHead(403, cors);
      res.end("local only");
      return;
    }
    if (!fs.existsSync(WALLETS_FILE)) {
      res.writeHead(404, { "Content-Type": "application/json", ...cors });
      res.end(JSON.stringify({ error: "no wallets — run: node scripts/gen-wallets.mjs" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json", ...cors });
    res.end(fs.readFileSync(WALLETS_FILE, "utf8"));
    return;
  }

  if (req.url?.startsWith("/dev/status")) {
    res.writeHead(200, { "Content-Type": "application/json", ...cors });
    res.end(
      JSON.stringify({
        online: liveRoster.size,
        players: [...liveRoster.entries()].map(([id, p]) => ({ id, ...p })),
      }),
    );
    return;
  }

  res.writeHead(200, { "Content-Type": "application/json", ...cors });
  res.end(JSON.stringify({ ok: true, service: "giwa-village-server" }));
});

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define("village", VillageRoom);

httpServer.listen(PORT, () => {
  console.log(`[giwa-village] listening on ws://localhost:${PORT}`);
});
