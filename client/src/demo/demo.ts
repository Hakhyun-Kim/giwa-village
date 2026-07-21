// 데모 모드: 서버 없이 정적 호스팅(GitHub Pages)에서 마을을 체험하게 한다.
// - 프레즌스(NPC 주민)는 로컬 시뮬레이션
// - 지갑·구매·선물은 GIWA Sepolia에 실제로 전송 (진짜 온체인)
import { generatePrivateKey } from "viem/accounts";
import { useStore, remoteTargets } from "../state/store";
import { FAUCET_URL } from "../config/giwa";
import { adoptLocalBurner, colorFromString } from "../wallet/wallet";
import { DEMO_STALLS, DEMO_NPCS } from "./demoData";
import { randomLine } from "./personas";
import { startOnchainVillage } from "../chain/village";
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

  // 버너 지갑. 로컬 개발에서는 dev 서버가 파일(.demo-burner.json)로 보관하는
  // 키 하나를 모든 브라우저가 공유한다 — 브라우저마다 새 지갑을 만들면
  // 포셋(주소·IP당 24h 제한)을 지갑 수만큼 받아야 하기 때문. 공개 데모
  // (프로덕션 빌드)는 기존대로 방문자 전용 키를 localStorage에 만든다.
  let pk: `0x${string}` | null = null;
  let freshBurner = false;
  if (import.meta.env.DEV) {
    try {
      const res = await fetch("/__demo-burner");
      const j = res.ok ? await res.json() : null;
      if (j && /^0x[0-9a-fA-F]{64}$/.test(j.privateKey)) {
        pk = j.privateKey as `0x${string}`;
        freshBurner = !!j.created;
      }
    } catch {
      // dev 서버 엔드포인트가 없으면 브라우저 로컬 키로 폴백
    }
  }
  if (!pk) {
    pk = localStorage.getItem(STORAGE_KEY) as `0x${string}` | null;
    if (pk && !/^0x[0-9a-fA-F]{64}$/.test(pk)) pk = null;
    freshBurner = !pk;
    if (!pk) {
      pk = generatePrivateKey();
      localStorage.setItem(STORAGE_KEY, pk);
    }
  }
  const address = adoptLocalBurner(pk);
  s.setWallet(address, "burner", "DEMO");
  // 갓 만든 버너는 잔액 0이므로 로컬 개발에서는 포셋 페이지를 자동으로
  // 열어 준다. window.open은 페이지 로드 중 팝업 차단에 걸리므로 dev 서버가
  // 대신 연다(vite.config.ts의 __open-faucet — 클립보드 복사 포함). 포셋은
  // reCAPTCHA+PoW 방식이라 요청 자체는 사람이 마쳐야 한다. 공개 데모는
  // HUD의 포셋 링크만 유지.
  if (freshBurner && import.meta.env.DEV) {
    void fetch(`/__open-faucet?address=${address}`).catch(() => {});
    void navigator.clipboard?.writeText(address).catch(() => {});
    console.info(`[faucet] 새 버너 ${address} — 테스트 ETH: ${FAUCET_URL}`);
  }
  s.setSelfIdentity(`나그네-${address.slice(2, 6)}`, colorFromString(address.toLowerCase()));
  s.setSelfId("demo-self");
  s.setStatus("connected");
  localPos.x = 0;
  localPos.z = 5;
  localPos.ready = true;

  s.setStalls([...DEMO_STALLS]);

  // NPC 주민 로컬 시뮬레이션
  const players: Record<string, PlayerInfo> = {};
  const npcs = DEMO_NPCS.map((n, i) => {
    const id = `npc-${i}`;
    players[id] = {
      name: n.name,
      address: n.address,
      color: colorFromString(n.name),
    };
    remoteTargets.set(id, { x: n.home[0], z: n.home[1], rot: 0 });
    return {
      id,
      x: n.home[0],
      z: n.home[1],
      home: n.home,
      tx: n.home[0],
      tz: n.home[1],
      wait: Math.random() * 4,
    };
  });
  s.setPlayers(players);
  s.setOnlineCount(DEMO_NPCS.length + 1);

  setInterval(() => {
    for (const n of npcs) {
      if (n.wait > 0) {
        n.wait -= 0.1;
        continue;
      }
      const dx = n.tx - n.x;
      const dz = n.tz - n.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.3) {
        n.wait = 2 + Math.random() * 8;
        n.tx = n.home[0] + (Math.random() * 8 - 4);
        n.tz = n.home[1] + (Math.random() * 8 - 4);
        continue;
      }
      const step = Math.min(dist, 0.28);
      n.x += (dx / dist) * step;
      n.z += (dz / dist) * step;
      const t = remoteTargets.get(n.id);
      if (t) {
        t.x = n.x;
        t.z = n.z;
        t.rot = Math.atan2(dx, dz);
      }
    }
  }, 100);

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
