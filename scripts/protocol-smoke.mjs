// PROTOCOL.md가 정말 충분한가 — 문서만 보고 만든 클라이언트로 마을에 들어가 본다.
//
// Usage: npm run smoke:protocol      (서버를 직접 띄웠다 내린다)
//        npm run smoke:protocol -- --port 2567 --attach   (이미 뜬 서버에 붙는다)
//
// 여기서는 colyseus.js를 **일부러 쓰지 않는다.** 남이 다른 언어로 만들 때 가진
// 것은 문서뿐이므로, 이 파일도 문서에 적힌 것만으로 짠다 — WebSocket · HTTP ·
// msgpack(+ identify 서명만 viem). 그래서 이 스모크가 통과하면 "읽어야 알 수 있는 것"이 없다는 뜻이고,
// 실패하면 문서의 버그다.
//
// 검사하는 문서의 주장:
//   · 3.1 매치메이킹 응답에 roomId·processId·sessionId가 온다
//   · 3.2 소켓 주소는 /<processId>/<roomId>?sessionId=
//   · 3.3 opcode 10이 오고 직렬화기가 "none"이다 (= 스키마 프레임이 없다)
//   · 3.3 opcode 13 뒤에는 msgpack 값 둘이 연달아 온다
//   · 3.7 village_live — ready 에 snapshot·challenge, identify 서명, move(zone), emote, 15Hz, 나가면 빠진다

import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

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
  // 포트가 이미 잡혀 있으면 우리 서버는 조용히 못 뜨고, 스모크는 **낡은 서버**를
  // 검사하게 된다 — 통과해도 아무 의미가 없다. 그래서 먼저 멈춘다.
  try {
    await fetch(`http://${HOST}/`, { signal: AbortSignal.timeout(800) });
    console.error(
      `${HOST} 를 이미 누가 쓰고 있습니다.\n` +
        `  · 직접 띄운 서버라면: npm run smoke:protocol -- --port <그 포트> --attach\n` +
        `  · 지난 실행의 유령이라면 그 프로세스를 내리고 다시 실행하세요`,
    );
    process.exit(1);
  } catch {}

  // 인자를 배열로 나누지 않는다 — 윈도우에서 npm은 .cmd라 shell이 필요하고,
  // shell과 인자 배열을 같이 쓰면 노드가 경고를 뱉는다(DEP0190).
  child = spawn("npm run start -w server", {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: "ignore",
    shell: true,
    // 프로세스 그룹을 따로 만든다 — 아래 killTree가 손자까지 데려가려면 필요하다
    detached: process.platform !== "win32",
  });
}

/**
 * npm → sh → node 로 이어지는 사슬을 통째로 끝낸다.
 *
 * child.kill()은 맨 위(npm이 띄운 셸)만 죽이고 실제 서버 프로세스는 살아남는다.
 * CI에서는 그 유령이 다음 단계(브라우저 스모크)와 CPU를 나눠 쓰게 되고, 그러면
 * 타이머가 늘어져 "주민이 안 걷는다" 같은 엉뚱한 실패로 나타난다 — 실제로 겪었다.
 */
function killTree() {
  if (!child?.pid) return;
  try {
    if (process.platform === "win32") {
      // 동기로 부른다 — 비동기로 두면 이 스크립트가 먼저 끝나 버려 아무도 안 죽는다
      spawnSync(`taskkill /pid ${child.pid} /T /F`, { shell: true, stdio: "ignore" });
    } else {
      process.kill(-child.pid, "SIGTERM"); // 음수 = 프로세스 그룹 전체
    }
  } catch {}
  child = null;
}
process.on("exit", killTree);

console.log(`\n문서만 보고 만든 클라이언트로 ws://${HOST} 에 들어가 본다\n`);
if (!(await waitForServer())) {
  console.error(`서버가 안 뜹니다 (http://${HOST}) — npm run dev:server 로 확인하세요`);
  process.exit(1);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** 3.1 자리 얻기 → 3.2 소켓 → 3.3 입장 확인. 받은 메시지는 이름별 마지막 페이로드로 모은다 */
async function enter(identity) {
  const seat = await (
    await fetch(`http://${HOST}/matchmake/joinOrCreate/village_live`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(identity),
    })
  ).json();
  const url = `ws://${HOST}/${seat.room.processId}/${seat.room.roomId}?sessionId=${seat.sessionId}`;
  const ws = new WebSocket(url);
  ws.binaryType = "arraybuffer";
  const c = { seat, ws, seen: new Map(), stamps: [], opcodes: new Set(), joined: null, emotes: [] };
  ws.onmessage = (ev) => {
    const buf = Buffer.from(ev.data);
    c.opcodes.add(buf[0]);
    if (buf[0] === JOIN_ROOM) {
      // [10][길이][재접속토큰][길이][직렬화기]
      let o = 1;
      const tLen = buf[o++];
      o += tLen;
      const sLen = buf[o++];
      c.joined = buf.toString("utf8", o, o + sLen);
      ws.send(Buffer.from([JOIN_ROOM])); // 문서 3.3: 이 한 바이트를 돌려보내기 전까지 서버는 아무것도 보내지 않는다
      return;
    }
    if (buf[0] !== ROOM_DATA) return;
    const it = { o: 1 };
    const type = decode(buf, it);
    const payload = it.o < buf.length ? decode(buf, it) : undefined;
    c.seen.set(type, payload);
    if (type === "snapshot") c.stamps.push(Date.now());
    if (type === "emote") c.emotes.push(payload);
  };
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = () => rej(new Error(`소켓 열기 실패: ${url}`));
    setTimeout(() => rej(new Error("소켓 열기 시간 초과")), 10000);
  });
  return c;
}

const IDENTITY = { name: "낯선손님", color: 0xff8800 };
const me = await enter(IDENTITY);
const other = await enter({ name: "구경꾼", color: 0x3366ff });

console.log("3.1 자리 얻기 (HTTP)");
ok(!!me.seat?.room?.roomId, "응답에 room.roomId 가 있다");
ok(!!me.seat?.room?.processId, "응답에 room.processId 가 있다");
ok(typeof me.seat?.sessionId === "string", "응답에 sessionId 가 있다");

await wait(300);
console.log("\n3.2~3.3 소켓과 프레임");
ok(me.joined === "none", `JOIN_ROOM(10)의 직렬화기가 "none" 이다 (받은 값: ${me.joined})`);
ok(!me.opcodes.has(14) && !me.opcodes.has(15), "스키마 상태 프레임(14·15)이 오지 않는다");

console.log("\n3.7 village_live");
for (const c of [me, other]) c.ws.send(frame("ready")); // 페이로드 없는 메시지
await wait(400);
const challenge = me.seen.get("challenge");
ok(me.seen.has("snapshot"), "ready 를 보내면 snapshot 이 온다");
ok(typeof challenge === "string" && challenge.startsWith(`GIWA Village session\n${me.seat.room.roomId}/${me.seat.sessionId}\n`), "ready 의 답으로 이 세션의 challenge 글이 온다");

const account = privateKeyToAccount(generatePrivateKey());
me.ws.send(frame("identify", { address: account.address, signature: await account.signMessage({ message: challenge }) }));
const MOVE = { x: -12.5, z: 7.25, rot: 1.5, zone: "field" };
me.ws.send(frame("move", MOVE));
me.ws.send(frame("emote", "👋"));
me.ws.send(frame("emote", "👋")); // 1초 안의 두 번째는 버려진다
await wait(700);

const seenByOther = (other.seen.get("snapshot") ?? []).find((p) => p.id === me.seat.sessionId);
ok(!!seenByOther, "남의 스냅샷에 내가 들어 있다");
ok(seenByOther?.name === IDENTITY.name, `이름이 그대로다 (${seenByOther?.name})`);
ok(seenByOther?.address === account.address.toLowerCase(), "identify 서명 뒤 내 주소가 실린다");
ok(
  seenByOther && Math.abs(seenByOther.x - MOVE.x) < 1e-6 && Math.abs(seenByOther.z - MOVE.z) < 1e-6 && seenByOther.zone === MOVE.zone,
  `보낸 좌표·구역이 그대로 온다 (${seenByOther?.x}, ${seenByOther?.z}, ${seenByOther?.zone})`,
);
const waves = other.emotes.filter((e) => e?.id === me.seat.sessionId);
ok(waves.length === 1 && waves[0].icon === "👋", `이모트가 {id, icon} 으로 한 번만 온다 (${waves.length}번)`);

const span = (other.stamps.at(-1) - other.stamps[0]) / 1000;
const hz = span > 0 ? (other.stamps.length - 1) / span : 0;
ok(hz > 11 && hz < 19, `스냅샷이 15Hz 근처로 온다 (실측 ${hz.toFixed(1)}Hz)`);

me.ws.send(frame("move", { x: 9999, z: -9999, rot: 0, zone: "village" }));
await wait(300);
const clamped = (other.seen.get("snapshot") ?? []).find((p) => p.id === me.seat.sessionId);
ok(clamped?.x === 55 && clamped?.z === -55, `좌표가 ±55로 잘린다 (${clamped?.x}, ${clamped?.z})`);

// ── 나가기 ────────────────────────────────────────────────────────────────

me.ws.send(Buffer.from([LEAVE_ROOM]));
await wait(400);
me.ws.close();
ok(
  !(other.seen.get("snapshot") ?? []).some((p) => p.id === me.seat.sessionId),
  "LEAVE_ROOM(12)을 보내면 남의 스냅샷에서 빠진다",
);
other.ws.close();

// 서버를 완전히 내리고, 정말 내려갔는지(포트가 비었는지) 확인한다
killTree();
await wait(700);
if (!ATTACH) {
  let alive = true;
  try {
    await fetch(`http://${HOST}/`, { signal: AbortSignal.timeout(1000) });
  } catch {
    alive = false;
  }
  ok(!alive, "끝나면 서버 프로세스가 남지 않는다 (다음 스모크와 CPU를 다투지 않게)");
}

console.log(`\n${"─".repeat(50)}`);
if (fails.length) {
  console.log(`실패 ${fails.length}건 / 통과 ${pass}건 — PROTOCOL.md와 서버가 어긋났습니다`);
  for (const f of fails) console.log(`  · ${f}`);
} else {
  console.log(`전부 통과 (${pass}건) — 문서만으로 마을에 들어갈 수 있다 · 가스 0`);
}
process.exit(fails.length ? 1 : 0);
