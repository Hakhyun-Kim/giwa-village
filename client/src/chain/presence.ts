// 프레즌스: 비컨 송신 + 로그 폴링 + 데드레커닝 + 피어 이름표/코스메틱 꾸미기
import { formatEther, parseAbiItem } from "viem";
import {
  publicClient,
  activeWalletClient,
  colorFromString,
  queueTx,
} from "../wallet/wallet";
import { PRESENCE_ADDRESS, PRESENCE_ABI } from "../config/presence";
import { MARKET_ADDRESS } from "../config/market";
import { useStore, remoteTargets } from "../state/store";
import type { PlayerInfo } from "../types";
import { upidNameOf } from "../wallet/upid";
import { POS_SCALE, selfPos } from "./core";
import { HONOR_DEFS, equippedHonorOf } from "./honors";
import { equippedTrinketOf } from "./boxes";
import { wornPatternOf } from "./workshop";
import { PURCHASED_EVENT } from "./ledger";

const BEACON_INTERVAL_MS = 2000;
const HEARTBEAT_MS = 15000;
const READ_INTERVAL_MS = 2500;
const PEER_STALE_MS = 60000;
const MIN_BEACON_BALANCE = 0.0003; // 이보다 적으면 관전 모드 (읽기는 무료)

const EMOTE_ICONS: Record<number, string> = { 1: "👋", 2: "🎁", 3: "🛍️" };

interface Peer {
  x: number;
  z: number;
  vx: number;
  vz: number;
  at: number;
  sitting: boolean;
}

const peers = new Map<string, Peer>();
let beaconPending = false;
let lastSent = { x: 0, z: 0, at: 0 };
let lastBlock = 0n;
let canBeacon = false;
let pollSkip = 0;

const BEACON_EVENT = parseAbiItem(
  "event Beacon(address indexed who, int32 x100, int32 z100, int16 vx100, int16 vz100, uint8 emote)",
);

export function initPresence(): void {
  const pos = selfPos.ref;
  lastSent = { x: pos?.x ?? 0, z: pos?.z ?? 0, at: Date.now() };
}

export async function sendBeacon(emote = 0, force = false): Promise<void> {
  const wc = activeWalletClient;
  const pos = selfPos.ref;
  if (!wc?.account || !pos || beaconPending || !canBeacon) return;
  const now = Date.now();
  const dt = Math.max(0.5, (now - lastSent.at) / 1000);
  const dx = pos.x - lastSent.x;
  const dz = pos.z - lastSent.z;
  const moved = Math.hypot(dx, dz) > 0.05;
  if (!moved && emote === 0 && !force && now - lastSent.at < HEARTBEAT_MS) return;
  // 앉아 있으면 상태를 비컨에 실어 보낸다 (하트비트마다 유지)
  if (emote === 0 && useStore.getState().selfSitting) emote = 4;

  const clamp16 = (v: number) => Math.max(-32000, Math.min(32000, Math.round(v)));
  beaconPending = true;
  const args: [number, number, number, number, number] = [
    Math.round(pos.x * POS_SCALE),
    Math.round(pos.z * POS_SCALE),
    clamp16(moved ? (dx / dt) * POS_SCALE : 0),
    clamp16(moved ? (dz / dt) * POS_SCALE : 0),
    emote,
  ];
  lastSent = { x: pos.x, z: pos.z, at: now };
  try {
    // 모든 지갑 쓰기와 같은 큐 — 구매·입장 tx와의 nonce 경합을 원천 차단
    await queueTx(() =>
      wc.writeContract({
        account: wc.account!,
        chain: wc.chain,
        address: PRESENCE_ADDRESS,
        abi: PRESENCE_ABI,
        functionName: "beacon",
        args,
      }),
    );
  } catch {
    // RPC 지연·거부 시 이번 비컨은 버린다 (다음 틱에 재시도)
  } finally {
    beaconPending = false;
  }
}

/** E 인사 등 이모트를 비컨에 실어 보낸다 */
export function sendEmoteOnChain(icon: string): void {
  const code = Number(
    Object.keys(EMOTE_ICONS).find((k) => EMOTE_ICONS[Number(k)] === icon) ?? 0,
  );
  if (code) void sendBeacon(code);
}

/** 피어 이름표 꾸미기 — 장착 칭호 배지·코스메틱 + UP.ID 이름 (주소별 1회 캐시) */
const decorated = new Set<string>();

async function decoratePeer(addr: string): Promise<void> {
  if (decorated.has(addr)) return;
  decorated.add(addr);
  try {
    const [equipped, trinket, wear, upid] = await Promise.all([
      equippedHonorOf(addr),
      equippedTrinketOf(addr),
      wornPatternOf(addr),
      upidNameOf(addr),
    ]);
    const def = HONOR_DEFS.find((d) => d.id === equipped);
    const base = upid ?? `나그네-${addr.slice(2, 6)}`;
    const name = def ? `${def.emoji} ${base}` : base;
    const s = useStore.getState();
    const p = s.players[addr];
    if (
      p &&
      (p.name !== name ||
        p.honor !== equipped ||
        p.trinket !== trinket ||
        p.wear !== (wear ?? undefined))
    ) {
      s.setPlayers({
        ...s.players,
        [addr]: {
          ...p,
          name,
          honor: equipped || undefined,
          trinket: trinket || undefined,
          wear: wear ?? undefined,
        },
      });
    }
  } catch {
    decorated.delete(addr);
  }
}

export function applyPeers(): void {
  const s = useStore.getState();
  const my = s.walletAddress?.toLowerCase();
  const now = Date.now();
  let membershipChanged = false;

  for (const [addr, p] of peers) {
    if (now - p.at > PEER_STALE_MS) {
      peers.delete(addr);
      remoteTargets.delete(addr);
      s.removePlayer(addr);
      membershipChanged = true;
      continue;
    }
    // 데드레커닝: 마지막 비컨 위치 + 속도 × 경과시간 (3초까지 예측)
    const t = Math.min(3, (now - p.at) / 1000);
    const tx = p.x + p.vx * t;
    const tz = p.z + p.vz * t;
    const target = remoteTargets.get(addr);
    const rot = Math.hypot(p.vx, p.vz) > 0.2 ? Math.atan2(p.vx, p.vz) : (target?.rot ?? 0);
    if (target) {
      target.x = tx;
      target.z = tz;
      target.rot = rot;
    } else {
      remoteTargets.set(addr, { x: tx, z: tz, rot });
      membershipChanged = true;
    }
    if (!(addr in s.players)) membershipChanged = true;
    else if (!!s.players[addr].sitting !== p.sitting) membershipChanged = true;
  }

  if (membershipChanged) {
    const players: Record<string, PlayerInfo> = { ...s.players };
    for (const id of Object.keys(players)) {
      if (id.startsWith("0x") && !peers.has(id)) delete players[id];
    }
    for (const [addr, peer] of peers) {
      if (!(addr in players)) {
        players[addr] = {
          name: `나그네-${addr.slice(2, 6)}`,
          address: addr,
          color: colorFromString(addr),
          sitting: peer.sitting,
        };
        void decoratePeer(addr);
      } else {
        players[addr] = { ...players[addr], sitting: peer.sitting };
      }
    }
    s.setPlayers(players);
  }
  if (my !== undefined) {
    const npcCount = Object.keys(s.players).filter((id) => id.startsWith("npc-")).length;
    s.setOnlineCount(npcCount + peers.size + 1);
  }
}

export async function pollChain(): Promise<void> {
  // 레이트리밋 백오프 + 숨김 탭 감속 (동시 접속자 대비 읽기 부하 절감)
  if (pollSkip > 0) {
    pollSkip--;
    return;
  }
  if (document.hidden) pollSkip = 3;
  const s = useStore.getState();
  const my = s.walletAddress?.toLowerCase();
  try {
    const bn = await publicClient.getBlockNumber();
    if (lastBlock === 0n) lastBlock = bn > 60n ? bn - 60n : 0n;
    if (bn <= lastBlock) return;

    const [beacons, sales] = await Promise.all([
      publicClient.getLogs({
        address: PRESENCE_ADDRESS,
        event: BEACON_EVENT,
        fromBlock: lastBlock + 1n,
        toBlock: bn,
      }),
      publicClient.getLogs({
        address: MARKET_ADDRESS,
        event: PURCHASED_EVENT,
        fromBlock: lastBlock + 1n,
        toBlock: bn,
      }),
    ]);
    lastBlock = bn;

    for (const log of beacons) {
      const a = log.args;
      const who = a.who?.toLowerCase();
      if (!who || who === my) continue;
      if (a.emote === 255) {
        peers.delete(who);
        remoteTargets.delete(who);
        useStore.getState().removePlayer(who);
        continue;
      }
      // 악의적 비컨 좌표는 월드 반경으로 클램프
      const cl = (v: number) => Math.max(-60, Math.min(60, v / POS_SCALE));
      peers.set(who, {
        x: cl(Number(a.x100)),
        z: cl(Number(a.z100)),
        vx: Math.max(-8, Math.min(8, Number(a.vx100) / POS_SCALE)),
        vz: Math.max(-8, Math.min(8, Number(a.vz100) / POS_SCALE)),
        at: Date.now(),
        sitting: a.emote === 4,
      });
      const icon = EMOTE_ICONS[a.emote ?? 0];
      if (icon) {
        const st = useStore.getState();
        st.setEmote(who, icon);
        const at = st.emotes[who]?.at;
        if (at) setTimeout(() => useStore.getState().clearEmote(who, at), 2400);
      }
    }

    for (const log of sales) {
      const a = log.args;
      if (!a.buyer || !a.seller) continue;
      const st = useStore.getState();
      // 내 구매는 StallDialog가 이미 피드에 넣는다 — 중복(같은 tx) 방지
      if (st.feed.some((f) => f.tx === log.transactionHash)) continue;
      const stall = st.stalls.find(
        (x) => x.ownerAddress.toLowerCase() === a.seller!.toLowerCase(),
      );
      st.addFeed({
        kind: "sale",
        fromName:
          a.buyer.toLowerCase() === my
            ? st.selfName || "나"
            : `나그네-${a.buyer.slice(2, 6)}`,
        toName: stall?.title ?? `나그네-${a.seller.slice(2, 6)}`,
        amountEth: formatEther(a.amount ?? 0n),
        itemName: a.itemId,
        tx: log.transactionHash,
        at: Date.now(),
      });
    }
  } catch {
    // RPC 레이트리밋 등 — 약 20초 백오프 후 재시도
    pollSkip = 8;
  }
}

export async function checkBeaconBudget(): Promise<void> {
  const s = useStore.getState();
  if (!s.walletAddress) return;
  try {
    const bal = await publicClient.getBalance({
      address: s.walletAddress as `0x${string}`,
    });
    canBeacon = Number(formatEther(bal)) >= MIN_BEACON_BALANCE;
  } catch {
    /* keep last */
  }
}

/** 충전 직후 등 잔액 변화를 즉시 반영 */
export async function refreshBeaconBudget(): Promise<void> {
  return checkBeaconBudget();
}

export { BEACON_INTERVAL_MS, READ_INTERVAL_MS };
