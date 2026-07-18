// 자동 시연(쇼케이스) 모드 — ?showcase=1
// 키 조작 없이 입장→산책→노점 개설→구매(온체인)→쿠폰 정산→영수증까지
// 자막과 함께 자동 진행한다. 테스터가 설명 없이 보기만 해도 전체 플로우를
// 이해하도록 하는 것이 목적. 로컬 풀스택(서버+dev 지갑) 전용.
import { useStore } from "../state/store";
import { getBalanceEth } from "../wallet/wallet";
import { loadCoupons } from "../state/coupons";
import { giwaSepolia, FAUCET_URL, DEMO } from "../config/giwa";
import { createGuild, dungeonBank, dungeonPick } from "../net/colyseus";

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
    findButton("홍등")?.click();
    await pace(900);
    findButton("노점 개설")?.click();
    caption(
      "노점 개설 — 상품 가격은 <b>GiwaMarketV2 컨트랙트에 온체인 리스팅</b>됩니다",
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

    // 7) 길드 + 백층 던전 (실패해도 시연은 이어간다)
    try {
      await showGuildDungeon(my);
    } catch (err) {
      if (aborted) throw err;
      console.warn("[showcase] 길드 시연 생략:", err);
      useStore.getState().setDungeonOpen(false);
      useStore.getState().setGuildOpen(false);
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
