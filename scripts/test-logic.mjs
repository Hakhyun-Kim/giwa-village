// 무가스 로직 테스트 — 체인도, 지갑도, 네트워크도 쓰지 않는다.
// 가스가 드는 테스트는 아껴야 하므로, 규칙으로 검증할 수 있는 것은 전부 여기서
// 검증한다. 밀리초 단위라 저장할 때마다 돌려도 부담이 없다.
//
// Usage: npm test
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEther } from "viem";
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

// ── 결과 ──────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(fail === 0 ? `전부 통과 (${pass}건) · 가스 0` : `실패 ${fail}건 / 통과 ${pass}건`);
process.exit(fail === 0 ? 0 : 1);
