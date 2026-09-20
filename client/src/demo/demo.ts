// 데모 모드: 서버 없이 정적 호스팅(GitHub Pages)에서 마을을 체험하게 한다.
// - 프레즌스(NPC 주민)는 로컬 시뮬레이션
// - 지갑·구매·선물은 GIWA Sepolia에 실제로 전송 (진짜 온체인)
import { generatePrivateKey } from "viem/accounts";
import { useStore, remoteTargets } from "../state/store";
import { adoptLocalBurner, colorFromString } from "../wallet/wallet";
import { DEMO_STALLS } from "./demoData";
import { PERSONAS as DEMO_NPCS, randomLine } from "./personas";
import { startOnchainVillage } from "../chain/village";
import { makeWanderer, tickWander, NPC_TICK_MS } from "./wander";
import type { PlayerInfo, Stall } from "../types";

interface LocalPos {
  x: number;
  z: number;
  rot: number;
  ready: boolean;
}

const EMOTES = ["👋", "😄", "🙌"];
const STORAGE_KEY = "giwa-demo-burner";

let started = false;
let selfPos: LocalPos | null = null;

function timedEmote(id: string, icon: string, ms = 2200) {
  const s = useStore.getState();
  s.setEmote(id, icon);
  const at = useStore.getState().emotes[id]?.at;
  if (at) setTimeout(() => useStore.getState().clearEmote(id, at), ms);
}

/** 페르소나 한마디 — 읽을 시간이 있어야 하므로 이모트보다 오래 띄운다 */
function timedSay(id: string, text: string, ms = 4200) {
  const s = useStore.getState();
  s.setSay(id, text);
  const at = useStore.getState().says[id]?.at;
  if (at) setTimeout(() => useStore.getState().clearSay(id, at), ms);
}

export async function startDemo(localPos: LocalPos): Promise<void> {
  if (started) return;
  started = true;
  selfPos = localPos;
  const s = useStore.getState();

  // 이미 연결한 지갑/슬롯을 보존한다. 일반 방문자는 브라우저별 버너를 쓴다.
  if (!s.walletAddress) {
    let pk: `0x${string}` | null = null;
    try { pk = localStorage.getItem(STORAGE_KEY) as `0x${string}` | null; } catch { /* 세션 전용 */ }
    if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) {
      pk = generatePrivateKey();
      try { localStorage.setItem(STORAGE_KEY, pk); } catch { /* 세션 전용 */ }
    }
    const address = adoptLocalBurner(pk);
    s.setWallet(address, "burner", "LOCAL");
    s.setSelfIdentity(`나그네-${address.slice(2, 6)}`, colorFromString(address.toLowerCase()));
  }
  s.setSelfId("demo-self");
  s.setStatus("connected");
  localPos.x = 0;
  localPos.z = 5;
  localPos.ready = true;

  s.setStalls([...DEMO_STALLS]);

  // NPC 주민 로컬 시뮬레이션 — 걸음 규칙은 demo/wander.ts 한 곳에 있다(순수 모듈이라
  // npm test가 브라우저 없이 하루치를 돌려 본다)
  const players: Record<string, PlayerInfo> = {};
  const npcs = DEMO_NPCS.map((n, i) => {
    const id = `npc-${i}`;
    players[id] = {
      name: n.name,
      address: n.address,
      color: colorFromString(n.name),
    };
    const w = makeWanderer(n.home);
    remoteTargets.set(id, { x: w.x, z: w.z, rot: w.rot });
    return { id, w };
  });
  s.setPlayers(players);
  s.setOnlineCount(1);

  // 주기는 걸음 규칙 쪽에 있다(wander.ts) — 검사하는 쪽이 같은 자를 쓰게
  setInterval(() => {
    for (const { id, w } of npcs) {
      tickWander(w, NPC_TICK_MS / 1000);
      // 어떤 경우에도 매 틱 넘긴다 — 막혔다고 건너뛰면 그 사이 밀려난 만큼이
      // 다음 틱에 한꺼번에 반영돼 아바타가 튄다
      const t = remoteTargets.get(id);
      if (t) {
        t.x = w.x;
        t.z = w.z;
        t.rot = w.rot;
      }
    }
  }, NPC_TICK_MS);

  setInterval(() => {
    const n = npcs[Math.floor(Math.random() * npcs.length)];
    timedEmote(n.id, EMOTES[Math.floor(Math.random() * EMOTES.length)]);
  }, 9000);

  // 페르소나 한마디 — 이모트와 어긋나게 돌려 광장이 시끄러워지지 않게 한다
  setInterval(() => {
    const i = Math.floor(Math.random() * npcs.length);
    timedSay(npcs[i].id, randomLine(DEMO_NPCS[i]));
  }, 13000);

  // 풀온체인 레이어: 노점·길드·던전·프레즌스를 체인에서 직접 읽고 쓴다
  startOnchainVillage(localPos);
}

/** 선물 확정 후 로컬 피드 반영 (서버 브로드캐스트 대체) */
export function demoGift(to: string, amountEth: string, tx: string): void {
  const s = useStore.getState();
  const target = s.players[to];
  s.addFeed({
    kind: "gift",
    fromName: s.selfName || "나",
    toName: target?.name ?? "주민",
    amountEth,
    tx,
    at: Date.now(),
  });
  timedEmote(to, "🎁", 2600);
}

/** 구매 확정 후 로컬 피드 + 쿠폰함 반영 */
export function demoBuy(stallId: string, itemId: string, tx: string): void {
  const s = useStore.getState();
  const stall = s.stalls.find((x) => x.id === stallId);
  const item = stall?.items.find((i) => i.id === itemId);
  if (!stall || !item) return;
  s.addFeed({
    kind: "sale",
    fromName: s.selfName || "나",
    toName: stall.title,
    amountEth: item.priceEth,
    itemName: item.name,
    itemEmoji: item.emoji,
    tx,
    at: Date.now(),
  });
  timedEmote("demo-self", "🛍️", 2600);
  // 쿠폰 저장은 구매 당사자(StallDialog)가 에스크로 정보와 함께 직접 한다
}

/** 데모에서도 내 노점을 펼 수 있다 (로컬 전용, 새로고침 전까지) */
export function demoOpenStall(
  title: string,
  items: { name: string; emoji: string; priceEth: string }[],
): void {
  const s = useStore.getState();
  if (!s.walletAddress || !selfPos) return;
  const id = `s-${s.walletAddress.slice(2, 10).toLowerCase()}`;
  const stall: Stall = {
    id,
    ownerAddress: s.walletAddress,
    ownerName: s.selfName,
    title,
    x: selfPos.x,
    z: selfPos.z,
    items: items.map((it, i) => ({ ...it, id: `${id}-${i}` })),
    createdAt: Date.now(),
  };
  s.setStalls([...s.stalls.filter((x) => x.id !== id), stall]);
}

export function demoCloseStall(): void {
  const s = useStore.getState();
  if (!s.walletAddress) return;
  const id = `s-${s.walletAddress.slice(2, 10).toLowerCase()}`;
  s.setStalls(s.stalls.filter((x) => x.id !== id));
}
