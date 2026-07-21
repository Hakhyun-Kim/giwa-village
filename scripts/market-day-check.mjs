// 장날 라이브 관찰 — 실제 GIWA Sepolia에서 장날이 도는지 확인한다.
//
// 로직 자체는 로컬 체인에서 이미 증명했다 (`npm run test:local` — 시간을 토 21시로
// 점프해 평일 +1 vs 장날 +2 확인, 컨트랙트↔클라이언트 판정 표본 64개 일치).
// 여기서 보는 것은 **실제 체인의 시계 위에서도 같은 결과가 나오는가** 하나뿐이다.
//
// Usage:
//   node scripts/market-day-check.mjs          읽기만 — 지금 장날인지, 다음은 언제인지 (가스 0)
//   node scripts/market-day-check.mjs --live   장날일 때 실제 gather→claim 으로 2배 확인 (가스 소량)
//
// 장날: 매주 토요일 21:00~22:00 KST (= 12:00~13:00 UTC).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, defineChain, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RPC = process.env.GIWA_RPC_URL || "https://sepolia-rpc.giwa.io";
const HEARTH = process.env.GIWA_HEARTH_ADDRESS || "0xf780265d5f49abd8c7e5d18d81d33426f62f3365";
const BOSS = process.env.GIWA_BOSS_ADDRESS || "0x8f50d882fc936f481f5f66d76156ebdf816cc6ae";
const LIVE = process.argv.includes("--live");

const chain = defineChain({
  id: 91342,
  name: "GIWA Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
  testnet: true,
});
const pub = createPublicClient({ chain, transport: http(RPC) });

const HEARTH_ABI = parseAbi([
  "function WINDOW() view returns (uint256)",
  "function windowNow() view returns (uint256)",
  "function isMarketDay(uint256 ts) view returns (bool)",
  "function countOf(uint256 w) view returns (uint16)",
  "function warmthOf(address who) view returns (uint32)",
  "function gather()",
  "function claim(uint256 w) returns (uint32)",
]);
const BOSS_ABI = parseAbi([
  "function statusOf(address who) view returns (uint256 w, uint128 remaining, bool slain, uint128 myContrib, uint64 nextStrikeAt, bool prevClaimable, uint32 trophies)",
]);

/** 클라이언트(client/src/chain/hearth.ts)와 같은 규칙 */
function clientIsMarketDay(tsSeconds) {
  const day = Math.floor(tsSeconds / 86400);
  const sec = tsSeconds % 86400;
  return day % 7 === 2 && sec >= 12 * 3600 && sec < 13 * 3600;
}
function nextMarketDayStart(after) {
  const day = Math.floor(after / 86400);
  for (let d = 0; d < 9; d++) {
    if ((day + d) % 7 === 2) {
      const start = (day + d) * 86400 + 12 * 3600;
      if (start > after) return start;
    }
  }
  return 0;
}
const kst = (ts) =>
  new Date(ts * 1000).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });

let fails = 0;
const check = (label, ok, detail = "") => {
  console.log(`  ${ok ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) fails++;
};

// ── 읽기 (가스 0) ──────────────────────────────────────────────────────────

const block = await pub.getBlock();
const chainNow = Number(block.timestamp);
const localNow = Math.floor(Date.now() / 1000);

console.log("장날 라이브 관찰 (GIWA Sepolia)\n");
console.log(`체인 시각  ${kst(chainNow)} KST  (블록 ${block.number})`);
console.log(`로컬 시각  ${kst(localNow)} KST`);
console.log(`시차       ${Math.abs(chainNow - localNow)}초\n`);

const onChain = await pub.readContract({
  address: HEARTH, abi: HEARTH_ABI, functionName: "isMarketDay", args: [BigInt(chainNow)],
});
const offChain = clientIsMarketDay(chainNow);

console.log("판정:");
check("컨트랙트 ↔ 클라이언트 장날 판정 일치", onChain === offChain, `둘 다 ${onChain ? "장날" : "평일"}`);

const WINDOW = Number(await pub.readContract({ address: HEARTH, abi: HEARTH_ABI, functionName: "WINDOW" }));
const w = await pub.readContract({ address: HEARTH, abi: HEARTH_ABI, functionName: "windowNow" });
const cnt = await pub.readContract({ address: HEARTH, abi: HEARTH_ABI, functionName: "countOf", args: [w] });
console.log(`\n모닥불: 창 #${w} · 지금 ${cnt}명 · 창 길이 ${WINDOW / 60}분`);

const boss = await pub.readContract({
  address: BOSS, abi: BOSS_ABI,
  functionName: "statusOf", args: ["0x0000000000000000000000000000000000000000"],
});
console.log(`도깨비: ${boss[2] ? "토벌됨" : `체력 ${boss[1]}/2000`} (${boss[0]}주차)`);

if (!onChain) {
  const next = nextMarketDayStart(chainNow);
  const left = next - chainNow;
  const d = Math.floor(left / 86400);
  const h = Math.floor((left % 86400) / 3600);
  const m = Math.floor((left % 3600) / 60);
  console.log(`\n지금은 평일입니다. 다음 장날: ${kst(next)} KST (${d}일 ${h}시간 ${m}분 뒤)`);
  console.log("장날 창(1시간) 안에 다시 실행하세요. 실측까지 하려면 --live 를 붙입니다.");
  process.exit(fails === 0 ? 0 : 1);
}

console.log("\n🏮 지금 장날입니다.");
const marketEnd = Math.floor(chainNow / 86400) * 86400 + 13 * 3600;
console.log(`창 종료까지 ${Math.floor((marketEnd - chainNow) / 60)}분`);

if (!LIVE) {
  console.log("\n실제 온기 2배까지 확인하려면: node scripts/market-day-check.mjs --live");
  console.log("(지갑 2개로 모닥불에 모이고, 창이 닫히면 수령해 +2인지 봅니다 — 약 10분 소요)");
  process.exit(fails === 0 ? 0 : 1);
}

// ── 실측 (--live) — 가스 소량 ──────────────────────────────────────────────
// 온기는 "함께 있었음"의 증명이라 2명이 같은 창에 모여야 한다.

console.log("\n실측 시작 — 지갑 2개로 모닥불에 모입니다.");

const botsFile = path.join(ROOT, ".botwallets.json");
if (!fs.existsSync(botsFile)) {
  console.error(".botwallets.json이 없습니다.");
  process.exit(1);
}
const bots = JSON.parse(fs.readFileSync(botsFile, "utf8"));
const npcs = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "npcs.json"), "utf8")).npcs;
const pair = npcs.filter((n) => n.class === "merchant").slice(0, 2);
const accounts = pair.map((n) => ({ npc: n, acct: privateKeyToAccount(bots[n.walletIndex].privateKey) }));

for (const { npc, acct } of accounts) {
  const bal = await pub.getBalance({ address: acct.address });
  if (bal === 0n) {
    console.error(`${npc.name} 지갑에 가스가 없습니다 — node scripts/faucet-check.mjs --open --bot ${npc.id}`);
    process.exit(1);
  }
}

// 창이 곧 닫히면 다음 창을 기다린다 (같은 창에 둘 다 들어가야 한다)
let targetWindow = await pub.readContract({ address: HEARTH, abi: HEARTH_ABI, functionName: "windowNow" });
const secLeftInWindow = WINDOW - (chainNow % WINDOW);
if (secLeftInWindow < 90) {
  console.log(`현재 창이 ${secLeftInWindow}초 뒤 닫힙니다 — 다음 창을 기다립니다…`);
  await new Promise((r) => setTimeout(r, (secLeftInWindow + 5) * 1000));
  targetWindow = await pub.readContract({ address: HEARTH, abi: HEARTH_ABI, functionName: "windowNow" });
}

const warmthBefore = {};
for (const { npc, acct } of accounts) {
  warmthBefore[npc.id] = await pub.readContract({
    address: HEARTH, abi: HEARTH_ABI, functionName: "warmthOf", args: [acct.address],
  });
  const wallet = createWalletClient({ account: acct, chain, transport: http(RPC) });
  try {
    const hash = await wallet.writeContract({
      address: HEARTH, abi: HEARTH_ABI, functionName: "gather", args: [],
    });
    await pub.waitForTransactionReceipt({ hash });
    console.log(`  ${npc.name} 모닥불에 앉음`);
  } catch (err) {
    if ((err.shortMessage ?? "").includes("joined")) console.log(`  ${npc.name} 이미 앉아 있음`);
    else throw err;
  }
}

const gathered = await pub.readContract({
  address: HEARTH, abi: HEARTH_ABI, functionName: "countOf", args: [targetWindow],
});
check("같은 창에 2명 이상", gathered >= 2, `${gathered}명 · 창 #${targetWindow}`);

// 창이 닫혀야 수령할 수 있다
console.log("\n창이 닫히기를 기다립니다 (최대 10분)…");
for (let i = 0; i < 80; i++) {
  const cur = await pub.readContract({ address: HEARTH, abi: HEARTH_ABI, functionName: "windowNow" });
  if (cur > targetWindow) break;
  await new Promise((r) => setTimeout(r, 10000));
  if (i % 6 === 5) console.log(`  …${(i + 1) * 10}초 경과`);
}

const { npc, acct } = accounts[0];
const wallet = createWalletClient({ account: acct, chain, transport: http(RPC) });
const hash = await wallet.writeContract({
  address: HEARTH, abi: HEARTH_ABI, functionName: "claim", args: [targetWindow],
});
const rcpt = await pub.waitForTransactionReceipt({ hash });
check("수령 트랜잭션 성공", rcpt.status === "success", `https://sepolia-explorer.giwa.io/tx/${hash}`);

// 리플리카 지연이 있어 잠깐 재시도
let gained = 0;
for (let i = 0; i < 10; i++) {
  const after = await pub.readContract({
    address: HEARTH, abi: HEARTH_ABI, functionName: "warmthOf", args: [acct.address],
  });
  gained = after - warmthBefore[npc.id];
  if (gained > 0) break;
  await new Promise((r) => setTimeout(r, 3000));
}
check("장날 온기 2배 적립", gained === 2, `${npc.name} +${gained} (평일이면 +1)`);

console.log(`\n${"─".repeat(52)}`);
console.log(fails === 0 ? "장날이 라이브에서 정상 동작합니다." : `실패 ${fails}건`);
process.exit(fails === 0 ? 0 : 1);
