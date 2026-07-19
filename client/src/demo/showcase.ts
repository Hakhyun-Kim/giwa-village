// 자동 시연(쇼케이스) 모드 — ?showcase=1
// 키 조작 없이 입장→산책→노점 개설→구매(온체인)→쿠폰 정산→영수증까지
// 자막과 함께 자동 진행한다. 테스터가 설명 없이 보기만 해도 전체 플로우를
// 이해하도록 하는 것이 목적. 로컬 풀스택(서버+dev 지갑) 전용.
import { useStore } from "../state/store";
import { getBalanceEth } from "../wallet/wallet";
import { loadCoupons } from "../state/coupons";
import { giwaSepolia, FAUCET_URL, DEMO } from "../config/giwa";
import { createGuild, dungeonBank, dungeonPick } from "../net/colyseus";
import {
  HONOR_DEFS,
  fetchHonors,
  honorWrite,
  fetchOffersFor,
  sendBeacon,
} from "../chain/village";

const MIN_BALANCE_ETH = 0.002; // 구매 + 가스 여유

let started = false;
let aborted = false;

export function maybeStartShowcase(): void {
  // HMR로 모듈이 재로드돼도 시연이 중복 실행되지 않도록 전역 플래그 사용
  const w = window as unknown as { __giwaShowcase?: boolean };
  if (started || w.__giwaShowcase) return;
  const params = new URLSearchParams(location.search);
  if (params.get("showcase") !== "1") return;
  started = true;
  w.__giwaShowcase = true;
  void run();
}

// ---- 오버레이 ----

const STYLE = `
.sc-bar { position: fixed; left: 50%; bottom: 64px; transform: translateX(-50%);
  z-index: 60; max-width: min(720px, 92vw); background: rgba(12, 15, 24, 0.88);
  border: 1px solid rgba(255, 214, 107, 0.35); border-radius: 14px;
  padding: 14px 20px; color: #eef2f8; text-align: center;
  font-size: 17px; line-height: 1.5; box-shadow: 0 6px 24px rgba(0,0,0,0.45);
  transition: opacity 0.4s; }
.sc-bar .sc-badge { display: inline-block; margin-bottom: 6px; padding: 2px 10px;
  border-radius: 999px; background: #ffd66b; color: #1a1508; font-size: 11.5px;
  font-weight: 700; }
.sc-bar .sc-sub { margin-top: 5px; font-size: 13px; color: #9aa7bd; }
.sc-bar a { color: #ffd66b; }
.sc-skip { position: fixed; right: 14px; bottom: 14px; z-index: 60;
  background: rgba(12,15,24,0.7); color: #9aa7bd; border: 1px solid #2a3040;
  border-radius: 8px; padding: 5px 10px; font-size: 12px; cursor: pointer; }
.sc-skip:hover { color: #ffd66b; }
`;

let bar: HTMLDivElement | null = null;
let skipBtn: HTMLButtonElement | null = null;

function mountOverlay() {
  for (const el of document.querySelectorAll(".sc-bar, .sc-skip")) el.remove();
  const style = document.createElement("style");
  style.textContent = STYLE;
  document.head.appendChild(style);
  bar = document.createElement("div");
  bar.className = "sc-bar";
  document.body.appendChild(bar);
  skipBtn = document.createElement("button");
  skipBtn.className = "sc-skip";
  skipBtn.textContent = "시연 건너뛰기 (ESC)";
  skipBtn.onclick = () => abort();
  document.body.appendChild(skipBtn);
  window.addEventListener("keydown", onEsc);
}

function onEsc(e: KeyboardEvent) {
  if (e.code === "Escape") abort();
}

function abort() {
  aborted = true;
  teardown("직접 둘러보세요 — WASD 이동 · E 인사 · 노점 클릭 구매 · 포털 F");
}

function teardown(finalText?: string) {
  window.removeEventListener("keydown", onEsc);
  skipBtn?.remove();
  skipBtn = null;
  if (bar && finalText) {
    caption(finalText);
    const el = bar;
    setTimeout(() => {
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 500);
    }, 6000);
  } else {
    bar?.remove();
  }
  bar = null;
}

function caption(html: string, sub?: string) {
  if (!bar) return;
  bar.innerHTML =
    `<span class="sc-badge">자동 시연</span><div>${html}</div>` +
    (sub ? `<div class="sc-sub">${sub}</div>` : "");
}

// ---- 조작 헬퍼 ----

const sleep = (ms: number) =>
  new Promise<void>((r) => setTimeout(r, ms));

async function pace(ms: number) {
  const step = 200;
  for (let t = 0; t < ms; t += step) {
    if (aborted) throw new Error("skipped");
    await sleep(Math.min(step, ms - t));
  }
}

async function waitFor(cond: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (aborted) throw new Error("skipped");
    if (cond()) return true;
    await sleep(300);
  }
  return cond();
}

function findButton(text: string): HTMLButtonElement | null {
  for (const b of document.querySelectorAll("button")) {
    if (b.textContent?.includes(text)) return b as HTMLButtonElement;
  }
  return null;
}

async function clickButton(text: string): Promise<boolean> {
  const ok = await waitFor(() => !!findButton(text), 10000);
  if (!ok) return false;
  findButton(text)?.click();
  return true;
}

/** React controlled input에 한 글자씩 타이핑 */
async function typeInto(input: HTMLInputElement, text: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )!.set!;
  input.focus();
  for (let i = 1; i <= text.length; i++) {
    setter.call(input, text.slice(0, i));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await pace(90);
  }
  input.blur();
}

/** WASD 산책 — Player가 e.code를 보므로 합성 키 이벤트로 충분 */
async function walk(code: string, ms: number) {
  (document.activeElement as HTMLElement | null)?.blur?.();
  window.dispatchEvent(new KeyboardEvent("keydown", { code }));
  await pace(ms);
  window.dispatchEvent(new KeyboardEvent("keyup", { code }));
  await pace(200);
}

// ---- 길드 + 던전 비트 ----

async function showGuildDungeon(my: string) {
  const inGuild = () =>
    useStore
      .getState()
      .guilds.find((g) =>
        g.members.some((m) => m.address.toLowerCase() === my.toLowerCase()),
      );

  caption(
    "🏯 <b>길드와 백층 던전</b> — 길드원들이 각자의 시간에 이어 등반하는 비동기 코업",
    "던전 시드는 매주 GIWA 블록 해시로 고정됩니다",
  );
  useStore.getState().setGuildOpen(true);
  await pace(2500);

  if (!inGuild()) {
    const guildName = `원정대-${my.slice(2, 6)}`;
    createGuild(guildName, "🐯");
    await waitFor(() => !!inGuild(), 40000); // 온체인 모드: tx 확정 + 동기화 대기
    if (!inGuild()) throw new Error("길드 생성 실패");
    caption(`길드 <b>${guildName}</b> 창설 — 이제 함께 등반할 수 있습니다`);
    await pace(2500);
  }

  useStore.getState().setGuildOpen(false);
  useStore.getState().setDungeonOpen(true);
  await waitFor(() => !!useStore.getState().dungeon, 40000);
  await pace(2000);

  // 문 두 개까지 열어보고, 수확이 있으면 귀환해 길드 기록에 쌓는다
  for (let i = 0; i < 2; i++) {
    const d = useStore.getState().dungeon;
    if (!d || d.ended) break;
    caption("🚪 문을 골라 오르는 중… 함정을 밟으면 이번 원정 수확을 잃습니다");
    dungeonPick(Math.floor(Math.random() * 3));
    await waitFor(() => useStore.getState().dungeon?.busy === false, 10000);
    await pace(1800);
  }
  const d = useStore.getState().dungeon;
  if (d && !d.ended && d.tentative > 0) {
    caption(`🏮 귀환 — +${d.tentative}층을 길드 기록에 확정합니다`);
    dungeonBank();
    await waitFor(() => useStore.getState().dungeon?.ended === true, 60000);
    await pace(2200);
  } else if (d?.ended) {
    caption("💥 함정! 잠정 층수를 잃었습니다 — 다음 길드원이 이어서 도전합니다");
    await pace(2500);
  }

  const g = inGuild();
  if (g) {
    caption(
      `${g.emblem} <b>${g.name}</b> — 이번 주 ${g.dungeon.floor}층 · 길드 리더보드에서 경쟁합니다`,
      "게임 보상은 양도 불가(소울바운드) 원칙 — 거래는 노점에서만",
    );
  }
  await pace(4000);
  useStore.getState().setDungeonOpen(false);
  useStore.getState().setDungeon(null);
}

// ---- 선물·흥정 비트 ----

async function showGiftBeat(_my: string) {
  const peer = Object.values(useStore.getState().players).find((p) =>
    /^0x[0-9a-fA-F]{40}$/.test(p.address ?? ""),
  );
  if (!peer) return; // 다른 방문자가 없으면 생략
  caption(
    "🎁 쿠폰은 <b>선물</b>할 수 있습니다 — ERC-1155 토큰이 지갑에서 지갑으로",
    `${peer.name} 님에게 방금 산 쿠폰을 보내봅니다`,
  );
  useStore.getState().setCouponsOpen(true);
  await pace(2200);
  const giftBtn = findButton("선물");
  if (!giftBtn) {
    useStore.getState().setCouponsOpen(false);
    return;
  }
  giftBtn.click();
  await pace(800);
  const input = document.querySelector<HTMLInputElement>(
    "input[placeholder^='받는 지갑']",
  );
  if (input) await typeInto(input, peer.address);
  await pace(400);
  findButton("보내기")?.click();
  await waitFor(() => !!findButton("선물함") || !findButton("보내기"), 60000);
  caption("전달 완료 — 받는 쪽 쿠폰함에 체인 스캔만으로 나타납니다");
  await pace(3000);
  useStore.getState().setCouponsOpen(false);
}

async function showOfferBeat(my: string) {
  const offers = await fetchOffersFor(my).catch(() => []);
  if (offers.length === 0) return; // 들어온 제안이 없으면 생략
  const o = offers[0];
  caption(
    `💬 <b>흥정</b>이 들어와 있습니다 — ${o.itemName}에 ${o.amountEth} ETH 제안`,
    "제안 금액은 오퍼 컨트랙트에 에스크로로 걸려 있습니다",
  );
  useStore.getState().setLedgerOpen(true);
  await pace(2800);
  findButton("수락")?.click();
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    const left = (await fetchOffersFor(my).catch(() => offers)).length;
    if (left < offers.length) break;
    await pace(3000);
  }
  caption(
    "🤝 수락 — 제안가로 <b>즉시 체결</b>: 정산 + 쿠폰 전달이 한 트랜잭션입니다",
  );
  await pace(3200);
  useStore.getState().setLedgerOpen(false);
}

// ---- 공방·모닥불 비트 ----

async function showWorkshopBeat() {
  caption(
    "🎨 <b>문양 공방</b> — 8×8 픽셀을 직접 그려 온체인에 등록하고 팝니다",
    "유저 창작물이 마을 경제의 상류를 만듭니다",
  );
  useStore.getState().setWorkshopOpen(true);
  await pace(2000);
  findButton("문양 장터")?.click();
  await pace(3000);
  caption(
    "🏬 다른 사람이 그린 문양을 사서 아바타에 답니다",
    "판매 대금은 창작자에게 직접 전달됩니다",
  );
  await pace(3000);
  useStore.getState().setWorkshopOpen(false);
}

async function showCampfireBeat() {
  caption(
    "🔥 <b>모닥불</b> — 함께 앉으면 온기가 쌓입니다 (혼자서는 안 됩니다)",
    "매주 토 21시 장날엔 온기 2배 — 모두가 모일 시간",
  );
  // 모닥불(-9,0,9)로 걸어가 앉는다
  await walk("KeyA", 1200);
  await walk("KeyS", 1000);
  const s = useStore.getState();
  if (s.nearFire && !s.selfSitting) {
    s.setSelfSitting(true);
    void sendBeacon(4, true);
  }
  await pace(3500);
  useStore.getState().setSelfSitting(false);
  void sendBeacon(0, true);
}

async function showBossBeat() {
  const boss = useStore.getState().boss;
  if (!boss || boss.slain) return;
  caption(
    "🧿 광장의 <b>장터 도깨비</b> — 혼자선 못 잡습니다, 함께 때려야죠",
    "주간 보스 · 데미지는 블록해시 롤 + 모닥불 온기 보정 · 장날 2배",
  );
  // 모닥불(-9,9) → 도깨비(12,14)로 이동
  await walk("KeyD", 3400);
  await walk("KeyS", 900);
  await pace(800);
  caption("💥 타격! — 내 기여도가 길드와 함께 체인에 쌓입니다");
  const { strikeBoss, refreshBoss } = await import("../chain/boss");
  await strikeBoss().catch(() => {});
  await refreshBoss();
  await pace(3200);
}

// ---- 칭호 비트 ----

async function showHonors(my: string) {
  caption(
    "🎖 <b>소울바운드 칭호</b> — 온체인 기록으로 증명하고 이름표에 답니다",
    "전송 함수가 아예 없는 순수 기록 — 게임 보상 양도 불가 원칙",
  );
  useStore.getState().setHonorsOpen(true);
  await pace(2800);
  const p = await fetchHonors(my);
  const target = HONOR_DEFS.find(
    (d, i) => p.eligible[i] && (p.mask & (1 << d.id)) === 0,
  );
  if (target) {
    caption(`${target.emoji} <b>${target.name}</b> 획득 중 — ${target.desc}`);
    await honorWrite("claim", target.id);
    await honorWrite("equip", target.id);
    // 다이얼로그를 새로 열어 획득·장착 상태를 반영
    useStore.getState().setHonorsOpen(false);
    useStore.getState().setHonorsOpen(true);
    caption(
      `${target.emoji} <b>${target.name}</b> 장착 — 다른 주민들에게 이름표 배지로 보입니다`,
    );
    await pace(3500);
  } else {
    await pace(1500);
  }
  useStore.getState().setHonorsOpen(false);
}

// ---- 시나리오 ----

async function run() {
  mountOverlay();
  try {
    // 0) 접속·지갑 대기 (데모 모드 = 풀온체인 서버리스로 그대로 시연)
    caption(
      "🏮 <b>기와장터</b> — 지갑이 아바타가 되는 한옥 저잣거리입니다",
      DEMO ? "풀온체인 서버리스 — 서버 없이 GIWA 체인만으로 동작 중" : "접속 중…",
    );
    const ready = await waitFor(() => {
      const s = useStore.getState();
      return s.status === "connected" && !!s.walletAddress && s.stalls.length > 0;
    }, 30000);
    if (!ready) {
      caption("서버에 연결하지 못했습니다", "test.cmd 로 서버를 먼저 띄워주세요");
      await pace(8000);
      teardown();
      return;
    }
    const my = useStore.getState().walletAddress!;
    await pace(3500);

    // 1) 잔액 확인 — 없으면 포셋 안내 후 대기
    let bal = Number(await getBalanceEth(my).catch(() => "0"));
    if (bal < MIN_BALANCE_ETH) {
      void navigator.clipboard?.writeText(my).catch(() => {});
      caption(
        `테스트 ETH가 필요합니다 — <a href="${FAUCET_URL}" target="_blank" rel="noreferrer">GIWA 포셋 ↗</a>에서 받아주세요`,
        `내 주소 ${my.slice(0, 6)}…${my.slice(-4)} 를 클립보드에 복사했습니다 · 입금되면 자동으로 계속합니다`,
      );
      await waitFor(() => {
        void getBalanceEth(my).then((v) => (bal = Number(v))).catch(() => {});
        return bal >= MIN_BALANCE_ETH;
      }, 15 * 60_000);
      if (bal < MIN_BALANCE_ETH) {
        caption("잔액이 확인되지 않아 시연을 종료합니다");
        await pace(6000);
        teardown();
        return;
      }
    }

    // 2) 산책 — 봇 주민과 노점 구경
    caption(
      "봇 주민들이 저잣거리에서 노점을 열고 있습니다",
      "WASD 이동 · E 인사 · 아바타 클릭 선물",
    );
    await walk("KeyW", 1500);
    await walk("KeyD", 1000);
    await walk("KeyW", 1000);
    await walk("KeyA", 800);
    await pace(1200);

    // 3) 노점 개설 (이전 시연이 남긴 노점이 있으면 먼저 정리)
    if (findButton("노점 닫기")) {
      findButton("노점 닫기")?.click();
      await waitFor(() => !!findButton("노점 열기"), 10000);
      await pace(800);
    }
    caption("🧺 <b>노점 열기</b> — 지금 서 있는 자리에 내 노점이 펼쳐집니다");
    await clickButton("노점 열기");
    await pace(900);
    const nameInput = document.querySelector<HTMLInputElement>(
      "input[placeholder^='노점 이름']",
    );
    if (nameInput) await typeInto(nameInput, "달님네 잡화점");
    await pace(400);
    findButton("등불")?.click();
    await pace(900);
    findButton("노점 개설")?.click();
    caption(
      "노점 개설 — 상품 가격은 <b>GiwaMarket 컨트랙트에 온체인 기록</b>됩니다",
      "이후 구매는 컨트랙트가 정확한 가격만 받도록 강제합니다",
    );
    await waitFor(() => !!findButton("노점 닫기"), 30000);
    await pace(4000);

    // 4) 다른 노점에서 구매 (봇 노점 우선, 없으면 브랜드 상점)
    const s = useStore.getState();
    const target =
      s.stalls.find(
        (st) =>
          !st.brand &&
          st.ownerAddress.toLowerCase() !== my.toLowerCase() &&
          st.items.some((i) => Number(i.priceEth) <= 0.001),
      ) ??
      s.stalls.find(
        (st) => st.ownerAddress.toLowerCase() !== my.toLowerCase(),
      );
    if (!target) throw new Error("구매할 노점이 없습니다");
    caption(
      `🛍️ <b>${target.title}</b>에서 구매해 봅니다`,
      "결제는 에스크로에 보관되고, ERC-1155 쿠폰이 지갑에 발행됩니다",
    );
    const couponsBefore = loadCoupons(my).length;
    useStore.getState().setStallView(target.id);
    await pace(2200);
    document
      .querySelector<HTMLButtonElement>(".stall-item button")
      ?.click();
    caption(
      "⛓️ 온체인 트랜잭션 확정을 기다리는 중…",
      "GIWA Sepolia 테스트넷 — 잠시 걸릴 수 있습니다",
    );
    const bought = await waitFor(
      () => loadCoupons(my).length > couponsBefore,
      180_000,
    );
    useStore.getState().setStallView(null);
    if (!bought) {
      caption("트랜잭션이 확정되지 않았습니다 — 잠시 후 다시 시도해 주세요");
      await pace(6000);
      teardown();
      return;
    }
    await pace(1500);

    // 5) 쿠폰함 정산
    caption(
      "🎫 <b>쿠폰함</b> — 받은 쿠폰을 확인하고 정산을 확정합니다",
      "확정하면 에스크로 대금이 판매자에게 전달됩니다 (미확정 시 24시간 후 자동)",
    );
    useStore.getState().setCouponsOpen(true);
    await pace(2200);
    findButton("정산 확정")?.click();
    await waitFor(() => {
      for (const a of document.querySelectorAll("a")) {
        if (a.textContent?.includes("정산됨")) return true;
      }
      return false;
    }, 180_000);
    await pace(2500);
    useStore.getState().setCouponsOpen(false);

    // 6) 영수증
    const latest = loadCoupons(my)[0];
    const explorer = giwaSepolia.blockExplorers.default.url;
    caption(
      "🧾 모든 거래는 체인에 영수증으로 남습니다 — " +
        (latest
          ? `<a href="${explorer}/tx/${latest.tx}" target="_blank" rel="noreferrer">익스플로러에서 영수증 보기 ↗</a>`
          : ""),
      "구매·에스크로·쿠폰 민팅이 하나의 트랜잭션입니다",
    );
    await pace(9000);

    // 6.5) 쿠폰 선물 (마을에 다른 방문자가 있을 때만)
    try {
      await showGiftBeat(my);
    } catch (err) {
      if (aborted) throw err;
      console.warn("[showcase] 선물 시연 생략:", err);
      useStore.getState().setCouponsOpen(false);
    }

    // 6.7) 받은 흥정 수락 (들어온 제안이 있을 때만)
    try {
      await showOfferBeat(my);
    } catch (err) {
      if (aborted) throw err;
      console.warn("[showcase] 흥정 시연 생략:", err);
      useStore.getState().setLedgerOpen(false);
    }

    // 7) 길드 + 백층 던전 (실패해도 시연은 이어간다)
    try {
      await showGuildDungeon(my);
    } catch (err) {
      if (aborted) throw err;
      console.warn("[showcase] 길드 시연 생략:", err);
      useStore.getState().setDungeonOpen(false);
      useStore.getState().setGuildOpen(false);
    }

    // 8) 소울바운드 칭호 (실패해도 시연은 이어간다)
    try {
      await showHonors(my);
    } catch (err) {
      if (aborted) throw err;
      console.warn("[showcase] 칭호 시연 생략:", err);
      useStore.getState().setHonorsOpen(false);
    }

    // 9) 문양 공방 (경제의 상류) + 모닥불 (머무름) + 도깨비 (동시성 코업)
    try {
      await showWorkshopBeat();
      await showCampfireBeat();
      await showBossBeat();
    } catch (err) {
      if (aborted) throw err;
      console.warn("[showcase] 공방·모닥불·도깨비 시연 생략:", err);
      useStore.getState().setWorkshopOpen(false);
    }

    teardown(
      "시연 끝! 이제 직접 즐겨보세요 — WASD 이동 · 노점 클릭 구매 · 아바타 클릭 선물",
    );
  } catch (err) {
    if (!aborted) {
      console.warn("[showcase] 중단:", err);
      teardown();
    }
  }
}
