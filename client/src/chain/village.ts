// 풀온체인 마을 레이어 (서버리스): 노점·길드·던전·프레즌스를 체인에서 직접
// 읽고 쓴다. 데모 모드(VITE_DEMO=1)에서 로컬 NPC 앰비언스와 함께 구동되어,
// 서버 없이도 실제 멀티플레이(비컨 데드레커닝)와 실거래가 동작한다.
import {
  decodeEventLog,
  encodePacked,
  formatEther,
  hexToBytes,
  keccak256,
  parseAbiItem,
  parseEther,
} from "viem";
import {
  publicClient,
  activeWalletClient,
  colorFromString,
} from "../wallet/wallet";
import { MARKET_ADDRESS, MARKET_ABI, MARKET_DEPLOY_BLOCK } from "../config/market";
import { GUILDS_ADDRESS, GUILDS_ABI } from "../config/guilds";
import { PRESENCE_ADDRESS, PRESENCE_ABI } from "../config/presence";
import { HONORS_ADDRESS, HONORS_ABI } from "../config/honors";
import { useStore, remoteTargets } from "../state/store";
import { upidNameOf } from "../wallet/upid";
import type { Guild, PlayerInfo, Stall } from "../types";
import type { GiftResult } from "../wallet/wallet";

interface LocalPos {
  x: number;
  z: number;
  rot: number;
  ready: boolean;
}

const POS_SCALE = 100;
const BEACON_INTERVAL_MS = 2000;
const HEARTBEAT_MS = 15000;
const READ_INTERVAL_MS = 2500;
const STALL_SYNC_MS = 12000;
const GUILD_SYNC_MS = 20000;
const PEER_STALE_MS = 60000;
const MIN_BEACON_BALANCE = 0.0003; // 이보다 적으면 관전 모드 (읽기는 무료)

const EMOTE_ICONS: Record<number, string> = { 1: "👋", 2: "🎁", 3: "🛍️" };

let started = false;

// ---------- 노점 ----------

interface ChainStallItem {
  name: string;
  emoji: string;
  price: bigint;
}
interface ChainStall {
  title: string;
  x: number;
  z: number;
  openedAt: bigint;
  open: boolean;
  items: readonly ChainStallItem[];
}

export async function syncStalls(): Promise<void> {
  const [owners, data] = (await publicClient.readContract({
    address: MARKET_ADDRESS,
    abi: MARKET_ABI,
    functionName: "openStalls",
  })) as [readonly `0x${string}`[], readonly ChainStall[]];

  const chainStalls: Stall[] = owners.map((owner, i) => {
    const d = data[i];
    const id = `oc-${owner.toLowerCase()}`;
    return {
      id,
      ownerAddress: owner,
      ownerName: `나그네-${owner.slice(2, 6)}`,
      title: d.title,
      x: d.x / POS_SCALE,
      z: d.z / POS_SCALE,
      items: d.items.map((it, j) => ({
        id: `${id}-${j}`,
        name: it.name,
        emoji: it.emoji,
        priceEth: formatEther(it.price),
      })),
      createdAt: Number(d.openedAt) * 1000,
    };
  });

  const s = useStore.getState();
  const my = s.walletAddress?.toLowerCase();
  const mineOnChain = my && chainStalls.some((st) => st.ownerAddress.toLowerCase() === my);
  s.setStalls([
    ...s.stalls.filter(
      (st) =>
        !st.id.startsWith("oc-") &&
        // 체인에 내 노점이 오르면 로컬 낙관적 사본은 제거
        !(mineOnChain && st.id === `s-${my.slice(2, 10)}`),
    ),
    ...chainStalls,
  ]);
}

export async function openStallOnChain(
  title: string,
  items: { name: string; emoji: string; priceEth: string }[],
): Promise<void> {
  const wc = activeWalletClient;
  if (!wc?.account) throw new Error("지갑이 없습니다.");
  const pos = selfPosRef;
  const tx = await wc.writeContract({
    account: wc.account,
    chain: wc.chain,
    address: MARKET_ADDRESS,
    abi: MARKET_ABI,
    functionName: "openStall",
    args: [
      title,
      Math.round((pos?.x ?? 0) * POS_SCALE),
      Math.round((pos?.z ?? 0) * POS_SCALE),
      items.map((it) => ({
        name: it.name,
        emoji: it.emoji,
        price: parseEther(it.priceEth),
      })),
    ],
  });
  await publicClient.waitForTransactionReceipt({ hash: tx });
  void syncStalls();
}

export async function closeStallOnChain(): Promise<void> {
  const wc = activeWalletClient;
  if (!wc?.account) return;
  const tx = await wc.writeContract({
    account: wc.account,
    chain: wc.chain,
    address: MARKET_ADDRESS,
    abi: MARKET_ABI,
    functionName: "closeStall",
    args: [],
  });
  await publicClient.waitForTransactionReceipt({ hash: tx });
  void syncStalls();
}

/** 온체인 노점 상품 구매 — 컨트랙트가 가격을 강제한다 */
export async function buyStallOnChain(
  seller: string,
  index: number,
  priceEth: string,
): Promise<GiftResult> {
  const wc = activeWalletClient;
  if (!wc?.account) throw new Error("지갑이 연결되어 있지 않습니다.");
  const tx = await wc.writeContract({
    account: wc.account,
    chain: wc.chain,
    address: MARKET_ADDRESS,
    abi: MARKET_ABI,
    functionName: "buyStall",
    args: [seller as `0x${string}`, index],
    value: parseEther(priceEth),
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
  let purchaseId: number | undefined;
  let tokenId: string | undefined;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== MARKET_ADDRESS.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: MARKET_ABI, data: log.data, topics: log.topics });
      if (ev.eventName === "Purchased") {
        const args = ev.args as unknown as { purchaseId: bigint; tokenId: bigint };
        purchaseId = Number(args.purchaseId);
        tokenId = args.tokenId.toString();
      }
    } catch {
      // 다른 이벤트 무시
    }
  }
  return { tx, amountEth: priceEth, purchaseId, tokenId };
}

// ---------- 길드 ----------

interface ChainGuild {
  name: string;
  emblem: string;
  founder: `0x${string}`;
  createdAt: bigint;
  members: readonly `0x${string}`[];
  d: { epoch: number; floor: number; best: number; runs: number; attempts: number };
}

export async function syncGuilds(): Promise<void> {
  const list = (await publicClient.readContract({
    address: GUILDS_ADDRESS,
    abi: GUILDS_ABI,
    functionName: "allGuilds",
  })) as readonly ChainGuild[];

  const guilds: Guild[] = list.map((g, i) => ({
    id: String(i),
    name: g.name,
    emblem: g.emblem,
    founderAddress: g.founder,
    createdAt: Number(g.createdAt) * 1000,
    members: g.members.map((a) => ({ address: a, name: `나그네-${a.slice(2, 6)}` })),
    dungeon: {
      epoch: g.d.epoch,
      floor: g.d.floor,
      best: g.d.best,
      runs: g.d.runs,
      attempts: g.d.attempts,
    },
  }));
  guilds.sort(
    (a, b) =>
      b.dungeon.floor - a.dungeon.floor ||
      b.dungeon.best - a.dungeon.best ||
      a.createdAt - b.createdAt,
  );
  useStore.getState().setGuilds(guilds);
}

const REVERT_KO: Record<string, string> = {
  member: "이미 가입한 길드가 있습니다.",
  taken: "같은 이름의 길드가 있습니다.",
  full: "길드 정원이 가득 찼습니다.",
  none: "먼저 길드에 가입하세요.",
};

function guildError(err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  const short = Object.keys(REVERT_KO).find((k) => msg.includes(`"${k}"`) || msg.includes(`reverted: ${k}`));
  useStore.getState().setGuildError(short ? REVERT_KO[short] : msg.slice(0, 120));
}

async function guildWrite(functionName: string, args: unknown[]): Promise<boolean> {
  const wc = activeWalletClient;
  if (!wc?.account) {
    useStore.getState().setGuildError("지갑이 없습니다.");
    return false;
  }
  try {
    const tx = await wc.writeContract({
      account: wc.account,
      chain: wc.chain,
      address: GUILDS_ADDRESS,
      abi: GUILDS_ABI,
      functionName,
      args,
    } as Parameters<typeof wc.writeContract>[0]);
    await publicClient.waitForTransactionReceipt({ hash: tx });
    await syncGuilds();
    return true;
  } catch (err) {
    guildError(err);
    return false;
  }
}

export function chainCreateGuild(name: string, emblem: string): void {
  void guildWrite("createGuild", [name, emblem]);
}

export function chainJoinGuild(guildId: string): void {
  void guildWrite("joinGuild", [BigInt(guildId)]);
}

export function chainLeaveGuild(): void {
  void guildWrite("leaveGuild", []);
}

// ---------- 던전 (플레이는 로컬 즉시, 정산만 온체인) ----------

const run: {
  guildId: string;
  attempt: number;
  seed: `0x${string}`;
  picks: number[];
} = { guildId: "0", attempt: 0, seed: "0x", picks: [] };

function doorRollLocal(
  seed: `0x${string}`,
  guildId: bigint,
  attempt: number,
  step: number,
  door: number,
): "safe" | "bonus" | "trap" {
  const digest = keccak256(
    encodePacked(
      ["bytes32", "uint256", "uint32", "uint256", "uint8"],
      [seed, guildId, attempt, BigInt(step), door],
    ),
  );
  const b = hexToBytes(digest)[0];
  if (b < 154) return "safe";
  if (b < 192) return "bonus";
  return "trap";
}

export async function chainDungeonEnter(): Promise<void> {
  const s = useStore.getState();
  s.setDungeon(null);
  const my = s.walletAddress?.toLowerCase();
  const guild = my
    ? s.guilds.find((g) => g.members.some((m) => m.address.toLowerCase() === my))
    : undefined;
  if (!guild) {
    s.setGuildError("던전은 길드 원정입니다 — 먼저 길드에 가입하세요.");
    return;
  }
  const wc = activeWalletClient;
  if (!wc?.account) return;
  try {
    const tx = await wc.writeContract({
      account: wc.account,
      chain: wc.chain,
      address: GUILDS_ADDRESS,
      abi: GUILDS_ABI,
      functionName: "enterExpedition",
      args: [],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
    let attempt = 0;
    for (const log of receipt.logs) {
      try {
        const ev = decodeEventLog({ abi: GUILDS_ABI, data: log.data, topics: log.topics });
        if (ev.eventName === "ExpeditionStarted") {
          attempt = Number((ev.args as unknown as { attempt: number }).attempt);
        }
      } catch {
        /* skip */
      }
    }
    const epoch = (await publicClient.readContract({
      address: GUILDS_ADDRESS,
      abi: GUILDS_ABI,
      functionName: "currentEpoch",
    })) as bigint;
    const [seed, seedBlock] = await Promise.all([
      publicClient.readContract({
        address: GUILDS_ADDRESS,
        abi: GUILDS_ABI,
        functionName: "epochSeed",
        args: [epoch],
      }) as Promise<`0x${string}`>,
      publicClient.readContract({
        address: GUILDS_ADDRESS,
        abi: GUILDS_ABI,
        functionName: "epochSeedBlock",
        args: [epoch],
      }) as Promise<bigint>,
    ]);
    run.guildId = guild.id;
    run.attempt = attempt;
    run.seed = seed;
    run.picks = [];
    useStore.getState().setDungeon({
      guildId: guild.id,
      guildName: guild.name,
      emblem: guild.emblem,
      epoch: Number(epoch),
      seedBlock: Number(seedBlock),
      seedHash: seed,
      offchain: false,
      floor: guild.dungeon.floor,
      tentative: 0,
      attempt,
      busy: false,
    });
  } catch (err) {
    guildError(err);
  }
}

export function chainDungeonPick(door: number): void {
  const s = useStore.getState();
  const d = s.dungeon;
  if (!d || d.ended) return;
  const outcome = doorRollLocal(run.seed, BigInt(run.guildId), run.attempt, run.picks.length, door);
  if (outcome === "trap") {
    run.picks = [];
    s.patchDungeon({ lastOutcome: "trap", lastDoor: door, tentative: 0, ended: true, busy: false });
    return;
  }
  run.picks.push(door);
  s.patchDungeon({
    lastOutcome: outcome,
    lastDoor: door,
    tentative: d.tentative + (outcome === "safe" ? 1 : 2),
    busy: false,
  });
}

export async function chainDungeonBank(): Promise<void> {
  const s = useStore.getState();
  if (!s.dungeon || run.picks.length === 0) return;
  s.patchDungeon({ busy: true });
  const wc = activeWalletClient;
  if (!wc?.account) return;
  try {
    const tx = await wc.writeContract({
      account: wc.account,
      chain: wc.chain,
      address: GUILDS_ADDRESS,
      abi: GUILDS_ABI,
      functionName: "settleRun",
      args: [run.attempt, run.picks],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
    let climbed = 0;
    let floor = s.dungeon.floor;
    for (const log of receipt.logs) {
      try {
        const ev = decodeEventLog({ abi: GUILDS_ABI, data: log.data, topics: log.topics });
        if (ev.eventName === "RunSettled") {
          const a = ev.args as unknown as { climbed: number; floor: number };
          climbed = a.climbed;
          floor = a.floor;
        }
      } catch {
        /* skip */
      }
    }
    run.picks = [];
    useStore.getState().patchDungeon({
      banked: climbed,
      floor,
      tentative: 0,
      ended: true,
      busy: false,
    });
    void syncGuilds();
  } catch (err) {
    useStore.getState().patchDungeon({ busy: false });
    guildError(err);
  }
}

// ---------- 판매자 장부 (내 노점 판매·분쟁·환불) ----------

export interface SellerSale {
  purchaseId: number;
  itemName: string;
  amountEth: string;
  buyer: string;
  settled: boolean;
  disputed: boolean;
  tx: string;
}

export async function fetchMySales(me: string): Promise<SellerSale[]> {
  const logs = await publicClient.getLogs({
    address: MARKET_ADDRESS,
    event: PURCHASED_EVENT,
    args: { seller: me as `0x${string}` },
    fromBlock: MARKET_DEPLOY_BLOCK,
  });
  const sales = await Promise.all(
    logs.map(async (l) => {
      const p = (await publicClient.readContract({
        address: MARKET_ADDRESS,
        abi: MARKET_ABI,
        functionName: "purchaseOf",
        args: [l.args.purchaseId!],
      })) as [string, string, bigint, bigint, boolean, boolean];
      return {
        purchaseId: Number(l.args.purchaseId),
        itemName: l.args.itemId ?? "",
        amountEth: formatEther(l.args.amount ?? 0n),
        buyer: l.args.buyer ?? "",
        settled: p[4],
        disputed: p[5],
        tx: l.transactionHash,
      };
    }),
  );
  return sales.reverse();
}

/** 판매자 환불 — 에스크로 대금을 구매자에게 돌려준다 */
export async function refundSale(purchaseId: number): Promise<void> {
  const wc = activeWalletClient;
  if (!wc?.account) throw new Error("지갑이 없습니다.");
  const tx = await wc.writeContract({
    account: wc.account,
    chain: wc.chain,
    address: MARKET_ADDRESS,
    abi: MARKET_ABI,
    functionName: "refund",
    args: [BigInt(purchaseId)],
  });
  await publicClient.waitForTransactionReceipt({ hash: tx });
}

// ---------- 칭호 (소울바운드) + 이름표 배지 코스메틱 ----------

export const HONOR_DEFS = [
  { id: 1, emoji: "🧺", name: "개점", desc: "노점을 열어본 자" },
  { id: 2, emoji: "🏯", name: "길드 창설자", desc: "길드를 세운 자" },
  { id: 3, emoji: "⛰️", name: "등반가", desc: "길드 최고 기록 10층 이상" },
  { id: 4, emoji: "🌕", name: "고층 정복자", desc: "길드 최고 기록 30층 이상" },
  { id: 5, emoji: "🥇", name: "등반왕", desc: "이번 주 1위 길드의 길드원" },
] as const;

export interface HonorProfile {
  mask: number;
  equipped: number;
  eligible: boolean[]; // HONOR_DEFS 순서
}

export async function fetchHonors(who: string): Promise<HonorProfile> {
  const [profile, ...elig] = await Promise.all([
    publicClient.readContract({
      address: HONORS_ADDRESS,
      abi: HONORS_ABI,
      functionName: "profileOf",
      args: [who as `0x${string}`],
    }) as Promise<[bigint, bigint]>,
    ...HONOR_DEFS.map(
      (d) =>
        publicClient.readContract({
          address: HONORS_ADDRESS,
          abi: HONORS_ABI,
          functionName: "eligible",
          args: [who as `0x${string}`, BigInt(d.id)],
        }) as Promise<boolean>,
    ),
  ]);
  return { mask: Number(profile[0]), equipped: Number(profile[1]), eligible: elig };
}

export async function honorWrite(functionName: "claim" | "equip", id: number): Promise<void> {
  const wc = activeWalletClient;
  if (!wc?.account) throw new Error("지갑이 없습니다.");
  const tx = await wc.writeContract({
    account: wc.account,
    chain: wc.chain,
    address: HONORS_ADDRESS,
    abi: HONORS_ABI,
    functionName,
    args: [BigInt(id)],
  });
  await publicClient.waitForTransactionReceipt({ hash: tx });
}

/** 피어 이름표 꾸미기 — 장착 칭호 배지 + UP.ID 이름 (주소별 1회 조회 캐시) */
const decorated = new Set<string>();

async function decoratePeer(addr: string): Promise<void> {
  if (decorated.has(addr)) return;
  decorated.add(addr);
  try {
    const [profile, upid] = await Promise.all([
      publicClient.readContract({
        address: HONORS_ADDRESS,
        abi: HONORS_ABI,
        functionName: "profileOf",
        args: [addr as `0x${string}`],
      }) as Promise<[bigint, bigint]>,
      upidNameOf(addr),
    ]);
    const def = HONOR_DEFS.find((d) => d.id === Number(profile[1]));
    const base = upid ?? `나그네-${addr.slice(2, 6)}`;
    const name = def ? `${def.emoji} ${base}` : base;
    const s = useStore.getState();
    const p = s.players[addr];
    if (p && p.name !== name) {
      s.setPlayers({ ...s.players, [addr]: { ...p, name } });
    }
  } catch {
    decorated.delete(addr);
  }
}

// ---------- 프레즌스 (비컨 + 데드레커닝) ----------

interface Peer {
  x: number;
  z: number;
  vx: number;
  vz: number;
  at: number;
}

const peers = new Map<string, Peer>();
let selfPosRef: LocalPos | null = null;
let beaconPending = false;
let lastSent = { x: 0, z: 0, at: 0 };
let lastBlock = 0n;
let canBeacon = false;

const BEACON_EVENT = parseAbiItem(
  "event Beacon(address indexed who, int32 x100, int32 z100, int16 vx100, int16 vz100, uint8 emote)",
);
const PURCHASED_EVENT = parseAbiItem(
  "event Purchased(address indexed buyer, address indexed seller, string itemId, uint256 amount, uint256 indexed purchaseId, uint256 tokenId)",
);

async function sendBeacon(emote = 0): Promise<void> {
  const wc = activeWalletClient;
  const pos = selfPosRef;
  if (!wc?.account || !pos || beaconPending || !canBeacon) return;
  const now = Date.now();
  const dt = Math.max(0.5, (now - lastSent.at) / 1000);
  const dx = pos.x - lastSent.x;
  const dz = pos.z - lastSent.z;
  const moved = Math.hypot(dx, dz) > 0.05;
  if (!moved && emote === 0 && now - lastSent.at < HEARTBEAT_MS) return;

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
    await wc.writeContract({
      account: wc.account,
      chain: wc.chain,
      address: PRESENCE_ADDRESS,
      abi: PRESENCE_ABI,
      functionName: "beacon",
      args,
    });
  } catch {
    // nonce 경합·RPC 지연 시 이번 비컨은 버린다 (다음 틱에 재시도)
  } finally {
    beaconPending = false;
  }
}

function applyPeers(): void {
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
  }

  if (membershipChanged) {
    const players: Record<string, PlayerInfo> = { ...s.players };
    for (const id of Object.keys(players)) {
      if (id.startsWith("0x") && !peers.has(id)) delete players[id];
    }
    for (const addr of peers.keys()) {
      if (!(addr in players)) {
        players[addr] = {
          name: `나그네-${addr.slice(2, 6)}`,
          address: addr,
          color: colorFromString(addr),
        };
        void decoratePeer(addr);
      }
    }
    s.setPlayers(players);
  }
  if (my !== undefined) {
    const npcCount = Object.keys(s.players).filter((id) => id.startsWith("npc-")).length;
    s.setOnlineCount(npcCount + peers.size + 1);
  }
}

let pollSkip = 0;

async function pollChain(): Promise<void> {
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
      peers.set(who, {
        x: Number(a.x100) / POS_SCALE,
        z: Number(a.z100) / POS_SCALE,
        vx: Number(a.vx100) / POS_SCALE,
        vz: Number(a.vz100) / POS_SCALE,
        at: Date.now(),
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

/** 충전 직후 등 잔액 변화를 즉시 반영 */
export async function refreshBeaconBudget(): Promise<void> {
  return checkBeaconBudget();
}

async function checkBeaconBudget(): Promise<void> {
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

// ---------- 기동 ----------

export function startOnchainVillage(localPos: LocalPos): void {
  if (started) return;
  started = true;
  selfPosRef = localPos;
  lastSent = { x: localPos.x, z: localPos.z, at: Date.now() };

  void syncStalls().catch(() => {});
  void syncGuilds().catch(() => {});
  void checkBeaconBudget();

  setInterval(() => void syncStalls().catch(() => {}), STALL_SYNC_MS);
  setInterval(() => void syncGuilds().catch(() => {}), GUILD_SYNC_MS);
  setInterval(() => void checkBeaconBudget(), 60000);
  setInterval(() => void sendBeacon(), BEACON_INTERVAL_MS);
  setInterval(() => void pollChain(), READ_INTERVAL_MS);
  setInterval(() => applyPeers(), 250);

  window.addEventListener("beforeunload", () => {
    // 퇴장 비컨 (best-effort)
    void sendBeacon(255);
  });
}

/** E 인사 등 이모트를 비컨에 실어 보낸다 */
export function sendEmoteOnChain(icon: string): void {
  const code = Number(Object.keys(EMOTE_ICONS).find((k) => EMOTE_ICONS[Number(k)] === icon) ?? 0);
  if (code) void sendBeacon(code);
}
