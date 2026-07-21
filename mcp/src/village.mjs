// 체인 레이어 — MCP 도구가 쓰는 읽기/쓰기 래퍼.
// 클라이언트의 client/src/chain/* 와 같은 컨트랙트를 같은 규약으로 소비한다.
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatEther,
  http,
  parseAbi,
  parseAbiItem,
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const CHAIN_ID = 91342;
/** 좌표는 int32에 100배로 담긴다 (client/src/chain/core.ts POS_SCALE) */
const POS_SCALE = 100;
/** 마을 반경 — 이 밖에는 노점을 펼 수 없다 (client/src/game/Village.tsx WORLD_RADIUS) */
export const WORLD_RADIUS = 55;

export const giwaSepolia = defineChain({
  id: CHAIN_ID,
  name: "GIWA Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://sepolia-rpc.giwa.io"] } },
  blockExplorers: {
    default: { name: "GIWA Explorer", url: "https://sepolia-explorer.giwa.io" },
  },
  testnet: true,
});

export const ADDRESSES = {
  market: "0x1f34506cda6619fc3124d68742a8fd5e7ba436e2",
  guilds: "0x65e4de091071d2f0d47b24f1ada5c2c7ba2c7638",
  presence: "0x4d600672cefae3c8462f3d9feb2cb739001e7a93",
  offers: "0x534a29c47667b54eab6995517705cfbc423bb909",
  hearth: "0xf780265d5f49abd8c7e5d18d81d33426f62f3365",
  boss: "0x8f50d882fc936f481f5f66d76156ebdf816cc6ae",
  profile: "0xefe0e8d69661fd67f5fe2368f9b1f7ff6d395416",
};

export const EXPLORER = "https://sepolia-explorer.giwa.io";

const MARKET_ABI = parseAbi([
  "struct StallItem { string name; string emoji; uint128 price; }",
  "struct Stall { string title; int32 x; int32 z; uint64 openedAt; bool open; StallItem[] items; }",
  "function openStalls() view returns (address[], Stall[])",
  "function stallOf(address) view returns (Stall)",
  "function openStall(string title, int32 x, int32 z, StallItem[] items)",
  "function closeStall()",
  "function buyStall(address seller, uint8 index) payable returns (uint256)",
  "function confirm(uint256 purchaseId)",
]);

const OFFERS_ABI = parseAbi([
  "struct Offer { address buyer; address seller; uint128 amount; bool active; string itemName; }",
  "function offersFor(address seller) view returns (uint256[], Offer[])",
  "function offerAt(uint256 id) view returns (Offer)",
  "function makeOffer(address seller, string itemName) payable returns (uint256)",
  "function acceptOffer(uint256 id)",
  "function cancelOffer(uint256 id)",
]);

const PROFILE_ABI = parseAbi([
  "struct Profile { uint256 guildIdPlus1; string guildName; string guildEmblem; uint256 honorMask; uint256 honorEquipped; uint256 trinketMask; uint8 trinketEquipped; bool wearing; bytes16 wearPixels; uint16 wearPalette; uint32 warmth; uint32 trophies; }",
  "function profileOf(address) view returns (Profile)",
]);

const GUILDS_ABI = parseAbi([
  "struct DungeonState { uint32 epoch; uint16 floor; uint16 best; uint32 runs; uint32 attempts; }",
  "struct Guild { string name; string emblem; address founder; uint64 createdAt; address[] members; DungeonState d; }",
  "function allGuilds() view returns (Guild[])",
]);

const BOSS_ABI = parseAbi([
  "function statusOf(address who) view returns (uint256 w, uint128 remaining, bool slain, uint128 myContrib, uint64 nextStrikeAt, bool prevClaimable, uint32 trophies)",
  "function strike()",
]);

const HEARTH_ABI = parseAbi([
  "function statusOf(address who) view returns (uint256 w, bool joinedNow, uint16 cnt, bool prevClaimable, uint32 warmth)",
]);

const BEACON_EVENT = parseAbiItem(
  "event Beacon(address indexed who, int32 x100, int32 z100, int16 vx100, int16 vz100, uint8 emote)",
);

export const HONOR_NAMES = ["", "개점", "길드 창설자", "등반가", "고층 정복자", "등반왕"];
export const TRINKET_NAMES = ["", "깃털", "조개", "도토리", "네잎클로버", "나비", "풍경", "꽃잎", "별조각"];
export const BOSS_MAX_HP = 2000;

export const publicClient = createPublicClient({
  chain: giwaSepolia,
  transport: http(process.env.GIWA_RPC_URL || undefined),
});

// ── 지갑 (선택) ────────────────────────────────────────────────────────────
// 키가 없으면 읽기 전용으로 뜬다. 키가 있으면 그 지갑이 곧 이 에이전트의
// 신원 — 사람이 쓰는 지갑과 컨트랙트 입장에서 아무 차이가 없다.

const rawKey = (process.env.GIWA_PRIVATE_KEY || "").trim();
if (rawKey && !/^0x[0-9a-fA-F]{64}$/.test(rawKey)) {
  throw new Error("GIWA_PRIVATE_KEY 형식이 올바르지 않습니다 (0x + 64 hex).");
}

export const account = rawKey ? privateKeyToAccount(rawKey) : null;
export const walletClient = account
  ? createWalletClient({ account, chain: giwaSepolia, transport: http(process.env.GIWA_RPC_URL || undefined) })
  : null;

/** tx 1건당 상한. LLM이 자릿수를 틀려도 지갑이 비지 않게 한다. */
export const MAX_SPEND_ETH = Number(process.env.GIWA_MAX_SPEND_ETH || "0.005");
/** 이 프로세스가 사는 동안 쓸 수 있는 총액. */
export const SESSION_BUDGET_ETH = Number(process.env.GIWA_SESSION_BUDGET_ETH || "0.05");

let spentWei = 0n;

export function requireWallet() {
  if (!walletClient || !account) {
    throw new Error(
      "이 도구는 지갑이 필요합니다. GIWA_PRIVATE_KEY 환경변수에 GIWA Sepolia " +
        "테스트넷 전용 키를 넣고 다시 실행하세요. (읽기 도구는 키 없이 동작합니다.)",
    );
  }
  return { walletClient, account };
}

/** 지출 상한 검사 — 통과하면 wei를 예약(가산)한다. */
export function budgetCheck(amountEth) {
  const v = Number(amountEth);
  if (!Number.isFinite(v) || v <= 0) throw new Error("금액이 올바르지 않습니다.");
  if (v > MAX_SPEND_ETH) {
    throw new Error(
      `1회 지출 상한(${MAX_SPEND_ETH} ETH)을 넘습니다: ${v} ETH. ` +
        "상한을 올리려면 GIWA_MAX_SPEND_ETH 환경변수를 바꾸세요.",
    );
  }
  const wei = parseEther(String(v));
  const budget = parseEther(String(SESSION_BUDGET_ETH));
  if (spentWei + wei > budget) {
    throw new Error(
      `세션 예산(${SESSION_BUDGET_ETH} ETH)을 초과합니다. ` +
        `지금까지 ${formatEther(spentWei)} ETH 사용.`,
    );
  }
  spentWei += wei;
  return wei;
}

export function spentSoFarEth() {
  return formatEther(spentWei);
}

// 같은 지갑의 tx가 겹치면 nonce가 충돌한다 — 클라이언트 wallet.ts queueTx와 같은 이유로 직렬화.
let chain = Promise.resolve();
export function queueTx(fn) {
  const next = chain.then(fn, fn);
  chain = next.then(
    () => {},
    () => {},
  );
  return next;
}

async function assertChain() {
  const id = await publicClient.getChainId();
  if (id !== CHAIN_ID) {
    throw new Error(`연결된 체인이 GIWA Sepolia(${CHAIN_ID})가 아닙니다: ${id}. 메인넷 사용 금지.`);
  }
}

async function send(fn) {
  await assertChain();
  const hash = await queueTx(fn);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return { hash, status: receipt.status, url: `${EXPLORER}/tx/${hash}` };
}

// ── 읽기 ───────────────────────────────────────────────────────────────────

export async function getStalls() {
  const [owners, data] = await publicClient.readContract({
    address: ADDRESSES.market,
    abi: MARKET_ABI,
    functionName: "openStalls",
  });
  return owners.map((owner, i) => ({
    owner,
    title: data[i].title,
    x: data[i].x / POS_SCALE,
    z: data[i].z / POS_SCALE,
    openedAt: Number(data[i].openedAt),
    items: data[i].items.map((it, index) => ({
      index,
      name: it.name,
      emoji: it.emoji,
      priceEth: formatEther(it.price),
    })),
  }));
}

export async function getProfile(address) {
  const p = await publicClient.readContract({
    address: ADDRESSES.profile,
    abi: PROFILE_ABI,
    functionName: "profileOf",
    args: [address],
  });
  const mask = (m, names) =>
    names.filter((n, i) => i > 0 && (Number(m) & (1 << i)) !== 0 && n);
  return {
    address,
    guild: p.guildIdPlus1 > 0n ? { name: p.guildName, emblem: p.guildEmblem } : null,
    honors: mask(p.honorMask, HONOR_NAMES),
    equippedHonor: HONOR_NAMES[Number(p.honorEquipped)] || null,
    trinkets: mask(p.trinketMask, TRINKET_NAMES),
    equippedTrinket: TRINKET_NAMES[p.trinketEquipped] || null,
    wearingEmblem: p.wearing,
    warmth: p.warmth,
    trophies: p.trophies,
  };
}

export async function getGuilds() {
  const list = await publicClient.readContract({
    address: ADDRESSES.guilds,
    abi: GUILDS_ABI,
    functionName: "allGuilds",
  });
  return [...list]
    .map((g, id) => ({
      id,
      name: g.name,
      emblem: g.emblem,
      memberCount: g.members.length,
      weeklyFloor: g.d.floor,
      bestFloor: g.d.best,
      runs: g.d.runs,
    }))
    .sort((a, b) => b.weeklyFloor - a.weeklyFloor || b.bestFloor - a.bestFloor);
}

export async function getOffersFor(seller) {
  const [ids, list] = await publicClient.readContract({
    address: ADDRESSES.offers,
    abi: OFFERS_ABI,
    functionName: "offersFor",
    args: [seller],
  });
  return ids.map((id, i) => ({
    id: Number(id),
    buyer: list[i].buyer,
    itemName: list[i].itemName,
    amountEth: formatEther(list[i].amount),
  }));
}

export async function getBoss(who) {
  const [w, remaining, slain, myContrib, nextStrikeAt, prevClaimable, trophies] =
    await publicClient.readContract({
      address: ADDRESSES.boss,
      abi: BOSS_ABI,
      functionName: "statusOf",
      args: [who],
    });
  return {
    week: Number(w),
    maxHp: BOSS_MAX_HP,
    remaining: Number(remaining),
    slain,
    myContrib: Number(myContrib),
    nextStrikeAt: Number(nextStrikeAt),
    secondsUntilStrike: Math.max(0, Number(nextStrikeAt) - Math.floor(Date.now() / 1000)),
    prevClaimable,
    trophies,
  };
}

export async function getHearth(who) {
  const [w, joinedNow, cnt, prevClaimable, warmth] = await publicClient.readContract({
    address: ADDRESSES.hearth,
    abi: HEARTH_ABI,
    functionName: "statusOf",
    args: [who],
  });
  return {
    window: Number(w),
    joinedNow,
    peopleAtFire: cnt,
    prevClaimable,
    warmth,
  };
}

/** 최근 블록의 프레즌스 비컨 — 지금 마을에서 누가 움직이는가 */
export async function getPresence(lookbackBlocks = 60) {
  const bn = await publicClient.getBlockNumber();
  const from = bn > BigInt(lookbackBlocks) ? bn - BigInt(lookbackBlocks) : 0n;
  const logs = await publicClient.getLogs({
    address: ADDRESSES.presence,
    event: BEACON_EVENT,
    fromBlock: from,
    toBlock: bn,
  });
  const latest = new Map();
  for (const l of logs) {
    if (!l.args.who) continue;
    latest.set(l.args.who.toLowerCase(), {
      who: l.args.who,
      x: Number(l.args.x100) / POS_SCALE,
      z: Number(l.args.z100) / POS_SCALE,
      emote: l.args.emote ?? 0,
      leaving: l.args.emote === 255,
      block: Number(l.blockNumber),
    });
  }
  return [...latest.values()].filter((b) => !b.leaving);
}

/** 장날 = 매주 토 21:00~22:00 KST (client/src/chain/hearth.ts와 동일 규칙) */
export function isMarketDay(now = Date.now()) {
  const kst = new Date(now + 9 * 3600 * 1000);
  return kst.getUTCDay() === 6 && kst.getUTCHours() === 21;
}

export async function getBalanceEth(address) {
  return formatEther(await publicClient.getBalance({ address }));
}

// ── 쓰기 (지갑 필요) ────────────────────────────────────────────────────────

export async function openStall(title, x, z, items) {
  const { walletClient: wc, account: acct } = requireWallet();
  if (Math.hypot(x, z) > WORLD_RADIUS) {
    throw new Error(`마을 밖입니다 (반경 ${WORLD_RADIUS} 이내여야 합니다): x=${x}, z=${z}`);
  }
  if (!items.length) throw new Error("품목이 하나는 있어야 합니다.");
  for (const it of items) {
    const p = Number(it.priceEth);
    if (!Number.isFinite(p) || p <= 0) throw new Error(`가격이 올바르지 않습니다: ${it.name}`);
    if (p > MAX_SPEND_ETH) {
      throw new Error(
        `품목 가격이 1회 상한(${MAX_SPEND_ETH} ETH)을 넘습니다: ${it.name} ${p} ETH. ` +
          "노점 가격은 사는 사람이 내는 돈이라 실수하면 마을 시세가 망가집니다.",
      );
    }
  }
  return send(() =>
    wc.writeContract({
      account: acct,
      chain: giwaSepolia,
      address: ADDRESSES.market,
      abi: MARKET_ABI,
      functionName: "openStall",
      args: [
        title,
        Math.round(x * POS_SCALE),
        Math.round(z * POS_SCALE),
        items.map((it) => ({
          name: it.name,
          emoji: it.emoji || "🧺",
          price: parseEther(String(it.priceEth)),
        })),
      ],
    }),
  );
}

export async function closeStall() {
  const { walletClient: wc, account: acct } = requireWallet();
  return send(() =>
    wc.writeContract({
      account: acct,
      chain: giwaSepolia,
      address: ADDRESSES.market,
      abi: MARKET_ABI,
      functionName: "closeStall",
    }),
  );
}

export async function buyStall(seller, index) {
  const { walletClient: wc, account: acct } = requireWallet();
  // 가격은 컨트랙트가 강제하지만, 얼마를 내게 되는지 먼저 읽어 예산을 검사한다.
  const stall = await publicClient.readContract({
    address: ADDRESSES.market,
    abi: MARKET_ABI,
    functionName: "stallOf",
    args: [seller],
  });
  if (!stall.open) throw new Error("닫힌 노점입니다.");
  const item = stall.items[index];
  if (!item) throw new Error(`품목 index ${index}가 없습니다 (0~${stall.items.length - 1}).`);
  const value = budgetCheck(formatEther(item.price));
  return send(() =>
    wc.writeContract({
      account: acct,
      chain: giwaSepolia,
      address: ADDRESSES.market,
      abi: MARKET_ABI,
      functionName: "buyStall",
      args: [seller, index],
      value,
    }),
  );
}

export async function makeOffer(seller, itemName, amountEth) {
  const { walletClient: wc, account: acct } = requireWallet();
  const value = budgetCheck(amountEth);
  return send(() =>
    wc.writeContract({
      account: acct,
      chain: giwaSepolia,
      address: ADDRESSES.offers,
      abi: OFFERS_ABI,
      functionName: "makeOffer",
      args: [seller, itemName],
      value,
    }),
  );
}

export async function acceptOffer(id) {
  const { walletClient: wc, account: acct } = requireWallet();
  const offer = await publicClient.readContract({
    address: ADDRESSES.offers,
    abi: OFFERS_ABI,
    functionName: "offerAt",
    args: [BigInt(id)],
  });
  if (!offer.active) throw new Error(`흥정 #${id}는 이미 처리됐습니다.`);
  if (offer.seller.toLowerCase() !== acct.address.toLowerCase()) {
    throw new Error(`흥정 #${id}의 판매자는 내가 아닙니다 (${offer.seller}).`);
  }
  return send(() =>
    wc.writeContract({
      account: acct,
      chain: giwaSepolia,
      address: ADDRESSES.offers,
      abi: OFFERS_ABI,
      functionName: "acceptOffer",
      args: [BigInt(id)],
    }),
  );
}

export async function cancelOffer(id) {
  const { walletClient: wc, account: acct } = requireWallet();
  return send(() =>
    wc.writeContract({
      account: acct,
      chain: giwaSepolia,
      address: ADDRESSES.offers,
      abi: OFFERS_ABI,
      functionName: "cancelOffer",
      args: [BigInt(id)],
    }),
  );
}

export async function strikeBoss() {
  const { walletClient: wc, account: acct } = requireWallet();
  const status = await getBoss(acct.address);
  if (status.slain) throw new Error("이번 주 도깨비는 이미 토벌됐습니다.");
  if (status.secondsUntilStrike > 0) {
    throw new Error(`타격 쿨다운 ${status.secondsUntilStrike}초 남았습니다. (사람과 같은 규칙)`);
  }
  return send(() =>
    wc.writeContract({
      account: acct,
      chain: giwaSepolia,
      address: ADDRESSES.boss,
      abi: BOSS_ABI,
      functionName: "strike",
    }),
  );
}
