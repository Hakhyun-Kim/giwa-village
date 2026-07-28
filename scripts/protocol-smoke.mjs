// PROTOCOL.md가 정말 충분한가 — 문서만 보고 만든 클라이언트로 마을에 들어가 본다.
//
// Usage: npm run smoke:protocol      (서버를 직접 띄웠다 내린다)
//        npm run smoke:protocol -- --port 2567 --attach   (이미 뜬 서버에 붙는다)
//
// 여기서는 colyseus.js를 **일부러 쓰지 않는다.** 남이 다른 언어로 만들 때 가진
// 것은 문서뿐이므로, 이 파일도 문서에 적힌 것만으로 짠다 — WebSocket · HTTP ·
// msgpack. 그래서 이 스모크가 통과하면 "읽어야 알 수 있는 것"이 없다는 뜻이고,
// 실패하면 문서의 버그다.
//
// 검사하는 문서의 주장:
//   · 3.1 매치메이킹 응답에 roomId·processId·sessionId가 온다
//   · 3.2 소켓 주소는 /<processId>/<roomId>?sessionId=
//   · 3.3 opcode 10이 오고 직렬화기가 "none"이다 (= 스키마 프레임이 없다)
//   · 3.3 opcode 13 뒤에는 msgpack 값 둘이 연달아 온다
//   · 3.4/3.5 보낸 대로 움직이고, 목록이 오고, 15Hz로 스냅샷이 온다

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const PORT = Number(argv[argv.indexOf("--port") + 1]) || 2568;
const ATTACH = argv.includes("--attach");
const HOST = `localhost:${PORT}`;

let pass = 0;
const fails = [];
function ok(cond, what) {
  if (cond) {
    pass++;
    console.log(`  ✅ ${what}`);
  } else {
    fails.push(what);
    console.log(`  ❌ ${what}`);
  }
}

// ── msgpack — 이 마을에 필요한 만큼만 (문서 3.3) ──────────────────────────

function decode(buf, it) {
  const b = buf[it.o++];
  if (b < 0x80) return b; // positive fixint
  if (b >= 0xe0) return b - 256; // negative fixint
  if (b >= 0xa0 && b <= 0xbf) return str(buf, it, b - 0xa0);
  if (b >= 0x80 && b <= 0x8f) return map(buf, it, b - 0x80);
  if (b >= 0x90 && b <= 0x9f) return arr(buf, it, b - 0x90);
  switch (b) {
    case 0xc0: return null;
    case 0xc2: return false;
    case 0xc3: return true;
    case 0xca: { const v = buf.readFloatBE(it.o); it.o += 4; return v; }
    case 0xcb: { const v = buf.readDoubleBE(it.o); it.o += 8; return v; }
    case 0xcc: return buf[it.o++];
    case 0xcd: { const v = buf.readUInt16BE(it.o); it.o += 2; return v; }
    case 0xce: { const v = buf.readUInt32BE(it.o); it.o += 4; return v; }
    case 0xcf: { const v = Number(buf.readBigUInt64BE(it.o)); it.o += 8; return v; }
    case 0xd0: { const v = buf.readInt8(it.o); it.o += 1; return v; }
    case 0xd1: { const v = buf.readInt16BE(it.o); it.o += 2; return v; }
    case 0xd2: { const v = buf.readInt32BE(it.o); it.o += 4; return v; }
    case 0xd3: { const v = Number(buf.readBigInt64BE(it.o)); it.o += 8; return v; }
    case 0xd9: return str(buf, it, buf[it.o++]);
    case 0xda: { const n = buf.readUInt16BE(it.o); it.o += 2; return str(buf, it, n); }
    case 0xdb: { const n = buf.readUInt32BE(it.o); it.o += 4; return str(buf, it, n); }
    case 0xdc: { const n = buf.readUInt16BE(it.o); it.o += 2; return arr(buf, it, n); }
    case 0xdd: { const n = buf.readUInt32BE(it.o); it.o += 4; return arr(buf, it, n); }
    case 0xde: { const n = buf.readUInt16BE(it.o); it.o += 2; return map(buf, it, n); }
    case 0xdf: { const n = buf.readUInt32BE(it.o); it.o += 4; return map(buf, it, n); }
    default: throw new Error(`모르는 msgpack 태그 0x${b.toString(16)}`);
  }
}
function str(buf, it, n) {
  const s = buf.toString("utf8", it.o, it.o + n);
  it.o += n;
  return s;
}
function arr(buf, it, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(decode(buf, it));
  return out;
}
function map(buf, it, n) {
  const out = {};
  for (let i = 0; i < n; i++) out[decode(buf, it)] = decode(buf, it);
  return out;
}

function encode(v) {
  if (v === null || v === undefined) return Buffer.from([0xc0]);
  if (typeof v === "boolean") return Buffer.from([v ? 0xc3 : 0xc2]);
  if (typeof v === "number") {
    if (Number.isInteger(v) && v >= 0 && v < 128) return Buffer.from([v]);
    const b = Buffer.alloc(9);
    b[0] = 0xcb;
    b.writeDoubleBE(v, 1);
    return b;
  }
  if (typeof v === "string") {
    const s = Buffer.from(v, "utf8");
    if (s.length < 32) return Buffer.concat([Buffer.from([0xa0 | s.length]), s]);
    return Buffer.concat([Buffer.from([0xd9, s.length]), s]);
  }
  if (Array.isArray(v)) {
    return Buffer.concat([Buffer.from([0x90 | v.length]), ...v.map(encode)]);
  }
  const keys = Object.keys(v);
  return Buffer.concat([
    Buffer.from([0x80 | keys.length]),
    ...keys.flatMap((k) => [encode(k), encode(v[k])]),
  ]);
}

// ── 문서 3.3의 프레임 ──────────────────────────────────────────────────────

const JOIN_ROOM = 10;
const LEAVE_ROOM = 12;
const ROOM_DATA = 13;

function frame(type, payload) {
  const head = Buffer.concat([Buffer.from([ROOM_DATA]), encode(type)]);
  return payload === undefined ? head : Buffer.concat([head, encode(payload)]);
}

// ── 서버 ──────────────────────────────────────────────────────────────────

async function waitForServer(ms = 20000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const r = await fetch(`http://${HOST}/`);
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

let child = null;
if (!ATTACH) {
  // 인자를 배열로 나누지 않는다 — 윈도우에서 npm은 .cmd라 shell이 필요하고,
  // shell과 인자 배열을 같이 쓰면 노드가 경고를 뱉는다(DEP0190).
  child = spawn("npm run start -w server", {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: "ignore",
    shell: true,
  });
}
console.log(`\n문서만 보고 만든 클라이언트로 ws://${HOST} 에 들어가 본다\n`);
if (!(await waitForServer())) {
  console.error(`서버가 안 뜹니다 (http://${HOST}) — npm run dev:server 로 확인하세요`);
  child?.kill();
  process.exit(1);
}

// ── 3.1 자리 얻기 ─────────────────────────────────────────────────────────

const IDENTITY = { name: "낯선손님", address: `0x${"a1".repeat(20)}`, color: 0xff8800 };
const seat = await (
  await fetch(`http://${HOST}/matchmake/joinOrCreate/village`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(IDENTITY),
  })
).json();

console.log("3.1 자리 얻기 (HTTP)");
ok(!!seat?.room?.roomId, "응답에 room.roomId 가 있다");
ok(!!seat?.room?.processId, "응답에 room.processId 가 있다");
ok(typeof seat?.sessionId === "string", "응답에 sessionId 가 있다");

// ── 3.2~3.3 소켓·프레임 ───────────────────────────────────────────────────

const url = `ws://${HOST}/${seat.room.processId}/${seat.room.roomId}?sessionId=${seat.sessionId}`;
const ws = new WebSocket(url);
ws.binaryType = "arraybuffer";

const seen = new Map(); // 메시지 이름 → 마지막 페이로드
const stamps = []; // snapshot 도착 시각 (15Hz 확인용)
let joined = null;
let opcodes = new Set();

ws.onmessage = (ev) => {
  const buf = Buffer.from(ev.data);
  opcodes.add(buf[0]);
  if (buf[0] === JOIN_ROOM) {
    // [10][길이][재접속토큰][길이][직렬화기]
    let o = 1;
    const tLen = buf[o++];
    o += tLen;
    const sLen = buf[o++];
    joined = buf.toString("utf8", o, o + sLen);
    // 문서 3.3: 이 한 바이트를 돌려보내기 전까지 서버는 아무것도 보내지 않는다
    ws.send(Buffer.from([JOIN_ROOM]));
    return;
  }
  if (buf[0] !== ROOM_DATA) return;
  const it = { o: 1 };
  const type = decode(buf, it);
  const payload = it.o < buf.length ? decode(buf, it) : undefined;
  seen.set(type, payload);
  if (type === "snapshot") stamps.push(Date.now());
};

await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = () => rej(new Error(`소켓 열기 실패: ${url}`));
  setTimeout(() => rej(new Error("소켓 열기 시간 초과")), 10000);
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(600);

console.log("\n3.2~3.3 소켓과 프레임");
ok(joined === "none", `JOIN_ROOM(10)의 직렬화기가 "none" 이다 (받은 값: ${joined})`);
ok(!opcodes.has(14) && !opcodes.has(15), "스키마 상태 프레임(14·15)이 오지 않는다");
ok(seen.has("snapshot"), "입장 확인 [10]을 돌려보내면 그때부터 메시지가 온다");

// ── 3.4~3.5 주고받기 ──────────────────────────────────────────────────────

ws.send(frame("ping")); // 페이로드 없는 메시지
ws.send(frame("stalls:get"));
ws.send(frame("guilds:get"));
const MOVE = { x: -12.5, z: 7.25, rot: 1.5 };
ws.send(frame("move", MOVE));
await wait(700);

console.log("\n3.4~3.5 주고받기");
const snap = seen.get("snapshot");
const me = Array.isArray(snap) ? snap.find((p) => p.id === seat.sessionId) : null;
ok(!!me, "스냅샷에 내가 들어 있다 (문서: 첫 스냅샷의 내 항목이 출발점)");
ok(me?.name === IDENTITY.name, `이름이 그대로다 (${me?.name})`);
ok(
  me && Math.abs(me.x - MOVE.x) < 1e-6 && Math.abs(me.z - MOVE.z) < 1e-6,
  `보낸 좌표가 그대로 온다 (${me?.x}, ${me?.z})`,
);
ok(Array.isArray(seen.get("stalls")) && seen.get("stalls").length > 0, "노점 목록이 온다");
ok(Array.isArray(seen.get("guilds")), "길드 목록이 온다");

const span = (stamps.at(-1) - stamps[0]) / 1000;
const hz = span > 0 ? (stamps.length - 1) / span : 0;
ok(hz > 11 && hz < 19, `스냅샷이 15Hz 근처로 온다 (실측 ${hz.toFixed(1)}Hz)`);

// ── 나가기 ────────────────────────────────────────────────────────────────

ws.send(Buffer.from([LEAVE_ROOM]));
await wait(200);
ws.close();
await wait(200);

const status = await (await fetch(`http://${HOST}/dev/status`)).json();
ok(
  !status.players.some((p) => p.id === seat.sessionId),
  "LEAVE_ROOM(12)을 보내면 자리에서 빠진다",
);

child?.kill();

console.log(`\n${"─".repeat(50)}`);
if (fails.length) {
  console.log(`실패 ${fails.length}건 / 통과 ${pass}건 — PROTOCOL.md와 서버가 어긋났습니다`);
  for (const f of fails) console.log(`  · ${f}`);
} else {
  console.log(`전부 통과 (${pass}건) — 문서만으로 마을에 들어갈 수 있다 · 가스 0`);
}
process.exit(fails.length ? 1 : 0);
