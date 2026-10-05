import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { LiveRoom } from "./LiveRoom";
import { ExpeditionRoom } from "./ExpeditionRoom";

const PORT = Number(process.env.PORT ?? 2567);
// 개발 모드 — /dev/wallets(이 기기의 테스트 지갑 · 루프백 · localhost 페이지 전용)를 연다.
// 컨테이너(Dockerfile)는 NODE_ENV=production 이라 닫힌다.
const DEV = process.env.NODE_ENV !== "production";
// 로컬은 루프백만, 컨테이너는 모든 인터페이스(호스팅 프록시가 들어온다) — HOST 로 덮어쓴다
const HOST = process.env.HOST ?? (DEV ? "127.0.0.1" : "0.0.0.0");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WALLETS_FILE = path.resolve(ROOT, ".testwallets.json");

const LOCAL_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
// 터널 · 리버스 프록시(cloudflared 등)는 루프백으로 들어온다 — 전달 헤더가 하나라도 붙었으면 이 기기의 요청이 아니다
const FORWARDED = ["x-forwarded-for", "x-forwarded-host", "cf-connecting-ip", "true-client-ip", "forwarded", "x-real-ip", "via"];
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const hostOf = (value: string) => { try { return new URL(value).hostname; } catch { return ""; } };
/** 이 기기의 페이지가 이 기기의 서버 이름으로 물었는가 — 아무 웹페이지(Origin)도, DNS 리바인딩(Host)도 지갑 키를 읽지 못하게 */
function fromThisDevice(req: http.IncomingMessage): boolean {
  if (!LOCAL_ADDRESSES.has(req.socket.remoteAddress ?? "") || FORWARDED.some((h) => h in req.headers)) return false;
  if (!LOCAL_HOSTS.has(hostOf(`http://${req.headers.host ?? ""}`))) return false;
  const origin = req.headers.origin;
  return origin === undefined || LOCAL_HOSTS.has(hostOf(origin));
}

const httpServer = http.createServer((req, res) => {
  const cors = { "Access-Control-Allow-Origin": "*" };

  // dev-only: serve throwaway test wallet keys to local clients (dual test page)
  if (!DEV && req.url?.startsWith("/dev/")) {
    res.writeHead(404, cors);
    res.end("not found");
    return;
  }

  if (req.url?.startsWith("/dev/wallets")) {
    // 와일드카드 CORS 를 주지 않는다 — 이 기기의 페이지(localhost 의 어느 포트든)에만 그 Origin 을 돌려준다
    const mine = req.headers.origin ? { "Access-Control-Allow-Origin": req.headers.origin, Vary: "Origin" } : {};
    if (!fromThisDevice(req)) {
      res.writeHead(403);
      res.end("local only");
      return;
    }
    if (!fs.existsSync(WALLETS_FILE)) {
      res.writeHead(404, { "Content-Type": "application/json", ...mine });
      res.end(JSON.stringify({ error: "no wallets — run: node scripts/gen-wallets.mjs" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json", ...mine });
    res.end(fs.readFileSync(WALLETS_FILE, "utf8"));
    return;
  }

  res.writeHead(200, { "Content-Type": "application/json", ...cors });
  res.end(JSON.stringify({ ok: true, service: "giwa-village-server" }));
});

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define("village_live", LiveRoom);
gameServer.define("expedition", ExpeditionRoom);

httpServer.listen(PORT, HOST, () => {
  console.log(`[giwa-village] listening on ws://${HOST}:${PORT}${DEV ? " (dev: /dev/wallets)" : ""}`);
});
