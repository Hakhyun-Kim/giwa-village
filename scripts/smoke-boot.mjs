// 부팅 스모크 — 배포 전 회귀 게이트. 첫 방문자가 보는 것을 그대로 확인한다.
//
// 검사하는 것 (전부 "판단"이 아니라 "부팅"):
//   ① 마을이 뜬다 — 캔버스·HUD·노점·NPC
//   ② 온보딩(촌장의 부탁)이 첫 방문자에게 보인다
//   ③ 풍류 토글이 실제로 오디오를 연다 (효과음이 얹히는 컨텍스트)
//   ④ 미처리 예외 0건, 우리 코드에서 난 콘솔 에러 0건
//
// 일부러 검사하지 않는 것: 온체인 읽기의 성공 여부. 공개 테스트넷 RPC는
// 레이트리밋·리플리카 지연이 일상이라, 그걸 게이트에 넣으면 게이트가 남의 사정으로
// 빨간불이 되고 곧 아무도 안 본다. RPC 호스트에서 온 에러는 걸러낸다.
//
// 로컬: npm run build -w client (VITE_DEMO=1) 후 npm run smoke:boot
//       설치된 Chrome을 재사용하므로 브라우저 다운로드가 필요 없다.
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const PORT = 4179;
const RPC_HOST = "giwa.io"; // 공개 테스트넷 RPC·포셋·익스플로러 — 우리 결함이 아니다

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
function must(cond, msg) {
  if (!cond) fails.push(msg);
  console.log(`${cond ? "✅" : "❌"} ${msg}`);
}

function startPreview() {
  // vite를 node로 직접 실행 — npm 래퍼의 셸 차이(윈도우/리눅스) 없이 같은 경로로 돈다
  const child = spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "preview", "client", "--port", String(PORT), "--strictPort"],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  child.stderr.on("data", (d) => process.stderr.write(`[preview] ${d}`));
  return child;
}

async function waitServer(url, tries = 120) {
  for (let i = 0; i < tries; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // 아직 안 뜸 — 재시도
    }
    await wait(500);
  }
  throw new Error(`프리뷰 서버가 뜨지 않음: ${url}`);
}

/** 콘솔 error + 미처리 예외. 테스트넷 RPC발 잡음은 뺀다 (by-design) */
function collectErrors(page) {
  const errors = [];
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const url = m.location()?.url ?? "";
    const text = m.text();
    if ((url + text).includes(RPC_HOST)) return;
    if (/favicon|apple-touch-icon/.test(url + text)) return;
    errors.push(`[console] ${text}${url ? ` ← ${url}` : ""}`);
  });
  page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));
  return errors;
}

const browser = await chromium.launch({
  headless: true,
  // CI(리눅스 러너)는 GPU가 없어 소프트웨어 WebGL — 최신 크로미엄은 명시 플래그가 필요하다
  args: ["--enable-unsafe-swiftshader"],
  // 로컬은 설치된 Chrome 재사용, CI는 러너가 받아 둔 chromium
  ...(process.env.CI ? {} : { channel: process.env.SMOKE_CHANNEL || "chrome" }),
});
const server = startPreview();

try {
  await waitServer(`http://localhost:${PORT}/`);
  // 새 컨텍스트 = 빈 localStorage. 개발자 브라우저에는 이미 온보딩 진행 기록이
  // 남아 있어, 그대로 검사하면 "첫 방문자에게만 나는 문제"를 영영 못 잡는다.
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 640 } });
  const page = await ctx.newPage();
  const errors = collectErrors(page);

  // ?rafshim: 헤드리스에서 배경 탭 스로틀로 프레임이 멈추는 것을 막는다
  await page.goto(`http://localhost:${PORT}/?rafshim&debug`, {
    waitUntil: "domcontentloaded",
  });

  await page.waitForSelector("canvas", { timeout: 30000 });
  must(true, "3D 캔버스 부팅");

  await page.waitForFunction(() => window.__giwa?.ready?.() === true, {
    timeout: 60000,
  });
  const snap = await page.evaluate(() => {
    const s = window.__giwa.state();
    return {
      status: s.status,
      stalls: s.stalls.length,
      online: s.onlineCount,
      wallet: !!s.walletAddress,
      pos: window.__giwa.pos(),
    };
  });
  must(snap.status === "connected", `마을 입장 (status=${snap.status})`);
  must(snap.stalls >= 1, `노점이 선다 (${snap.stalls}개)`);
  must(snap.online >= 2, `주민이 산다 (${snap.online}명)`);
  must(snap.wallet, "데모 버너 지갑 생성");
  must(!!snap.pos, `내 아바타 위치 (${snap.pos?.x}, ${snap.pos?.z})`);

  // 첫 방문자 온보딩 — 이게 조용히 사라지면 신규 유저는 뭘 할지 모른 채 나간다
  const quest = await page
    .waitForSelector(".quest-card", { timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  must(quest, "촌장의 부탁(온보딩)이 첫 방문자에게 보인다");

  // 풍류 토글 — 소리(배경음+효과음)를 여는 유일한 창구다. 클릭 한 번에 켜져야 한다.
  await page.locator("button.hud-sound").click();
  const pref = await page.evaluate(() => localStorage.getItem("giwa-ambience"));
  must(pref === "1", `풍류 켜짐이 저장된다 (pref=${pref})`);

  // 배경음이 상태를 따라가는가. 소리는 귀로만 확인되므로 실제로 예약되는 오디오
  // 노드를 센다 — 마을은 가야금뿐(북 0), 도깨비 곁은 북이 붙는다.
  const track = await page.evaluate(async () => {
    const spy = { osc: 0, buf: 0 };
    const AC = AudioContext.prototype;
    const [osc, buf] = [AC.createOscillator, AC.createBufferSource];
    AC.createOscillator = function (...a) {
      spy.osc++;
      return osc.apply(this, a);
    };
    AC.createBufferSource = function (...a) {
      spy.buf++;
      return buf.apply(this, a);
    };
    const sample = async (mood, hp) => {
      window.__giwa.mood(mood, hp);
      await new Promise((r) => setTimeout(r, 400));
      const from = { ...spy };
      await new Promise((r) => setTimeout(r, 2500));
      return { osc: spy.osc - from.osc, buf: spy.buf - from.buf };
    };
    const village = await sample("village", 1);
    const hunt = await sample("hunt", 0.1); // 빈사 — 가장 빠른 트랙
    window.__giwa.mood("village", 1);
    return { village, hunt };
  });
  // 마을 트랙은 여백이 3~6초라 짧은 표본이 통째로 침묵일 수 있다 — 그걸 게이트로
  // 삼으면 가끔 빨간불이 되고, 그러면 곧 아무도 안 본다. 확정적인 것만 본다:
  // 토벌 트랙의 북은 두 스텝마다 반드시 울리고, 마을 트랙에는 북이 아예 없다.
  must(
    track.hunt.osc > 0 && track.hunt.buf > 0,
    `풍류가 실제로 소리를 예약한다 (토벌 ${track.hunt.osc}음·${track.hunt.buf}북 / 2.5초)`,
  );
  must(
    track.village.buf === 0,
    `마을에는 북이 없다 (북 ${track.village.buf} · 가야금 ${track.village.osc})`,
  );

  // 게임필 — 도깨비 이름표와 떠오르는 숫자. 연출만 흉내 내므로 가스가 들지 않는다.
  const bossTag = await page
    .waitForSelector(".boss-tag", { timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  must(bossTag, "도깨비 이름표(체력바)가 뜬다");
  if (bossTag) {
    await page.evaluate(() => window.__giwa.bossHit(123));
    const dmg = await page
      .waitForSelector(".boss-dmg", { timeout: 3000 })
      .then((el) => el.textContent())
      .catch(() => null);
    must(dmg?.includes("123") ?? false, `떠오르는 데미지 숫자 (${dmg ?? "없음"})`);
    // 풀이 새지 않는지 — 애니메이션이 끝나면 스스로 사라져야 한다
    await wait(1600);
    const left = await page.locator(".boss-dmg").count();
    must(left === 0, `숫자가 스스로 사라진다 (남은 ${left}개)`);
  }

  // 충돌 — 실제 프레임 위에서만 드러난다(로직은 npm test가 따로 본다).
  // 한옥 한가운데에 떨어뜨려 놓고, 프레임이 스스로 밖으로 밀어내는지 본다.
  const wall = await page.evaluate(() => window.__giwa.walls().find((c) => c.kind === "box"));
  const escaped = await page.evaluate(async (w) => {
    window.__giwa.teleport(w.x, w.z);
    await new Promise((r) => setTimeout(r, 600));
    const p = window.__giwa.pos();
    return { dist: Math.hypot(p.x - w.x, p.z - w.z), stuck: window.__giwa.blocked(p.x, p.z) };
  }, wall);
  must(
    escaped.dist > 1 && !escaped.stuck,
    `벽 안에서 빠져나온다 (${escaped.dist.toFixed(2)}m 밀려남)`,
  );

  // 걸어서 분수로 돌진 — 통과하지 못해야 한다
  const rammed = await page.evaluate(() => window.__giwa.teleport(0, 8));
  await page.keyboard.down("KeyW");
  await wait(1600);
  await page.keyboard.up("KeyW");
  const after = await page.evaluate(() => window.__giwa.pos());
  const fromCenter = Math.hypot(after.x, after.z);
  must(rammed && fromCenter > 2.5, `분수를 통과하지 못한다 (중심에서 ${fromCenter.toFixed(2)}m)`);
  must(after.z < 7.9, `걷기는 그대로 된다 (z 8 → ${after.z.toFixed(2)})`);

  // 몇 초 더 돌려 NPC 이동·주야 사이클·비컨 경로에서 터지는 것이 없는지 본다
  await wait(6000);
  must(errors.length === 0, `콘솔 에러 0 (${errors.length}건)`);
  errors.forEach((e) => console.log("   " + e));

  await ctx.close();
} finally {
  await browser.close();
  if (!server.killed) server.kill();
}

if (fails.length) {
  console.error(`\n💥 스모크 실패 ${fails.length}건:\n- ${fails.join("\n- ")}`);
  process.exit(1);
}
console.log("\n📗 스모크 통과 — 배포해도 좋다.");
