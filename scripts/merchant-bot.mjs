// LLM 상인 NPC — 자기 지갑을 든 상인이 마을에 들어온 흥정을 판단한다.
//
// 핵심 불변식: **값은 LLM이 제안하고, 하한선은 코드가 강제한다.**
//   제안가 >= 정가        → 무조건 수락 (모델을 부르지 않는다)
//   제안가 <  하한선      → 무조건 거절 (모델을 부르지 않는다)
//   그 사이              → 모델이 페르소나에 따라 판단
// 모델이 무슨 대답을 하든 하한선 아래로는 체결되지 않는다. 모델 호출이
// 실패하면 결정론적 규칙으로 조용히 폴백하므로, API 키가 없어도 봇은 돈다.
//
// Usage:
//   node scripts/merchant-bot.mjs                 # 노점 상인 전원, 결정론 모드
//   node scripts/merchant-bot.mjs --npc hyangdan  # 한 명만
//   node scripts/merchant-bot.mjs --once          # 한 바퀴만 돌고 종료
//   node scripts/merchant-bot.mjs --dry-run       # 판단만 하고 tx는 보내지 않음
//
// LLM 모드는 선택 사항이다 (없으면 결정론 모드로 동작):
//   npm i @anthropic-ai/sdk   그리고   set ANTHROPIC_API_KEY=...
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatEther,
  http,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHAIN_ID = 91342;
const MARKET = "0x1f34506cda6619fc3124d68742a8fd5e7ba436e2";
const OFFERS = "0x534a29c47667b54eab6995517705cfbc423bb909";
const EXPLORER = "https://sepolia-explorer.giwa.io";

const giwaSepolia = defineChain({
  id: CHAIN_ID,
  name: "GIWA Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://sepolia-rpc.giwa.io"] } },
  testnet: true,
});

const MARKET_ABI = parseAbi([
  "struct StallItem { string name; string emoji; uint128 price; }",
  "struct Stall { string title; int32 x; int32 z; uint64 openedAt; bool open; StallItem[] items; }",
  "function stallOf(address) view returns (Stall)",
]);

const OFFERS_ABI = parseAbi([
  "struct Offer { address buyer; address seller; uint128 amount; bool active; string itemName; }",
  "function offersFor(address seller) view returns (uint256[], Offer[])",
  "function acceptOffer(uint256 id)",
]);

// ── 옵션 ───────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const ONCE = flag("once");
const DRY_RUN = flag("dry-run");
const ONLY = opt("npc", null);
const INTERVAL_MS = Math.max(5, Number(opt("interval", "20"))) * 1000;
/** 판매자당 한 번 돌 때 받아 줄 흥정 수 상한 — 폭주 방지 */
const MAX_ACCEPTS_PER_TICK = 3;
/** 같은 손님에게 연달아 응답하지 않는 최소 간격 (LLM 호출 비용·도배 방지) */
const BUYER_COOLDOWN_MS = 30_000;

const MODEL = process.env.GIWA_MERCHANT_MODEL || "claude-opus-4-8";

const publicClient = createPublicClient({
  chain: giwaSepolia,
  transport: http(process.env.GIWA_RPC_URL || undefined),
});

// ── 페르소나 · 지갑 ────────────────────────────────────────────────────────

function loadNpcs() {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "npcs.json"), "utf8"));
  const wallets = JSON.parse(fs.readFileSync(path.join(ROOT, ".botwallets.json"), "utf8"));
  return raw.npcs
    .filter((n) => n.class === "merchant")
    .filter((n) => !ONLY || n.id === ONLY)
    .map((n) => {
      const w = wallets[n.walletIndex];
      if (!w?.privateKey) throw new Error(`${n.name}: .botwallets.json[${n.walletIndex}] 없음`);
      if (w.address.toLowerCase() !== n.address.toLowerCase()) {
        throw new Error(
          `${n.name}: 주소 불일치 — npcs.json ${n.address} vs botwallets ${w.address}. ` +
            "지갑을 재생성했다면 data/npcs.json의 address를 맞춰 주세요.",
        );
      }
      return { ...n, template: raw.templates[n.class], account: privateKeyToAccount(w.privateKey) };
    });
}

// ── LLM (선택) ─────────────────────────────────────────────────────────────

let anthropic = null;
let llmDisabledReason = null;

async function initLlm() {
  if (!process.env.ANTHROPIC_API_KEY) {
    llmDisabledReason = "ANTHROPIC_API_KEY 없음";
    return;
  }
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    anthropic = new Anthropic();
  } catch {
    llmDisabledReason = "@anthropic-ai/sdk 미설치 (npm i @anthropic-ai/sdk)";
  }
}

const DECISION_SCHEMA = {
  type: "object",
  properties: {
    accept: { type: "boolean", description: "제안을 받아들일지 여부" },
    line: { type: "string", description: "손님에게 건네는 한마디 (40자 이내, 한국어)" },
  },
  required: ["accept", "line"],
  additionalProperties: false,
};

/**
 * 밴드 안에 들어온 제안을 페르소나로 판단한다.
 * 모델은 "받는다/튕긴다"만 고르고, 얼마에 받을지는 정하지 않는다 —
 * 체결가는 이미 손님이 에스크로에 넣은 금액으로 고정돼 있다.
 */
async function askLlm(npc, ctx) {
  if (!anthropic) return null;
  const system = [...npc.template.rules, `너의 배역: ${npc.name}. ${npc.persona}`].join("\n");
  const user = [
    `노점: ${npc.stall}`,
    `품목: ${ctx.itemName}`,
    `정가: ${ctx.listEth} ETH`,
    `손님이 부른 값: ${ctx.offerEth} ETH (정가의 ${Math.round(ctx.ratio * 100)}%)`,
    `내가 받을 수 있는 최저가: ${ctx.floorEth} ETH`,
    "",
    "이 값에 팔지 말지 정하고, 손님에게 건넬 한마디를 붙여라.",
  ].join("\n");

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system,
    messages: [{ role: "user", content: user }],
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: DECISION_SCHEMA },
    },
  });
  const text = res.content.find((b) => b.type === "text")?.text;
  if (!text) return null;
  const parsed = JSON.parse(text);
  return { accept: !!parsed.accept, line: String(parsed.line ?? "").slice(0, 60) };
}

/** 모델이 없거나 실패했을 때의 규칙: 하한선 위 절반을 넘으면 받는다. */
function decideDeterministic(npc, ctx) {
  const midpoint = npc.floorRatio + (1 - npc.floorRatio) / 2;
  const accept = ctx.ratio >= midpoint;
  return {
    accept,
    line: accept ? "그 값이면 가져가시오." : "그건 좀 과하오, 조금만 더 얹으시오.",
  };
}

// ── 체인 ───────────────────────────────────────────────────────────────────

async function listPriceOf(seller, itemName) {
  const stall = await publicClient.readContract({
    address: MARKET,
    abi: MARKET_ABI,
    functionName: "stallOf",
    args: [seller],
  });
  if (!stall.open) return null;
  const item = stall.items.find((it) => it.name === itemName);
  return item ? item.price : null;
}

async function acceptOffer(npc, id) {
  const wallet = createWalletClient({
    account: npc.account,
    chain: giwaSepolia,
    transport: http(process.env.GIWA_RPC_URL || undefined),
  });
  const hash = await wallet.writeContract({
    address: OFFERS,
    abi: OFFERS_ABI,
    functionName: "acceptOffer",
    args: [BigInt(id)],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return { hash, status: receipt.status };
}

// ── 한 상인의 한 바퀴 ──────────────────────────────────────────────────────

const lastSeenBuyer = new Map(); // `${npcId}:${buyer}` → timestamp

async function tick(npc) {
  const [ids, list] = await publicClient.readContract({
    address: OFFERS,
    abi: OFFERS_ABI,
    functionName: "offersFor",
    args: [npc.address],
  });
  if (ids.length === 0) return;

  let accepted = 0;
  for (let i = 0; i < ids.length; i++) {
    if (accepted >= MAX_ACCEPTS_PER_TICK) {
      console.log(`  [${npc.name}] 이번 바퀴 수락 상한(${MAX_ACCEPTS_PER_TICK}) 도달 — 나머지는 다음에`);
      break;
    }
    const offer = list[i];
    const id = Number(ids[i]);
    const key = `${npc.id}:${offer.buyer.toLowerCase()}`;
    const last = lastSeenBuyer.get(key) ?? 0;
    if (Date.now() - last < BUYER_COOLDOWN_MS) continue;

    const listPrice = await listPriceOf(npc.address, offer.itemName);
    if (listPrice === null) {
      console.log(`  [${npc.name}] #${id} "${offer.itemName}" — 노점에 없는 품목, 넘어감`);
      continue;
    }

    const floor = (listPrice * BigInt(Math.round(npc.floorRatio * 1000))) / 1000n;
    const ratio = Number(offer.amount) / Number(listPrice);
    const ctx = {
      itemName: offer.itemName,
      listEth: formatEther(listPrice),
      offerEth: formatEther(offer.amount),
      floorEth: formatEther(floor),
      ratio,
    };

    // ── 코드가 강제하는 구간: 모델을 부르지 않는다 ──
    let decision;
    let source;
    if (offer.amount >= listPrice) {
      decision = { accept: true, line: "고맙소, 바로 드리리다." };
      source = "정가 이상";
    } else if (offer.amount < floor) {
      decision = { accept: false, line: "그 값엔 못 파오." };
      source = "하한선 미만";
    } else {
      // ── 밴드 안: 모델이 판단 (실패하면 결정론 폴백) ──
      try {
        decision = await askLlm(npc, ctx);
        source = decision ? "LLM" : "결정론";
      } catch (err) {
        console.warn(`  [${npc.name}] LLM 실패 — 결정론으로 폴백: ${err.message}`);
        decision = null;
        source = "결정론(폴백)";
      }
      if (!decision) decision = decideDeterministic(npc, ctx);
    }

    lastSeenBuyer.set(key, Date.now());
    const verdict = decision.accept ? "수락" : "거절";
    console.log(
      `  [${npc.name}] #${id} ${ctx.itemName} ${ctx.offerEth}/${ctx.listEth} ETH ` +
        `(${Math.round(ratio * 100)}%, 하한 ${Math.round(npc.floorRatio * 100)}%) → ${verdict} [${source}] "${decision.line}"`,
    );

    if (!decision.accept) continue;

    // 마지막 방어선: 어떤 경로로 왔든 하한선 아래면 절대 체결하지 않는다.
    if (offer.amount < floor) {
      console.error(`  [${npc.name}] #${id} 하한선 위반 수락 시도 차단 — 버그입니다`);
      continue;
    }
    if (DRY_RUN) {
      console.log(`  [${npc.name}] --dry-run: tx 생략`);
      continue;
    }
    try {
      const { hash, status } = await acceptOffer(npc, id);
      console.log(`  [${npc.name}] 체결 ${status} — ${EXPLORER}/tx/${hash}`);
      accepted++;
    } catch (err) {
      console.error(`  [${npc.name}] #${id} 체결 실패: ${err.shortMessage ?? err.message}`);
    }
  }
}

// ── 기동 ───────────────────────────────────────────────────────────────────

async function main() {
  const chainId = await publicClient.getChainId();
  if (chainId !== CHAIN_ID) {
    throw new Error(`GIWA Sepolia(${CHAIN_ID})가 아닙니다: ${chainId}. 테스트넷 전용입니다.`);
  }

  await initLlm();
  const npcs = loadNpcs();
  if (npcs.length === 0) throw new Error(`상인을 찾지 못했습니다${ONLY ? ` (--npc ${ONLY})` : ""}.`);

  console.log(`기와장터 상인 봇 — ${npcs.map((n) => n.name).join(", ")}`);
  console.log(
    anthropic
      ? `흥정 판단: LLM (${MODEL}) · 하한선은 코드가 강제`
      : `흥정 판단: 결정론 (${llmDisabledReason})`,
  );
  console.log(`폴 간격 ${INTERVAL_MS / 1000}s${DRY_RUN ? " · dry-run" : ""}\n`);

  const round = async () => {
    for (const npc of npcs) {
      try {
        await tick(npc);
      } catch (err) {
        console.error(`  [${npc.name}] 폴 실패: ${err.shortMessage ?? err.message}`);
      }
    }
  };

  await round();
  if (ONCE) return;
  setInterval(() => void round(), INTERVAL_MS);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
