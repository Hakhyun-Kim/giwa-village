// 무가스 로직 테스트 — 체인도, 지갑도, 네트워크도 쓰지 않는다.
// 가스가 드는 테스트는 아껴야 하므로, 규칙으로 검증할 수 있는 것은 전부 여기서
// 검증한다. 밀리초 단위라 저장할 때마다 돌려도 부담이 없다.
//
// Usage: npm test
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { concat, hexToBytes, keccak256, numberToBytes, parseEther, stringToBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { BAND, classify, decideDeterministic, enforce, floorOf } from "./lib/haggle.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let pass = 0;
let fail = 0;
let group = "";

function describe(name) {
  group = name;
  console.log(`\n${name}`);
}
function it(name, fn) {
  try {
    fn();
    pass++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    fail++;
    console.log(`  ❌ ${name}\n     ${err.message}`);
  }
}
function eq(actual, expected, what = "") {
  if (actual !== expected) {
    throw new Error(`${what}기대 ${expected}, 실제 ${actual}`);
  }
}
function ok(cond, msg) {
  if (!cond) throw new Error(msg ?? "참이어야 합니다");
}

// ── 흥정 밴드: 이 봇의 안전 불변식 ────────────────────────────────────────

describe("흥정 밴드 — 값은 모델이 제안하고 하한선은 코드가 강제한다");

const LIST = parseEther("0.001");
const RATIO = 0.7; // 하한 70%

it("정가 이상이면 모델을 부르지 않고 수락 구간", () => {
  eq(classify(LIST, LIST, RATIO).band, BAND.ABOVE_LIST);
  eq(classify(LIST * 2n, LIST, RATIO).band, BAND.ABOVE_LIST);
});

it("하한선 미만이면 모델을 부르지 않고 거절 구간", () => {
  eq(classify(parseEther("0.0006"), LIST, RATIO).band, BAND.BELOW_FLOOR);
  eq(classify(0n, LIST, RATIO).band, BAND.BELOW_FLOOR);
});

it("하한선 정확히 위는 흥정 구간 (경계 포함)", () => {
  const floor = floorOf(LIST, RATIO);
  eq(classify(floor, LIST, RATIO).band, BAND.NEGOTIABLE, "하한선 자체는 흥정 가능: ");
  eq(classify(floor - 1n, LIST, RATIO).band, BAND.BELOW_FLOOR, "1 wei 아래는 거절: ");
});

it("정가 1 wei 아래는 흥정 구간 (경계)", () => {
  eq(classify(LIST - 1n, LIST, RATIO).band, BAND.NEGOTIABLE);
});

it("하한선 계산이 bigint로 유지된다 (부동소수 누수 없음)", () => {
  // 0.7 * 1e15 를 부동소수로 하면 오차가 생기는 값
  const odd = 999999999999999n;
  const floor = floorOf(odd, 0.7);
  ok(typeof floor === "bigint", "bigint여야 합니다");
  ok(floor <= odd, "하한선이 정가를 넘을 수 없습니다");
  ok(floor > 0n, "하한선이 0이 되면 안 됩니다");
});

describe("최종 관문 — 어떤 경로로 온 결정이든 하한선을 넘을 수 없다");

it("모델이 헐값 수락을 반환해도 차단된다", () => {
  const evil = { accept: true, line: "그냥 드릴게요" };
  const r = enforce(evil, parseEther("0.0001"), LIST, RATIO);
  eq(r.accept, false, "차단되어야 함: ");
  eq(r.blocked, true);
});

it("모델이 0원 수락을 반환해도 차단된다", () => {
  const r = enforce({ accept: true, line: "공짜!" }, 0n, LIST, RATIO);
  eq(r.accept, false);
  eq(r.blocked, true);
});

it("정당한 수락은 통과한다", () => {
  const r = enforce({ accept: true, line: "좋소" }, parseEther("0.0009"), LIST, RATIO);
  eq(r.accept, true);
  eq(r.blocked, false);
});

it("거절은 언제나 그대로 거절이다", () => {
  const r = enforce({ accept: false, line: "안 되오" }, LIST * 2n, LIST, RATIO);
  eq(r.accept, false);
  eq(r.blocked, false);
});

describe("결정론 판단 — 모델이 없을 때의 규칙");

it("하한선과 정가의 중간을 넘으면 수락", () => {
  eq(decideDeterministic(0.9, 0.7).accept, true);
  eq(decideDeterministic(0.85, 0.7).accept, true, "중간값 정확히: ");
});

it("중간 미만이면 거절", () => {
  eq(decideDeterministic(0.8, 0.7).accept, false);
  eq(decideDeterministic(0.71, 0.7).accept, false);
});

it("모든 상인의 하한선에서 결정론 판단이 하한선을 넘지 않는다", () => {
  const npcs = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "npcs.json"), "utf8")).npcs;
  for (const n of npcs.filter((x) => x.class === "merchant")) {
    // 하한선 바로 위 1%p 구간에서 결정론이 수락하면 안 된다 (중간값보다 낮으므로)
    const justAboveFloor = n.floorRatio + 0.01;
    const d = decideDeterministic(justAboveFloor, n.floorRatio);
    ok(!d.accept, `${n.name}: 하한선 바로 위(${justAboveFloor})에서 수락하면 안 됩니다`);
  }
});

describe("MCP 흥정 수락 — 모델이 쥔 판매자 지갑도 같은 하한선 · 같은 품목만");

const mcp = await import(pathToFileURL(path.join(ROOT, "mcp", "src", "village.mjs")).href);
const { stringToHex } = await import("viem");

it("내 노점에 바이트까지 같은 품목 · 하한 이상만 받는다", () => {
  const stall = { items: [{ name: "목도리", priceEth: "0.001" }] };
  const offer = (name, wei) => ({ itemName: typeof name === "string" ? stringToHex(name) : name, amount: wei });
  const P = parseEther("0.001");
  ok(mcp.offerRejection(offer("목도리", P), undefined, 0.5), "노점이 없으면 거절");
  ok(mcp.offerRejection(offer("교환권", P), stall, 0.5), "노점에 없는 품목은 거절");
  ok(mcp.offerRejection(offer(("0xefbbbf" + stringToHex("목도리").slice(2)), P), stall, 0.5), "BOM 을 붙인 이름은 다른 품목");
  ok(mcp.offerRejection(offer("목도리", 1n), stall, 0.5), "1 wei 는 거절");
  ok(mcp.offerRejection(offer("목도리", P / 2n - 1n), stall, 0.5), "하한 1 wei 아래는 거절");
  eq(mcp.offerRejection(offer("목도리", P / 2n), stall, 0.5), null, "하한 정확히는 받는다: ");
  eq(mcp.offerRejection(offer("목도리", P), stall, 0.5), null, "정가는 받는다: ");
  eq(mcp.offerRejection(offer("목도리", 1n), stall, 0), null, "비율 0 이면 하한이 꺼진다: ");
});

it("GIWA_FLOOR_RATIO 를 잘못 적으면 조용히 꺼지지 않고 멈춘다", () => {
  eq(mcp.floorRatioFrom(undefined), 0.5); eq(mcp.floorRatioFrom(""), 0.5); eq(mcp.floorRatioFrom(" 0.7 "), 0.7); eq(mcp.floorRatioFrom("0"), 0);
  for (const bad of ["0,5", "50%", "abc", "-1", "1.5", "0.0004"]) {
    let threw = false; try { mcp.floorRatioFrom(bad); } catch { threw = true; }
    ok(threw, `"${bad}" 에서 멈춰야 합니다`);
  }
});

// ── 주민 데이터 정합성 ────────────────────────────────────────────────────

describe("주민 데이터 — data/npcs.json");

const npcsRaw = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "npcs.json"), "utf8"));

it("모든 주민에 필수 필드가 있다", () => {
  for (const n of npcsRaw.npcs) {
    ok(n.id && n.name && n.class, `${n.id ?? "?"}: id/name/class 필요`);
    ok(Array.isArray(n.home) && n.home.length === 2, `${n.id}: home은 [x,z]`);
    ok(Array.isArray(n.lines) && n.lines.length > 0, `${n.id}: 대사가 하나는 있어야 함`);
    ok(npcsRaw.templates[n.class], `${n.id}: '${n.class}' 템플릿이 없습니다`);
  }
});

it("id가 중복되지 않는다", () => {
  const ids = npcsRaw.npcs.map((n) => n.id);
  eq(new Set(ids).size, ids.length);
});

it("주소가 유효한 형식이고 중복되지 않는다", () => {
  const addrs = npcsRaw.npcs.map((n) => n.address.toLowerCase());
  for (const a of addrs) ok(/^0x[0-9a-f]{40}$/.test(a), `주소 형식 오류: ${a}`);
  eq(new Set(addrs).size, addrs.length, "주소 중복: ");
});

it("상인은 floorRatio와 stall을 가진다", () => {
  for (const n of npcsRaw.npcs.filter((x) => x.class === "merchant")) {
    ok(typeof n.floorRatio === "number", `${n.id}: floorRatio 필요`);
    ok(n.floorRatio > 0 && n.floorRatio < 1, `${n.id}: floorRatio는 0~1 사이여야 함`);
    ok(n.stall, `${n.id}: stall 간판 필요`);
  }
});

it("주민이 마을 반경(55) 안에 산다", () => {
  for (const n of npcsRaw.npcs) {
    const d = Math.hypot(n.home[0], n.home[1]);
    ok(d <= 55, `${n.name}: 마을 밖(${d.toFixed(1)})에 있습니다`);
  }
});

it("walletIndex가 .botwallets.json 주소와 일치한다 (있을 때만)", () => {
  const f = path.join(ROOT, ".botwallets.json");
  if (!fs.existsSync(f)) {
    console.log("     (.botwallets.json 없음 — 건너뜀)");
    return;
  }
  const bots = JSON.parse(fs.readFileSync(f, "utf8"));
  for (const n of npcsRaw.npcs) {
    const w = bots[n.walletIndex];
    if (!w) continue;
    eq(
      w.address.toLowerCase(),
      n.address.toLowerCase(),
      `${n.name}(walletIndex ${n.walletIndex}) 주소 불일치: `,
    );
    // 개인키가 실제로 그 주소를 만드는지까지 확인 (지갑 파일 손상 감지)
    eq(privateKeyToAccount(w.privateKey).address.toLowerCase(), w.address.toLowerCase());
  }
});

// ── 주야 사이클 ───────────────────────────────────────────────────────────
// daylight.ts는 TS라 여기서 직접 import할 수 없으므로, 키프레임 표의 불변식을
// 소스에서 직접 파싱해 검증한다. "밤이 너무 어두워지지 않는다"가 핵심이다.

describe("주야 사이클 — 밤에도 읽을 수 있어야 한다");

const daylightSrc = fs.readFileSync(
  path.join(ROOT, "client", "src", "game", "daylight.ts"),
  "utf8",
);
const keyRows = [...daylightSrc.matchAll(
  /\{\s*h:\s*(\d+),[^}]*ambient:\s*([\d.]+),\s*sunIntensity:\s*([\d.]+)[^}]*lantern:\s*([\d.]+)/g,
)].map((m) => ({
  h: Number(m[1]),
  ambient: Number(m[2]),
  sun: Number(m[3]),
  lantern: Number(m[4]),
}));

it("키프레임을 읽어냈다", () => {
  ok(keyRows.length >= 6, `키프레임 ${keyRows.length}개 — 파싱 실패 의심`);
});

it("주변광이 어느 시각에도 0.3 아래로 내려가지 않는다", () => {
  for (const k of keyRows) {
    ok(k.ambient >= 0.3, `${k.h}시 주변광 ${k.ambient} — 너무 어둡습니다`);
  }
});

it("햇빛(달빛)이 어느 시각에도 0.3 아래로 내려가지 않는다", () => {
  for (const k of keyRows) {
    ok(k.sun >= 0.3, `${k.h}시 광원 ${k.sun} — 너무 어둡습니다`);
  }
});

it("한낮이 한밤보다 확실히 밝다", () => {
  const noon = keyRows.find((k) => k.h === 10 || k.h === 12);
  const midnight = keyRows.find((k) => k.h === 0);
  ok(noon && midnight, "한낮/한밤 키프레임을 찾지 못했습니다");
  ok(noon.ambient > midnight.ambient, "낮이 밤보다 밝아야 합니다");
  ok(noon.sun > midnight.sun);
});

it("한밤에 등불이 켜지고 한낮에 꺼진다", () => {
  // 키프레임에 12시가 없을 수 있으므로 낮 구간(9~16시) 중 아무거나 잡는다
  const noon = keyRows.find((k) => k.h >= 9 && k.h <= 16);
  const midnight = keyRows.find((k) => k.h === 0);
  ok(noon, "낮 키프레임(9~16시)을 찾지 못했습니다");
  ok(midnight, "0시 키프레임을 찾지 못했습니다");
  eq(midnight.lantern, 1, "한밤 등불: ");
  eq(noon.lantern, 0, "한낮 등불: ");
});

it("쇼케이스는 한낮으로 고정된다 (데모 영상 보호)", () => {
  ok(
    /showcase[^\n]*===\s*"1"[\s\S]{0,80}return 12/.test(daylightSrc),
    "?showcase=1 이 12시를 반환하는 분기를 찾지 못했습니다",
  );
});

// ── 던전 문 확률 ──────────────────────────────────────────────────────────
// 같은 밸런스 수치가 컨트랙트·코어 두 곳에 적혀 있다. 컨트랙트는 Solidity라
// 한 파일로 합칠 수 없으니, 대신 "두 곳이 어긋나면 테스트가 깨진다"로 묶어 둔다.
// 어긋나면 화면은 통과하는데 체인에서만 함정을 밟는 일이 생긴다.
// (클라이언트는 @giwa-village/core 의 doorRoll 을 임포트한다 — keccak256 판정의
//  단일 소스는 core/src/dungeon.ts 하나다.)

describe("던전 문 확률 — 컨트랙트·코어가 같은 표를 본다");

/** 두 언어에 적힌 DOOR_TABLE 표식을 읽는다: safeLt/bonusLt 쌍 3개 */
function doorThresholds(relPath) {
  const src = fs.readFileSync(path.join(ROOT, ...relPath.split("/")), "utf8");
  const match = src.match(/DOOR_TABLE:\s*([^\r\n]+)/);
  if (!match) throw new Error(`${relPath}: DOOR_TABLE 표식을 찾지 못했습니다`);
  const pairs = [...match[1].matchAll(/(\d{2,3})\/(\d{2,3})/g)].map((m) => [
    Number(m[1]),
    Number(m[2]),
  ]);
  if (pairs.length !== 3) throw new Error(`${relPath}: 문 3개의 경계를 못 읽었습니다`);
  return pairs;
}

const doorTable = {
  컨트랙트: doorThresholds("contracts/GiwaGuilds.sol"),
  코어: doorThresholds("core/src/dungeon.ts"),
};

it("두 구현의 경계값이 같다", () => {
  for (const [who, t] of Object.entries(doorTable)) {
    eq(JSON.stringify(t), JSON.stringify(doorTable.컨트랙트), `${who} 문 표: `);
  }
  console.log(`     돌 ${doorTable.컨트랙트[0].join("/")} · 바람 ${doorTable.컨트랙트[1].join("/")} · 도깨비 ${doorTable.컨트랙트[2].join("/")}`);
});

it("세 문 모두 귀환/전진 손익분기가 있고 위험·보너스가 서로 다르다", () => {
  // 한 걸음의 기대값: 안전 +1층, 순풍 +2층, 함정이면 지금까지 쌓은 잠정 층수를 전부 잃는다.
  // 따라서 잠정 t층에서 계속 오를 기대값은  p안전·1 + p순풍·2 − p함정·t.
  // 이게 0이 되는 t가 '슬슬 돌아가야 하는' 지점 — 그 지점이 존재해야 게임이 된다.
  const breaks = doorTable.컨트랙트.map(([safeLt, bonusLt]) => {
    const pSafe = safeLt / 256;
    const pBonus = (bonusLt - safeLt) / 256;
    const pTrap = (256 - bonusLt) / 256;
    const breakeven = (pSafe + 2 * pBonus) / pTrap;
    ok(breakeven >= 2 && breakeven <= 8, `손익분기 ${breakeven.toFixed(2)}층이 범위 밖입니다`);
    return breakeven;
  });
  ok(new Set(doorTable.컨트랙트.map(String)).size === 3, "세 문 확률표가 같으면 선택이 아닙니다");
  console.log(`     손익분기 돌 ${breaks[0].toFixed(2)} · 바람 ${breaks[1].toFixed(2)} · 도깨비 ${breaks[2].toFixed(2)}층`);
});

it("첫 원정 시드는 지연될 수 있는 RPC 조회보다 영수증을 우선한다", () => {
  const chainGuilds = fs.readFileSync(
    path.join(ROOT, "client", "src", "chain", "guilds.ts"),
    "utf8",
  );
  ok(/eventName\s*===\s*"SeedPinned"/.test(chainGuilds), "SeedPinned 영수증을 읽지 않습니다");
  ok(/receiptSeed\s*&&\s*receiptSeedBlock/.test(chainGuilds), "영수증 시드 우선 분기가 없습니다");
});

// ── 기척(omenAt) — 문 고르기가 결정이 되게 하는 클라이언트 힌트 ─────────────
// 표만으로는 기대값 최선이 늘 돌문 하나로 굳는다(guide/V4.md §10). 걸음마다 문 하나의 기척을
// 들려주면(열에 여덟은 맞는다) 최선의 수가 세 문에 퍼진다. 체인 · doorRoll 은 그대로다.

describe("던전 기척 — 문 앞의 힌트가 고르기를 결정으로 만든다 (체인은 그대로)");

const { omenAt, OMEN_ACCURACY_LT, OMEN_WORDS, DOOR_PROFILES } = await import(
  pathToFileURL(path.join(ROOT, "core", "src", "index.ts")).href
);
const OUTCOMES = ["safe", "bonus", "trap"];

/** 기척을 명세대로 바이트를 직접 쌓아 다시 계산한다 — omenAt 도, encodePacked 도 거치지 않는다 */
function omenSpec(seed, guildId, attempt, step) {
  const head = concat([hexToBytes(seed), numberToBytes(guildId, { size: 32 }), numberToBytes(attempt, { size: 4 }), numberToBytes(step, { size: 32 })]);
  const d = keccak256(concat([head, stringToBytes("omen")]), "bytes");
  const door = ((d[0] << 8) | d[1]) % 3;
  const b = keccak256(concat([head, numberToBytes(door, { size: 1 })]), "bytes")[0]; // = 온체인 doorRoll
  const truth = b < DOOR_PROFILES[door].safeLt ? "safe" : b < DOOR_PROFILES[door].bonusLt ? "bonus" : "trap";
  const others = OUTCOMES.filter((o) => o !== truth);
  return { door, truth, shows: d[2] < OMEN_ACCURACY_LT ? truth : others[d[3] & 1] };
}
const OMEN_SEEDS = Array.from({ length: 8 }, (_, k) => `0x${(k * 37 + 11).toString(16).padStart(2, "0").repeat(32)}`);
const omenSamples = Array.from({ length: 20000 }, (_, i) => {
  const args = [OMEN_SEEDS[i % 8], BigInt(i % 5), 1 + (i % 11), i];
  return { args, ...omenSpec(...args) };
});

it("기척은 결정론이고 명세대로 다시 계산한 값과 같다 — 화면에는 참 여부를 내주지 않는다", () => {
  for (let i = 0; i < omenSamples.length; i += 10) {
    const { args, door, shows } = omenSamples[i];
    const o = omenAt(...args);
    eq(JSON.stringify(o), JSON.stringify({ door, shows }), `표본 ${i}: `);
    eq(JSON.stringify(omenAt(...args)), JSON.stringify(o), "같은 입력 두 번: ");
  }
  for (const k of OUTCOMES) ok(OMEN_WORDS[k] && !OMEN_WORDS[k].startsWith("함정 "), `기척 문구 ${k} — 비었거나 "함정 "으로 시작한다(Unity 굽기가 위험 안내로 센다)`);
});

it("기척은 열에 여덟 참을 말하고 세 문을 고루 가리킨다 (표본 20,000)", () => {
  const n = omenSamples.length;
  const told = omenSamples.filter((x) => x.shows === x.truth).length / n;
  ok(Math.abs(told - 0.8) <= 0.015, `참을 말한 비율 ${told.toFixed(4)}`);
  const doors = [0, 1, 2].map((d) => omenSamples.filter((x) => x.door === d).length / n);
  for (const [d, share] of doors.entries()) ok(Math.abs(share - 1 / 3) <= 0.015, `문 ${d}이 기척 문인 비율 ${share.toFixed(4)}`);
  console.log(`     참 ${(told * 100).toFixed(1)}% · 기척 문 ${doors.map((x) => (x * 100).toFixed(1)).join(" / ")}%`);
});

/**
 * 웹 화면 규칙(함정이면 그 원정의 걸음을 버린다)에서 최선의 수를 뒤에서부터 푼다(DP).
 * 걸음마다 고르게 뽑힌 문 하나의 기척을 듣는다 — acc 확률로 참, 아니면 나머지 둘 중 하나.
 * acc = 1/3 이면 기척은 아무것도 알려 주지 않는다(기척이 없는 것과 같다).
 * 돌려주는 것: 0층에서의 기대 확정 층수 V0 와, 최선의 수를 따라갈 때 세 문이 골리는 비율.
 */
function doorDP(acc, T = 60) {
  const P = DOOR_PROFILES.map(({ safeLt, bonusLt }) => [safeLt / 256, (bonusLt - safeLt) / 256, (256 - bonusLt) / 256]);
  const V = new Float64Array(T + 3);
  const plan = []; // plan[t] = 기척(문 h · 들린 결과 c)마다 { 확률 w, 최선의 수 act(-1 = 귀환), 고른 문의 결과 분포 pr }
  for (let t = T + 2; t >= 0; t--) {
    if (t >= T) { V[t] = t; continue; }
    plan[t] = [];
    for (let h = 0; h < 3; h++) for (let c = 0; c < 3; c++) {
      const joint = P[h].map((p, k) => p * (k === c ? acc : (1 - acc) / 2));
      const pc = joint[0] + joint[1] + joint[2];
      if (pc === 0) continue;
      let best = t, act = -1, pr = null;
      for (let d = 0; d < 3; d++) {
        const q = d === h ? joint.map((x) => x / pc) : P[d];
        const value = q[0] * V[t + 1] + q[1] * V[t + 2]; // 함정은 0
        if (value > best + 1e-9) { best = value; act = d; pr = q; }
      }
      V[t] += (pc / 3) * best;
      plan[t].push({ w: pc / 3, act, pr });
    }
  }
  const picks = [0, 0, 0];
  for (let dist = new Map([[0, 1]]); dist.size; ) {
    const next = new Map();
    for (const [t, pt] of dist) {
      if (t >= T) continue;
      for (const { w, act, pr } of plan[t]) {
        if (act < 0) continue;
        picks[act] += pt * w;
        next.set(t + 1, (next.get(t + 1) ?? 0) + pt * w * pr[0]);
        next.set(t + 2, (next.get(t + 2) ?? 0) + pt * w * pr[1]);
      }
    }
    dist = next;
  }
  const total = picks[0] + picks[1] + picks[2];
  return { V0: V[0], share: picks.map((x) => x / total) };
}

it("기척이 있으면 문 고르기가 한 문으로 굳지 않는다 — 세 문 모두 10% 이상, 기대 층수도 오른다", () => {
  const blind = doorDP(1 / 3);
  const heard = doorDP(OMEN_ACCURACY_LT / 256);
  for (const [d, share] of heard.share.entries()) ok(share >= 0.1, `${DOOR_PROFILES[d].name}이 최선인 비율 ${(share * 100).toFixed(1)}%`);
  ok(heard.V0 > blind.V0, `기척이 있어도 기대 층수가 오르지 않는다 (${heard.V0.toFixed(2)} ≤ ${blind.V0.toFixed(2)})`);
  const pct = (r) => r.share.map((x) => `${(x * 100).toFixed(0)}%`).join(" · ");
  console.log(`     기척 없음 V0 ${blind.V0.toFixed(2)}층 (돌 · 바람 · 도깨비 ${pct(blind)}) → 기척 V0 ${heard.V0.toFixed(2)}층 (${pct(heard)})`);
});

// ── 풍류(배경음·효과음) ───────────────────────────────────────────────────
// 소리는 귀로만 확인되므로 규칙을 코드 밖에 두면 아무도 못 지킨다. track.ts는
// Web Audio를 모르는 순수 표라 여기서 그대로 불러 검사한다.

describe("풍류 — 상태가 트랙을 정하고, 임계는 화면과 하나다");

const { trackShape, isLowHp, LOW_HP } = await import(
  pathToFileURL(path.join(ROOT, "client", "src", "audio", "track.ts")).href
);

it("도깨비 곁에서는 트랙이 바뀐다 — 빨라지고 북이 붙는다", () => {
  const village = trackShape("village", 1);
  const hunt = trackShape("hunt", 1);
  ok(hunt.stepSec < village.stepSec, `토벌 ${hunt.stepSec} · 마을 ${village.stepSec}`);
  eq(village.drumEvery, 0, "마을에는 북이 없다: ");
  ok(hunt.drumEvery > 0, "토벌에는 북이 있어야 합니다");
  ok(hunt.restMax < village.restMax, "마을 쪽 여백이 더 길어야 합니다");
});

it("깎을수록 빨라진다 (진행도가 템포를 올린다)", () => {
  let prev = Infinity;
  for (let i = 10; i >= 0; i--) {
    const s = trackShape("hunt", i / 10).stepSec;
    ok(s < prev, `남은 체력 ${i * 10}%에서 느려졌습니다 (${s} ≥ ${prev})`);
    ok(s > 0.05, `${s}초 — 스텝이 너무 짧으면 소리가 뭉갭니다`);
    prev = s;
  }
  console.log(`     스텝 ${trackShape("hunt", 1).stepSec.toFixed(2)}s → ${prev.toFixed(2)}s`);
});

it("심장박동은 이름표가 붉어지는 바로 그 순간에 켜진다", () => {
  // 표본 41개 — 화면(붉은 맥동)과 소리(심장박동)가 한 순간도 어긋나면 안 된다.
  // 남은 체력 비율을 뒤집지 않고 그대로 넘기는 것이 요점: 1-x로 바꿔 넘기면
  // 경계(20%)에서 부동소수 오차만큼 어긋나 소리만 먼저 켜진다. (실제로 겪음)
  for (let i = 0; i <= 40; i++) {
    const hp = i / 40;
    eq(trackShape("hunt", hp).heartbeat, isLowHp(hp), `남은 체력 ${(hp * 100).toFixed(0)}%: `);
  }
  eq(trackShape("hunt", LOW_HP).heartbeat, false, "임계 자체는 아직 빈사가 아니다: ");
  eq(trackShape("hunt", LOW_HP - 1e-9).heartbeat, true, "임계 바로 아래: ");
  eq(trackShape("village", 0).heartbeat, false, "마을에서는 울리지 않는다: ");
});

it("그리는 쪽(Village.tsx)이 같은 임계 함수를 쓴다", () => {
  const villageSrc = fs.readFileSync(
    path.join(ROOT, "client", "src", "game", "Village.tsx"),
    "utf8",
  );
  ok(
    /isLowHp\(hpRatio\)/.test(villageSrc),
    "Village.tsx가 isLowHp를 쓰지 않습니다 — 임계가 두 벌이 되면 조용히 어긋납니다",
  );
  ok(
    !/hpRatio\s*<\s*0?\.\d/.test(villageSrc),
    "Village.tsx에 빈사 임계가 다시 하드코딩됐습니다",
  );
});

describe("효과음 — 마을이 삑삑거리지 않게 하는 규율");

const sfxSrc = fs.readFileSync(
  path.join(ROOT, "client", "src", "audio", "sfx.ts"),
  "utf8",
);

it("타격 레이트 리밋이 45~70ms 안에 있다 (연타가 기관총이 되지 않게)", () => {
  const m = sfxSrc.match(/lastHit\s*<\s*(\d+)/);
  ok(m, "레이트 리밋 값을 찾지 못했습니다");
  const ms = Number(m[1]);
  ok(ms >= 45 && ms <= 70, `${ms}ms — 45~70ms 밖입니다`);
  console.log(`     타격 최소 간격 ${ms}ms`);
});

it("효과음이 오디오 컨텍스트를 새로 열지 않는다", () => {
  ok(
    !/createAudioCtx/.test(sfxSrc),
    "효과음이 컨텍스트를 만들면 소리를 켠 적 없는 방문자에게 소리가 납니다",
  );
  ok(/liveAudioCtx/.test(sfxSrc), "liveAudioCtx로 이미 열린 컨텍스트만 써야 합니다");
});

it("반입한 소리가 가리키는 파일이 실제로 있다", () => {
  // 404가 나도 마을은 조용해지지 않는다(합성음으로 폴백) — 그래서 오타는 아무
  // 증상 없이 "소리가 좀 심심해진" 상태로 남는다. 여기서 잡는 이유다.
  const src = fs.readFileSync(
    path.join(ROOT, "client", "src", "audio", "samples.ts"),
    "utf8",
  );
  const paths = [...src.matchAll(/`?(audio\/[a-z]+\/[a-z0-9]+\.ogg)`?/g)].map((m) => m[1]);
  const groups = [...src.matchAll(/audio\/([a-z]+)\/\$\{n\}\.ogg/g)].length;
  ok(paths.length + groups > 5, `경로를 못 읽었습니다 (${paths.length}개)`);
  for (const p of paths) {
    ok(
      fs.existsSync(path.join(ROOT, "client", "public", ...p.split("/"))),
      `client/public/${p} 이 없습니다 — data/assets.json과 어긋났습니다`,
    );
  }
  // 묶음(step0..4 · hit0..2)은 이름을 만들어 쓰므로 따로 센다
  for (const [id, count] of [
    ["step", 5],
    ["hit", 3],
  ]) {
    for (let i = 0; i < count; i++) {
      const f = path.join(ROOT, "client", "public", "audio", "sfx", `${id}${i}.ogg`);
      ok(fs.existsSync(f), `audio/sfx/${id}${i}.ogg 이 없습니다`);
    }
  }
  console.log(`     낱개 ${paths.length}개 + 묶음 2종 확인`);
});

it("자동으로 나가는 전송(프레즌스 비컨)은 소리를 내지 않는다", () => {
  const presenceSrc = fs.readFileSync(
    path.join(ROOT, "client", "src", "chain", "presence.ts"),
    "utf8",
  );
  ok(
    /queueTx\([\s\S]{0,500}?\btrue,?\s*\)/.test(presenceSrc),
    "비컨이 silent(queueTx(fn, true))로 나가지 않습니다 — 마을이 몇 초마다 삑삑거립니다",
  );
});

// ── 에셋 원장 ─────────────────────────────────────────────────────────────
// 에셋 반입이 허용된 뒤로, 규칙은 "넣지 마라"가 아니라 "출처 없는 것은 넣지 마라"다.
// 라이선스는 사람의 기억에 맡기면 반드시 새는 종류의 것이라 여기서 강제한다.
// media/ 는 우리가 찍은 시연 캡처라 예외.

describe("에셋 원장 — 출처 없는 바이너리는 들어올 수 없다");

// SVG는 뺀다 — 우리가 코드로 그려 커밋하는 것(파비콘·아이콘·테스트 실행 캡처)이고,
// 텍스트라 diff로 읽힌다. 여기서 보는 것은 "읽을 수 없는 채로 들어오는 파일"이다.
const ASSET_EXT = /\.(png|jpe?g|gif|webp|mp3|wav|ogg|m4a|woff2?|ttf|otf|glb|gltf|fbx)$/i;
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "assets.json"), "utf8"));

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "dist") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkFiles(p, out);
    else out.push(path.relative(ROOT, p).split(path.sep).join("/"));
  }
  return out;
}

it("client/src에는 여전히 바이너리를 두지 않는다 (에셋은 public 아래)", () => {
  const found = walkFiles(path.join(ROOT, "client", "src")).filter((f) => ASSET_EXT.test(f));
  eq(found.length, 0, `소스 트리에 들어온 에셋: ${found.join(", ")} — `);
});

it("public의 모든 에셋이 원장에 적힌 자리 안에 있다", () => {
  const dests = manifest.entries.map((e) => e.dest);
  const orphans = walkFiles(path.join(ROOT, "client", "public"))
    .filter((f) => ASSET_EXT.test(f))
    .filter((f) => !dests.some((d) => f.startsWith(d + "/")));
  eq(orphans.length, 0, `원장에 없는 에셋: ${orphans.join(", ")} — data/assets.json에 적으세요. `);
});

it("라이선스가 허용 목록(CC0·CC-BY·OFL) 안에 있다", () => {
  for (const e of manifest.entries) {
    ok(manifest.licenses[e.license], `${e.id}: '${e.license}'은 허용 목록에 없습니다`);
    ok(e.source && /^https?:\/\//.test(e.source), `${e.id}: 출처 URL이 필요합니다`);
  }
  console.log(`     ${manifest.entries.length}건 · ${Object.keys(manifest.licenses).join(" · ")}`);
});

it("표기가 필요한 라이선스는 저작자 이름이 있다", () => {
  for (const e of manifest.entries) {
    if (!manifest.licenses[e.license].attribution) continue;
    ok(e.author && e.author.length > 1, `${e.id}: ${e.license}는 저작자 표기가 필수입니다`);
  }
});

it("용량이 예산 안에 있다", () => {
  const total = walkFiles(path.join(ROOT, "client", "public"))
    .filter((f) => ASSET_EXT.test(f))
    .reduce((n, f) => n + fs.statSync(path.join(ROOT, f)).size, 0);
  ok(
    total <= manifest.budgetBytes,
    `${Math.round(total / 1024)}KB — 예산 ${Math.round(manifest.budgetBytes / 1024)}KB를 넘었습니다`,
  );
  console.log(
    `     ${Math.round(total / 1024).toLocaleString()}KB / ${Math.round(manifest.budgetBytes / 1024).toLocaleString()}KB`,
  );
});

it("사람이 읽는 원장(ASSETS.md)이 최신이다", () => {
  const md = fs.readFileSync(path.join(ROOT, "ASSETS.md"), "utf8");
  for (const e of manifest.entries) {
    ok(md.includes(e.dest), `ASSETS.md에 ${e.dest}가 없습니다 — npm run assets 로 다시 만드세요`);
    ok(md.includes(e.author), `ASSETS.md에 저작자 ${e.author}가 없습니다`);
  }
});

// ── HUD 함정 (실제로 겪었던 버그) ──────────────────────────────────────────

describe("HUD — .hud는 pointer-events:none 이라 버튼마다 되살려야 한다");

const cssSrc = fs.readFileSync(path.join(ROOT, "client", "src", "index.css"), "utf8");

/** <button> 태그에 실제로 붙은 클래스만 뽑는다 (컨테이너 div는 제외) */
function buttonClasses(src) {
  const out = new Set();
  for (const m of src.matchAll(/<button[^>]*?className=(?:"([^"]*)"|\{`([^`]*)`\})/gs)) {
    const raw = m[1] ?? m[2] ?? "";
    // 템플릿 리터럴의 ${...} 조건부 부분은 떼고 정적 클래스만 본다
    for (const cls of raw.replace(/\$\{[^}]*\}/g, " ").split(/\s+/)) {
      if (cls.startsWith("hud-")) out.add(cls);
    }
  }
  return [...out];
}

it("HUD의 <button>에 붙은 클래스가 pointer-events:auto 를 가진다", () => {
  const hudSrc = fs.readFileSync(path.join(ROOT, "client", "src", "ui", "Hud.tsx"), "utf8");
  const classes = buttonClasses(hudSrc);
  ok(classes.length > 0, "검사할 버튼 클래스를 찾지 못했습니다");

  for (const c of classes) {
    // 그 클래스 자신 또는 CSS에서 그 클래스를 포함한 셀렉터가 auto를 주면 통과
    const rule = new RegExp(`\\.${c}\\b[^{]*\\{[^}]*pointer-events:\\s*auto`, "s");
    ok(
      rule.test(cssSrc),
      `.${c} 에 pointer-events:auto 가 없습니다 — .hud가 none이라 클릭이 캔버스로 샙니다`,
    );
  }
  console.log(`     검사한 버튼 클래스: ${classes.join(", ")}`);
});

// ── 첫 짐 — 서버 없는 공개 데모가 받지 않아도 되는 것 ──────────────────────
describe("첫 짐 — 룸 서버 클라이언트(colyseus.js)는 서버에 붙을 때만 받는다");

it("client/src 에 colyseus.js 를 정적으로 불러오는 파일이 없다 (import type 은 된다)", () => {
  const offenders = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(f.name) && /^import\s+(?!type\b)[^;]*from\s+["']colyseus\.js["']/m.test(fs.readFileSync(p, "utf8")))
        offenders.push(path.relative(ROOT, p));
    }
  };
  walk(path.join(ROOT, "client", "src"));
  ok(offenders.length === 0,
    `${offenders.join(", ")} — 정적 import 는 서버 없는 데모의 첫 짐에 약 110KB 를 붙인다(net/colyseus.ts 의 liveClient() 를 쓸 것)`);
});

// ── 재미 루프 — 소셜·선택형 온보딩·KST 일일 부탁 ────────────────────────
describe("재미 루프 — 무료 소셜 행동과 매일 하나의 선택");

const playerFunSrc = fs.readFileSync(path.join(ROOT, "client/src/game/social.ts"), "utf8");
const questFunSrc = fs.readFileSync(path.join(ROOT, "client/src/ui/QuestLog.tsx"), "utf8");
const presenceFunSrc = fs.readFileSync(path.join(ROOT, "client/src/chain/presence.ts"), "utf8");
const { DAILY_GOALS, kstDate } = await import(
  pathToFileURL(path.join(ROOT, "client/src/state/daily.ts")).href
);

it("이모트 5종이 서버/체인 비컨과 같은 아이콘 표를 쓴다", () => {
  for (const icon of ["👋", "🙇", "👏", "💃", "🍻"]) {
    ok(playerFunSrc.includes(`icon: "${icon}"`), `${icon} 소셜 메뉴가 없습니다`);
    ok(presenceFunSrc.includes(`"${icon}"`), `${icon} 비컨 코드가 없습니다`);
  }
});

it("무료 첫걸음 뒤 장사꾼·원정대·장인의 길을 고른다", () => {
  for (const pathName of ["장사꾼의 길", "원정대의 길", "장인의 길"]) {
    ok(questFunSrc.includes(pathName), `${pathName}이 없습니다`);
  }
  ok(questFunSrc.indexOf('id: "sit"') < questFunSrc.indexOf("const PATHS"), "무료 온기 전에 갈라지면 안 됩니다");
});

it("오늘의 부탁은 KST 날짜를 쓰고 세 무료 행동 중 하나다", () => {
  eq(kstDate(new Date("2026-08-29T15:30:00Z")), "2026-08-30", "KST 자정 경계: ");
  eq(Object.keys(DAILY_GOALS).sort().join(","), "browse,craft,greet", "일일 선택지: ");
});

// ── 마을 충돌 ─────────────────────────────────────────────────────────────
// collide.ts는 의존성이 없는 순수 모듈이라 노드가 타입만 벗겨 그대로 불러온다
// (소스를 정규식으로 훑을 필요가 없다 — 진짜 배치표로 진짜 함수를 돌린다).
// 여기서 보는 것은 둘이다: ① 벽을 뚫지 않는가 ② 갈 데를 막지 않는가.
// ②가 더 중요하다 — 부딪히는 것은 눈에 보이지만, 상호작용 지점이 막힌 것은
// "왜 이 버튼이 안 뜨지"로만 나타난다.

describe("마을 충돌 — 로컬에서만, 배치표 한 곳에서");

const {
  BOSS_POS: C_BOSS,
  CAMPFIRE_POS: C_FIRE,
  PORTAL_POS: C_PORTAL,
  HANOKS: C_HANOKS,
  PLAYER_R,
  VILLAGE_COLLIDERS,
  collide,
  insideAny,
  setDynamicColliders,
} = await import(
  pathToFileURL(path.join(ROOT, "client", "src", "game", "collide.ts")).href
);

/** 실제 조작처럼 잘게 걸어간다 — 한 프레임에 순간이동시키면 통과가 무의미하다 */
function walk(from, toX, toZ, steps = 400) {
  const p = { x: from[0], z: from[1] };
  for (let i = 0; i < steps; i++) {
    const dx = toX - p.x;
    const dz = toZ - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-3) break;
    const step = Math.min(d, 0.1); // 6 m/s · 60fps 한 프레임분
    p.x += (dx / d) * step;
    p.z += (dz / d) * step;
    collide(p);
  }
  return p;
}

it("한옥 안으로 걸어 들어가지 못한다", () => {
  for (const h of C_HANOKS) {
    const [hx, , hz] = h.position;
    // 마을 중앙에서 한옥 한가운데를 향해 걸어간다
    const p = walk([0, 6], hx, hz);
    const gap = Math.hypot(p.x - hx, p.z - hz);
    ok(gap > 1.5, `한옥(${hx.toFixed(1)}, ${hz.toFixed(1)}) 안으로 ${gap.toFixed(2)}m까지 들어갔습니다`);
  }
});

it("분수 안에 들어가지 못한다", () => {
  const p = walk([0, 8], 0, 0);
  ok(Math.hypot(p.x, p.z) > 2.6, `분수 중심에서 ${Math.hypot(p.x, p.z).toFixed(2)}m`);
});

it("벽에 비스듬히 부딪히면 미끄러진다 (제자리에 붙지 않는다)", () => {
  const h = C_HANOKS[0];
  const [hx, , hz] = h.position;
  // 한옥 옆을 스치듯 지나가는 목표 — 막히더라도 옆으로는 계속 나아가야 한다
  const p = walk([0, 6], hx * 1.6, hz * 1.6);
  ok(
    Math.hypot(p.x, p.z) > 12,
    `벽에 걸려 ${Math.hypot(p.x, p.z).toFixed(1)}m에서 멈췄습니다 — 미끄러지지 않습니다`,
  );
});

it("상호작용 지점은 막지 않는다 — 모닥불·도깨비·포털에 닿는다", () => {
  const spots = [
    ["모닥불", C_FIRE, 3.2],
    ["도깨비", C_BOSS, 4.5],
    ["포털", C_PORTAL, 4.5],
  ];
  for (const [name, pos, reach] of spots) {
    // 분수를 정면으로 들이받지 않는 자리에서 출발한다 — 검사하려는 것은
    // "길이 열려 있는가"이지 봇이 장애물을 돌아갈 줄 아는가가 아니다
    const p = walk([6, 6], pos[0], pos[2]);
    const d = Math.hypot(p.x - pos[0], p.z - pos[2]);
    ok(d < reach, `${name}까지 ${d.toFixed(2)}m — 상호작용 반경 ${reach}m 안에 못 들어갑니다`);
  }
});

it("첫 등장 자리(0, 5)와 광장이 비어 있다", () => {
  ok(!insideAny(0, 5, PLAYER_R), "스폰 지점이 무언가에 끼어 있습니다");
  for (let a = 0; a < 12; a++) {
    const x = Math.cos((a / 12) * Math.PI * 2) * 5;
    const z = Math.sin((a / 12) * Math.PI * 2) * 5;
    ok(!insideAny(x, z, PLAYER_R), `광장 반경 5m(${x.toFixed(1)}, ${z.toFixed(1)})가 막혀 있습니다`);
  }
});

it("마을 밖으로 나가지 못한다", () => {
  const p = walk([0, 6], 900, 900, 12000);
  ok(Math.hypot(p.x, p.z) <= 55.001, `${Math.hypot(p.x, p.z).toFixed(1)}m — 경계를 넘었습니다`);
});

it("노점은 열려 있을 때만 막는다 (닫히면 유령 벽이 남지 않는다)", () => {
  const at = [20, 0];
  ok(!insideAny(at[0], at[1], PLAYER_R), "검사 지점이 원래 막혀 있습니다");
  setDynamicColliders("test-stall", [
    { kind: "box", x: at[0], z: at[1], hw: 1.05, hd: 0.72, rot: 0 },
  ]);
  ok(insideAny(at[0], at[1], PLAYER_R), "열린 노점이 막지 않습니다");
  setDynamicColliders("test-stall", null);
  ok(!insideAny(at[0], at[1], PLAYER_R), "닫힌 노점 자리에 유령 벽이 남았습니다");
});

it("그리는 쪽(Village.tsx)이 같은 배치표를 읽는다", () => {
  const villageSrc = fs.readFileSync(
    path.join(ROOT, "client", "src", "game", "Village.tsx"),
    "utf8",
  );
  ok(
    /import\s*\{[^}]*HANOKS[^}]*\}\s*from\s*"\.\/collide"/s.test(villageSrc),
    "Village.tsx가 collide.ts의 배치표를 쓰지 않습니다 — 보이는 것과 막히는 것이 어긋납니다",
  );
  ok(
    !/mulberry32/.test(villageSrc),
    "Village.tsx에 좌표 생성기가 다시 생겼습니다 — 배치표는 collide.ts 한 곳입니다",
  );
  console.log(`     콜라이더 ${VILLAGE_COLLIDERS.length}개 (한옥 ${C_HANOKS.length}채 포함)`);
});

// ── 주민 산책 ─────────────────────────────────────────────────────────────
// 충돌을 넣은 뒤 주민들이 이상하게 움직였다. 상인의 집이 자기 좌판 안이라 매 틱
// 밀려났고, 목적지를 벽 안에서도 골라 평생 벽을 비볐다. 걸음 규칙을 순수 모듈로
// 떼어 뒀으니 브라우저 없이 진짜 노점 배치 위에서 1분씩 걸려 본다.

describe("주민 산책 — 벽을 비비지도, 한 틱에 튀지도 않는다");

const { makeWanderer, tickWander, pickTarget, NPC_R, NPC_SPEED, NPC_TICK_MS } = await import(
  pathToFileURL(path.join(ROOT, "client", "src", "demo", "wander.ts")).href
);
const { DEMO_STALLS } = await import(
  pathToFileURL(path.join(ROOT, "client", "src", "demo", "demoData.ts")).href
);
const { stallCollider } = await import(
  pathToFileURL(path.join(ROOT, "client", "src", "game", "collide.ts")).href
);

// 데모 마을 그대로 — 좌판·브랜드 점포까지 세워 두고 걷게 한다
setDynamicColliders("stalls", DEMO_STALLS.map(stallCollider));

/** 시드 난수 — 같은 시드면 같은 산책이라 실패를 재현할 수 있다 */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HOMES = npcsRaw.npcs.map((n) => [n.home[0], n.home[1]]);

it("상인은 자기 좌판 안에 서 있다 — 그래서 세울 때 한 번 밖으로 내보낸다", () => {
  const inStall = HOMES.filter(([x, z]) => insideAny(x, z, NPC_R)).length;
  ok(inStall > 0, "이 회귀의 출발점이 사라졌습니다 (좌판과 집이 더 이상 겹치지 않음)");
  const rand = seeded(7);
  for (const home of HOMES) {
    const w = makeWanderer(home, rand);
    ok(!insideAny(w.x, w.z, NPC_R), `${home}에 세운 주민이 벽 안에 있습니다`);
  }
  console.log(`     집이 노점·건물과 겹치는 주민 ${inStall}/${HOMES.length}명 — 세울 때 밖으로`);
});

it("목적지는 갈 수 있는 자리만 고른다", () => {
  const rand = seeded(11);
  for (const home of HOMES) {
    for (let i = 0; i < 60; i++) {
      const t = pickTarget(home, rand);
      // 집이 통째로 막힌 자리면 제자리를 돌려준다 — 그 경우만 예외
      const stay = t.x === home[0] && t.z === home[1];
      ok(stay || !insideAny(t.x, t.z, NPC_R), `${home} → (${t.x}, ${t.z})는 벽 안입니다`);
    }
  }
});

it("1분을 걸어도 한 틱에 한 걸음보다 더 가지 않는다 (튀지 않는다)", () => {
  const dt = NPC_TICK_MS / 1000; // 데모가 실제로 도는 주기 그대로
  const step = NPC_SPEED * dt;
  let worst = 0;
  let insideTicks = 0;
  let jitter = 0;
  const walked = [];
  for (let k = 0; k < HOMES.length; k++) {
    const rand = seeded(1000 + k);
    const w = makeWanderer(HOMES[k], rand);
    let total = 0;
    for (let i = 0; i < 60 / dt; i++) {
      const px = w.x;
      const pz = w.z;
      tickWander(w, dt, rand);
      const moved = Math.hypot(w.x - px, w.z - pz);
      total += moved;
      worst = Math.max(worst, moved);
      // 움직이는 시늉만 하는 틱 — 제자리 떨림이 이렇게 보인다
      if (moved > 0 && moved < step * 0.02) jitter++;
      if (insideAny(w.x, w.z, NPC_R * 0.99)) insideTicks++;
    }
    walked.push(total);
  }
  ok(worst <= step + 1e-9, `한 틱에 ${worst.toFixed(3)}m — 보폭 ${step.toFixed(3)}m를 넘었습니다`);
  eq(insideTicks, 0, "벽 안에서 끝난 틱: ");
  eq(jitter, 0, "제자리 떨림 틱: ");
  for (let k = 0; k < walked.length; k++) {
    ok(walked[k] > 5, `${npcsRaw.npcs[k].name}이 1분에 ${walked[k].toFixed(1)}m밖에 못 걸었습니다`);
  }
  console.log(
    `     1분에 ${Math.min(...walked).toFixed(0)}~${Math.max(...walked).toFixed(0)}m 걷고, 최대 보폭 ${worst.toFixed(3)}m`,
  );
});

setDynamicColliders("stalls", null);

// ── 공개 프로토콜 ─────────────────────────────────────────────────────────
// 마을은 클라이언트 하나가 아니라 프로토콜이다(PROTOCOL.md). 남이 만든
// 클라이언트가 같은 자리에 한옥을 세우고 같은 벽에 막히려면 배치표를 읽을 수
// 있어야 하는데, 원본은 TypeScript 안에 산다 — 그래서 굽는다(world.json).
// 굽는 것을 잊거나 문서가 서버보다 늦으면 조용히 어긋나므로 여기서 잡는다.

describe("공개 프로토콜 — 남이 만든 클라이언트도 같은 마을에 선다");

const { buildWorld, serializeWorld, WORLD_FILE, WORLD_VERSION } = await import(
  pathToFileURL(path.join(ROOT, "scripts", "lib", "world.mjs")).href
);
const worldText = fs.readFileSync(WORLD_FILE, "utf8");
const world = JSON.parse(worldText);
const rebuilt = serializeWorld(await buildWorld());

it("world.json이 지금 배치표와 일치한다 (굽는 것을 잊으면 여기서 걸린다)", () => {
  ok(rebuilt === worldText, "world.json이 낡았습니다 — npm run export-world 를 실행하세요");
  eq(world.version, WORLD_VERSION, "판: ");
});

it("공개 컨트랙트 표가 현재 배포 주소를 가리킨다", () => {
  const docs = ["README.md", "contracts/README.md", "client/public/tech.html"].map((rel) => ({
    rel,
    text: fs.readFileSync(path.join(ROOT, ...rel.split("/")), "utf8").toLowerCase(),
  }));
  for (const [name, deployment] of Object.entries(world.chain.contracts)) {
    for (const doc of docs) {
      ok(doc.text.includes(deployment.address.toLowerCase()), `${doc.rel}: ${name} 주소가 낡았습니다`);
    }
  }
});

it("SDK·MCP가 현재 배포 주소를 한 벌로 쓴다", () => {
  const consumers = [
    {
      name: "SDK",
      source: fs.readFileSync(path.join(ROOT, "sdk", "src", "index.ts"), "utf8").toLowerCase(),
      contracts: Object.keys(world.chain.contracts),
    },
    {
      name: "MCP",
      source: fs.readFileSync(path.join(ROOT, "mcp", "src", "village.mjs"), "utf8").toLowerCase(),
      contracts: ["market", "guilds", "presence", "offers", "hearth", "boss", "profile"],
    },
  ];
  for (const consumer of consumers) {
    for (const name of consumer.contracts) {
      const deployment = world.chain.contracts[name];
      ok(
        consumer.source.includes(deployment.address.toLowerCase()),
        `${consumer.name}: ${name} 주소가 낡았습니다`,
      );
    }
  }
});

it("world.json만 읽고 걸어도 같은 벽에 막힌다", () => {
  // 남의 클라이언트가 할 일을 그대로 해 본다 — TypeScript를 안 보고 JSON만 본다.
  const push = (p, c, radius) => {
    if (c.kind === "circle") {
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + radius;
      if (d >= min) return;
      if (d < 1e-4) {
        p.x = c.x + min;
        return;
      }
      p.x = c.x + (dx / d) * min;
      p.z = c.z + (dz / d) * min;
      return;
    }
    const cos = Math.cos(c.rot);
    const sin = Math.sin(c.rot);
    const dx = p.x - c.x;
    const dz = p.z - c.z;
    const lx = dx * cos - dz * sin;
    const lz = dx * sin + dz * cos;
    const ox = c.hw + radius - Math.abs(lx);
    const oz = c.hd + radius - Math.abs(lz);
    if (ox <= 0 || oz <= 0) return;
    let nx = lx;
    let nz = lz;
    if (ox < oz) nx = (lx < 0 ? -1 : 1) * (c.hw + radius);
    else nz = (lz < 0 ? -1 : 1) * (c.hd + radius);
    p.x = c.x + nx * cos + nz * sin;
    p.z = c.z + (-nx * sin + nz * cos);
  };
  const foreign = (x, z) => {
    const p = { x, z };
    for (const c of world.colliders) push(p, c, world.world.playerRadius);
    const d = Math.hypot(p.x, p.z);
    if (d > world.world.radius) {
      p.x = (p.x / d) * world.world.radius;
      p.z = (p.z / d) * world.world.radius;
    }
    return p;
  };

  let worst = 0;
  let touched = 0;
  for (let x = -56; x <= 56; x += 1.3) {
    for (let z = -56; z <= 56; z += 1.3) {
      const mine = { x, z };
      collide(mine, PLAYER_R);
      const theirs = foreign(x, z);
      if (mine.x !== x || mine.z !== z) touched++;
      worst = Math.max(worst, Math.hypot(mine.x - theirs.x, mine.z - theirs.z));
    }
  }
  ok(touched > 200, `막히는 지점이 ${touched}개뿐입니다 — 표본이 벽을 안 지나갑니다`);
  // 좌표를 0.1mm까지 반올림해 굽고 밀어내기가 그 위에서 겹치므로 mm 아래에서 논다.
  // 1mm를 넘으면 반올림이 아니라 규칙이 갈라진 것이다.
  ok(worst < 1e-3, `밀려난 자리가 ${(worst * 1000).toFixed(2)}mm 어긋났습니다`);
  console.log(`     막힌 지점 ${touched}개 · 최대 오차 ${(worst * 1000).toFixed(3)}mm`);
});

it("PROTOCOL.md가 실시간 룸 둘(village_live · expedition)의 메시지와 상수도 빠뜨리지 않는다", () => {
  // 다른 클라이언트(언리얼 등)가 같은 마을 · 같은 원정에 붙으려면 이 문서만 보고 짤 수 있어야 한다
  const doc = fs.readFileSync(path.join(ROOT, "PROTOCOL.md"), "utf8");
  const section = doc.slice(doc.indexOf("### 3.7"));
  ok(section.length > 200, "PROTOCOL.md에 §3.7(실시간 룸)이 없습니다");
  for (const [file, room] of [["LiveRoom.ts", "village_live"], ["ExpeditionRoom.ts", "expedition"]]) {
    const src = fs.readFileSync(path.join(ROOT, "server", "src", file), "utf8");
    const names = new Set();
    for (const re of [/\.onMessage\(\s*"([^"]+)"/g, /\.send\(\s*"([^"]+)"/g, /\.broadcast\(\s*"([^"]+)"/g])
      for (const m of src.matchAll(re)) names.add(m[1]);
    ok(names.size >= 4, `${file}에서 메시지를 ${names.size}개밖에 못 찾았습니다 — 추출 규칙을 보세요`);
    const missing = [...names].filter((n) => !section.includes(`\`${n}\``));
    eq(missing.join(", "), "", `PROTOCOL.md §3.7에 없는 ${room} 메시지: `);
    ok(section.includes(`\`${room}\``), `§3.7에 ${room} 룸이 없습니다`);
  }
  const index = fs.readFileSync(path.join(ROOT, "server", "src", "index.ts"), "utf8");
  ok(index.includes('define("village_live"') && index.includes('define("expedition"'), "서버가 두 룸을 같은 이름으로 열지 않습니다");
  const live = fs.readFileSync(path.join(ROOT, "server", "src", "LiveRoom.ts"), "utf8");
  const raid = fs.readFileSync(path.join(ROOT, "server", "src", "ExpeditionRoom.ts"), "utf8");
  const rules = fs.readFileSync(path.join(ROOT, "shared", "expedition.ts"), "utf8");
  const seats = live.match(/maxClients\s*=\s*(\d+)/)?.[1], party = rules.match(/MAX_PARTY\s*=\s*(\d+)/)?.[1];
  const hz = live.match(/1000\s*\/\s*(\d+)/)?.[1], tick = raid.match(/\},\s*(\d+)\);/)?.[1];
  ok(seats && party && hz && tick, "실시간 룸의 상수를 못 찾았습니다");
  ok(section.includes(`**${seats}명**`) && section.includes(`**${party}명**`), `정원(${seats}명 · ${party}명)이 §3.7과 다릅니다`);
  ok(section.includes(`**${hz}Hz**`) && section.includes(`**${1000 / Number(tick)}Hz**`), `주기(${hz}Hz · ${1000 / Number(tick)}Hz)가 §3.7과 다릅니다`);
  for (const ms of new Set([...live.matchAll(/>\s*(\d+)\)\s*void c\.leave/g), ...raid.matchAll(/>\s*(\d+)\)\s*void c\.leave/g)].map((m) => m[1])))
    ok(section.includes(`${Number(ms) / 1000}초`), `유휴 정리 ${Number(ms) / 1000}초가 §3.7에 없습니다`);
  const grace = raid.match(/RECONNECT_SECONDS\s*=\s*(\d+)/)?.[1];
  ok(grace && section.includes(`**${grace}초**`), `원정 재접속 유예(${grace}초)가 §3.7에 없습니다`);
  console.log(`     village_live ${seats}명 · ${hz}Hz / expedition ${party}명 · ${1000 / Number(tick)}Hz 문서와 일치`);
});

it("문서가 가리키는 월드 상수가 world.json 과 같다", () => {
  const doc = fs.readFileSync(path.join(ROOT, "PROTOCOL.md"), "utf8");
  ok(
    doc.includes(world.world.radius.toString()) && doc.includes(`x${world.chain.posScale}`),
    "월드 반경·좌표 배율이 문서에 없습니다",
  );
});

// ── 결과 ──────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(fail === 0 ? `전부 통과 (${pass}건) · 가스 0` : `실패 ${fail}건 / 통과 ${pass}건`);
process.exit(fail === 0 ? 0 : 1);
