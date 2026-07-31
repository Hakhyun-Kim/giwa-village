// 부팅 스모크 — 배포 전 회귀 게이트. 첫 방문자가 보는 것을 그대로 확인한다.
//
// 검사하는 것 (전부 "판단"이 아니라 "부팅"):
//   ① 마을이 뜬다 — 캔버스·HUD·노점·NPC
//   ② 온보딩(촌장의 부탁)이 첫 방문자에게 보인다
//   ③ 환영 카드에 답하면 풍류가 함께 켜진다 (효과음이 얹히는 컨텍스트)
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
  // 오디오 그래프를 밖에서 들여다볼 창구. 앱 코드가 돌기 전에 심어야 컨텍스트를 잡는다.
  // (소리는 귀로만 확인되므로, 무엇이 실제로 세워졌는지는 이렇게만 알 수 있다)
  await ctx.addInitScript(() => {
    const Orig = window.AudioContext;
    window.__audio = { osc: 0, buf: 0, conv: 0, panner: 0, comp: 0, ctx: null };
    window.AudioContext = function (...a) {
      const c = new Orig(...a);
      window.__audio.ctx = c;
      return c;
    };
    window.AudioContext.prototype = Orig.prototype;
    const P = Orig.prototype;
    for (const [key, method] of [
      ["osc", "createOscillator"],
      ["buf", "createBufferSource"],
      ["conv", "createConvolver"],
      ["panner", "createPanner"],
      ["comp", "createDynamicsCompressor"],
    ]) {
      const orig = P[method];
      P[method] = function (...a) {
        window.__audio[key]++;
        return orig.apply(this, a);
      };
    }
  });
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

  // 환영 카드 — 첫 방문자에게 "자동으로 둘러볼까요?"를 딱 한 번 묻는다.
  // 처음 온 사람이 무엇을 눌러야 할지 모르는 것이 가장 흔한 이탈이므로,
  // 이게 안 뜨는 회귀는 게이트로 잡는다. 여기서는 "직접"을 골라 아래 검사를 잇는다.
  const welcome = await page
    .waitForSelector(".welcome-card", { timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  must(welcome, "환영 카드가 첫 방문자에게 뜬다 (자동 시연 여부를 묻는다)");
  if (welcome) {
    await page.locator("button.welcome-no").click();
    const answer = await page.evaluate(() => localStorage.getItem("giwa-welcome"));
    must(answer === "self", `한 번 답하면 다시 묻지 않는다 (giwa-welcome=${answer})`);
    const gone = await page.locator(".welcome-card").count();
    must(gone === 0, `카드가 사라진다 (남은 ${gone}개)`);
  }

  // 첫 방문자 온보딩 — 이게 조용히 사라지면 신규 유저는 뭘 할지 모른 채 나간다
  const quest = await page
    .waitForSelector(".quest-card", { timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  must(quest, "촌장의 부탁(온보딩)이 첫 방문자에게 보인다");

  // 풍류 — 자동재생 정책상 사용자 제스처 안에서만 열리는데, 환영 카드 답변이
  // 곧 첫 제스처다. 그래서 따로 누르지 않아도 이 시점엔 이미 켜져 있어야 한다.
  // (HUD의 풍류 버튼은 끄고 켜는 창구로 남는다)
  const pref = await page.evaluate(() => localStorage.getItem("giwa-ambience"));
  must(pref === "1", `환영 카드 선택이 풍류를 함께 켠다 (pref=${pref})`);

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
  // 토벌 트랙은 두 스텝마다 북이 반드시 울리므로 마을보다 확실히 촘촘하다.
  // (무엇이 북이고 무엇이 가야금인지는 세지 않는다 — 가야금도 버퍼로 울린 뒤로
  //  노드 종류로는 구분되지 않고, 구분하려 들면 테스트가 구현을 따라다니게 된다)
  const nodes = (s) => s.osc + s.buf;
  must(nodes(track.hunt) >= 4, `풍류가 실제로 소리를 예약한다 (토벌 ${nodes(track.hunt)}개 / 2.5초)`);
  must(
    nodes(track.hunt) > nodes(track.village) + 2,
    `토벌이 마을보다 촘촘하다 (마을 ${nodes(track.village)} → 토벌 ${nodes(track.hunt)})`,
  );

  // 믹서가 실제로 서는가 — 컴프레서 하나로 모으고, 마당 울림(리버브)을 태운다.
  // 이게 없으면 소리가 겹칠 때 찢어지고, 전부 "스피커에서 나는 소리"로 들린다.
  const graph = await page.evaluate(() => ({ ...window.__audio, ctx: undefined }));
  must(graph.comp === 1, `믹서 버스가 하나로 모인다 (컴프레서 ${graph.comp}개)`);
  must(graph.conv === 1, `마당 울림이 걸린다 (리버브 ${graph.conv}개)`);

  // 반입한 소리 조각이 실제로 로드되고, 모닥불이 **자리 소리**로 걸리는가.
  // (파일이 없으면 panner가 0이고, 그때도 마을은 조용해지지 않아야 한다)
  await page.waitForFunction(() => window.__audio.panner > 0, { timeout: 15000 }).catch(() => {});
  const fire = await page.evaluate(() => window.__audio.panner);
  must(fire > 0, `모닥불이 자리 소리로 걸린다 (panner ${fire}개)`);

  // 귀가 아바타를 따라가는가 — 카메라에 귀를 달면 모닥불 옆에 서도 소리가 멀리서 난다
  const ears = await page.evaluate(async () => {
    const l = window.__audio.ctx?.listener;
    if (!l?.positionX) return null;
    const read = () => ({ x: +l.positionX.value.toFixed(2), z: +l.positionZ.value.toFixed(2) });
    window.__giwa.teleport(-9, 12);
    await new Promise((r) => setTimeout(r, 500));
    const near = read();
    window.__giwa.teleport(26, -6);
    await new Promise((r) => setTimeout(r, 500));
    const far = read();
    // 첫 등장 자리로 돌려놓는다 — 뒤에 오는 검사들이 "화면에 보이는 것"을 보기 때문
    window.__giwa.teleport(0, 5);
    await new Promise((r) => setTimeout(r, 700));
    return { near, far };
  });
  must(
    !!ears && Math.hypot(ears.near.x + 9, ears.near.z - 12) < 1.5 && ears.far.x > 20,
    `귀가 아바타를 따라간다 (${ears ? `${ears.near.x},${ears.near.z} → ${ears.far.x},${ears.far.z}` : "리스너 없음"})`,
  );

  // 게임필 — 도깨비 이름표와 떠오르는 숫자. 연출만 흉내 내므로 가스가 들지 않는다.
  // 도깨비 상태는 공개 RPC에서 온다. 못 읽었거나 이번 주 도깨비가 이미 잡혔으면
  // **건너뛴다** — 남의 사정으로 게이트가 빨간불이 되면 곧 아무도 안 보기 때문.
  const bossState = await page.evaluate(() => window.__giwa.state().boss);
  const bossTag = bossState?.slain === false && (await page
    .waitForSelector(".boss-tag", { timeout: 20000 })
    .then(() => true)
    .catch(() => false));
  if (!bossState) console.log("⏭ 도깨비 상태를 아직 못 읽었다 (공개 RPC) — 이름표 검사 건너뜀");
  else if (bossState.slain) console.log("⏭ 이번 주 도깨비는 이미 잡혔다 — 이름표 검사 건너뜀");
  else must(bossTag, "도깨비 이름표(체력바)가 뜬다");
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

  // 주민 걸음 — 충돌을 넣은 뒤 튀던 것. 좌표를 시간에 따라 찍어야만 보인다.
  // 타이머는 부하에 따라 늘어지므로 거리가 아니라 **속도**로 본다.
  const walk = await page.evaluate(async () => {
    const frames = [];
    for (let i = 0; i < 24; i++) {
      frames.push({ at: performance.now(), pos: window.__giwa.remotes() });
      await new Promise((r) => setTimeout(r, 100));
    }
    let topSpeed = 0;
    let moved = 0;
    for (let i = 1; i < frames.length; i++) {
      const dt = (frames[i].at - frames[i - 1].at) / 1000;
      for (const [id, b] of Object.entries(frames[i].pos)) {
        const a = frames[i - 1].pos[id];
        if (!a || dt <= 0) continue;
        const d = Math.hypot(b.x - a.x, b.z - a.z);
        moved += d;
        topSpeed = Math.max(topSpeed, d / dt);
      }
    }
    return { topSpeed, moved, count: Object.keys(frames[0].pos).length };
  });
  must(walk.count >= 1 && walk.moved > 0.5, `주민이 실제로 걷는다 (${walk.count}명 · ${walk.moved.toFixed(1)}m)`);
  // 걷는 속도는 2.4m/s — 튀는 프레임이 하나라도 있으면 여기서 몇 배로 잡힌다
  must(walk.topSpeed < 4, `걸음이 튀지 않는다 (최고 ${walk.topSpeed.toFixed(2)}m/s)`);

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

  // 환영 카드의 "예" 갈래 — 잔액 0인 첫 방문자가 고르는 길이다. 여기서 시연이
  // 터지면 처음 온 사람이 정확히 그것만 보게 되므로, 첫 자막까지는 확인한다.
  // (전체 시연은 몇 분짜리라 게이트에 넣지 않는다 — 시작과 중단만 본다)
  await page.evaluate(() => localStorage.removeItem("giwa-welcome"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__giwa?.ready?.() === true, { timeout: 60000 });
  await page.waitForSelector("button.welcome-yes", { timeout: 15000 });
  await page.locator("button.welcome-yes").click();
  const started = await page
    .waitForSelector(".sc-bar", { timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  must(started, "‘자동으로 둘러보기’를 고르면 시연이 그 자리에서 시작한다");
  const hidden = await page.locator(".quest-card").count();
  must(hidden === 0, `시연 중에는 촌장의 부탁이 비켜 준다 (남은 ${hidden}개)`);
  await page.keyboard.press("Escape");
  const back = await page
    .waitForSelector(".quest-card", { timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  must(back, "ESC로 멈추면 촌장의 부탁이 다시 안내를 잇는다");

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
