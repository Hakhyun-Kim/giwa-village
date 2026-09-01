// GIWA Sepolia의 현행 GiwaGuilds v2를 실제 입장→귀환 한 번으로 확인한다.
// 로직/마이그레이션은 test:local에서 무가스로 먼저 검증하고, 이 스크립트는
// 배포 주소·ABI·영수증 이벤트가 실체인에서도 이어지는지만 최소 가스로 본다.
// Usage: npm run guild-smoke -- --yes
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  defineChain,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { resolveRun, safeDoorAt } from "../core/src/index.ts";
import { GUILDS_ADDRESS, GUILDS_ABI } from "../client/src/config/guilds.ts";

if (!process.argv.includes("--yes")) {
  console.log("GIWA Sepolia에서 원정 입장·귀환 2건을 전송합니다 (테스트 ETH 가스 사용).\n");
  console.log("실행: npm run guild-smoke -- --yes");
  process.exit(0);
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RPC = process.env.GIWA_RPC_URL || "https://sepolia-rpc.giwa.io";
const chain = defineChain({
  id: 91342,
  name: "GIWA Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
  testnet: true,
});
const wallets = JSON.parse(fs.readFileSync(path.join(ROOT, ".testwallets.json"), "utf8"));
const slotA = wallets.find((wallet) => wallet.slot === "A");
if (!slotA) throw new Error("테스트 지갑 슬롯 A가 없습니다");
const account = privateKeyToAccount(slotA.privateKey);
const pub = createPublicClient({ chain, transport: http(RPC) });
const wallet = createWalletClient({ account, chain, transport: http(RPC) });
const explorer = "https://sepolia-explorer.giwa.io";

const chainId = await pub.getChainId();
if (chainId !== chain.id) throw new Error(`체인 ID 불일치: ${chainId}`);
const ruleset = await pub.readContract({
  address: GUILDS_ADDRESS,
  abi: GUILDS_ABI,
  functionName: "RULESET_VERSION",
});
if (ruleset !== 2) throw new Error(`v2가 아닙니다: ruleset ${ruleset}`);
const idPlus1 = await pub.readContract({
  address: GUILDS_ADDRESS,
  abi: GUILDS_ABI,
  functionName: "guildOf",
  args: [account.address],
});
if (idPlus1 === 0n) throw new Error("슬롯 A의 v1 길드 회원 상태가 이전되지 않았습니다");
const guildId = idPlus1 - 1n;

const enterHash = await wallet.writeContract({
  account,
  chain,
  address: GUILDS_ADDRESS,
  abi: GUILDS_ABI,
  functionName: "enterExpedition",
  args: [],
});
const enterReceipt = await pub.waitForTransactionReceipt({ hash: enterHash });
if (enterReceipt.status !== "success") throw new Error("원정 입장 실패");
const events = enterReceipt.logs.flatMap((log) => {
  try {
    return [decodeEventLog({ abi: GUILDS_ABI, data: log.data, topics: log.topics })];
  } catch {
    return [];
  }
});
const started = events.find((event) => event.eventName === "ExpeditionStarted")?.args;
if (!started) throw new Error("ExpeditionStarted 이벤트가 없습니다");
const attempt = Number(started.attempt);
const pinned = events.find((event) => event.eventName === "SeedPinned")?.args;
const epoch = started.epoch;
const seed = pinned?.seed ?? await pub.readContract({
  address: GUILDS_ADDRESS,
  abi: GUILDS_ABI,
  functionName: "epochSeed",
  args: [epoch],
});

const picks = [];
for (let step = 0; step < 6; step++) {
  const door = safeDoorAt(seed, guildId, attempt, step);
  if (door === null) break;
  picks.push(door);
}
if (picks.length === 0) throw new Error("첫 걸음의 세 문이 모두 함정이라 귀환 경로가 없습니다");
const expected = resolveRun(seed, guildId, attempt, picks);
if (!expected.ok) throw new Error("로컬 v2 재현이 안전 경로를 함정으로 판정했습니다");

const settleHash = await wallet.writeContract({
  account,
  chain,
  address: GUILDS_ADDRESS,
  abi: GUILDS_ABI,
  functionName: "settleRun",
  args: [attempt, picks],
});
const settleReceipt = await pub.waitForTransactionReceipt({ hash: settleHash });
if (settleReceipt.status !== "success") throw new Error("원정 귀환 실패");
const settled = settleReceipt.logs.flatMap((log) => {
  try {
    const event = decodeEventLog({ abi: GUILDS_ABI, data: log.data, topics: log.topics });
    return event.eventName === "RunSettled" ? [event.args] : [];
  } catch {
    return [];
  }
})[0];
if (!settled || Number(settled.climbed) !== expected.climbed) {
  throw new Error(`귀환 재현 불일치: 예상 ${expected.climbed}, 온체인 ${settled?.climbed ?? "없음"}`);
}

console.log("GiwaGuilds v2 실체인 스모크 통과");
console.log(`  규칙표 v${ruleset} · 이전된 길드 #${guildId} · 원정 #${attempt}`);
console.log(`  ${picks.length}문 · +${expected.climbed}층 · 온체인 재현 일치`);
console.log(`  입장: ${explorer}/tx/${enterHash}`);
console.log(`  귀환: ${explorer}/tx/${settleHash}`);
