// E2E: GiwaMarketV2 — 리스팅·가격 강제·에스크로 보관·ERC-1155 쿠폰 민팅·
// 정산 확정까지 GIWA Sepolia 실거래로 검증한다.
// Usage: node scripts/market-smoke.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  defineChain,
  http,
  parseAbi,
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => {
  console.error(`FAIL: ${m}`);
  process.exit(1);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const giwaSepolia = defineChain({
  id: 91342,
  name: "GIWA Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://sepolia-rpc.giwa.io"] } },
  testnet: true,
});

const marketTs = fs.readFileSync(
  path.resolve(ROOT, "client", "src", "config", "market.ts"),
  "utf8",
);
const ADDRESS = marketTs.match(/MARKET_ADDRESS = "(0x[0-9a-fA-F]{40})"/)?.[1];
if (!ADDRESS) fail("market.ts에서 컨트랙트 주소를 찾지 못함");

const abi = parseAbi([
  "function list(string itemId, uint128 price) external",
  "function unlist(string itemId) external",
  "function listingOf(address seller, string itemId) view returns (uint256 price, bool active)",
  "function buy(address seller, string itemId) payable returns (uint256)",
  "function confirm(uint256 purchaseId) external",
  "function release(uint256 purchaseId) external",
  "function purchaseOf(uint256 id) view returns (address buyer, address seller, uint256 amount, uint64 releaseAt, bool settled)",
  "function balanceOf(address account, uint256 id) view returns (uint256)",
  "event Purchased(address indexed buyer, address indexed seller, string itemId, uint256 amount, uint256 indexed purchaseId, uint256 tokenId)",
  "event Settled(uint256 indexed purchaseId, address indexed seller, uint256 amount)",
]);

const wallets = JSON.parse(
  fs.readFileSync(path.resolve(ROOT, ".testwallets.json"), "utf8"),
);
const A = wallets.find((w) => w.slot === "A");
const B = wallets.find((w) => w.slot === "B");
const accA = privateKeyToAccount(A.privateKey);
const accB = privateKeyToAccount(B.privateKey);
const pub = createPublicClient({ chain: giwaSepolia, transport: http() });
const wcA = createWalletClient({ account: accA, chain: giwaSepolia, transport: http() });
const wcB = createWalletClient({ account: accB, chain: giwaSepolia, transport: http() });

const ITEM = "smoke-v2-item";
const PRICE = "0.0006";

async function retry(label, fn, tries = 12) {
  for (let i = 0; i < tries; i++) {
    try {
      if (await fn()) return;
    } catch {
      // 리플리카 지연으로 상태가 아직 없으면 revert할 수 있다 — 재시도
    }
    await sleep(1000);
  }
  fail(label);
}

console.log(`컨트랙트(V2): ${ADDRESS}`);

// 1) 리스팅
let tx = await wcA.writeContract({
  account: accA, chain: giwaSepolia, address: ADDRESS, abi,
  functionName: "list", args: [ITEM, parseEther(PRICE)],
});
await pub.waitForTransactionReceipt({ hash: tx });
await retry("리스팅 조회 불일치", async () => {
  const [price, active] = await pub.readContract({
    address: ADDRESS, abi, functionName: "listingOf", args: [A.address, ITEM],
  });
  return active && price === parseEther(PRICE);
});
console.log(`ok: 온체인 리스팅 — ${ITEM} @ ${PRICE} ETH`);

// 2) B 구매 → 에스크로 보관 + 쿠폰 토큰 민팅
tx = await wcB.writeContract({
  account: accB, chain: giwaSepolia, address: ADDRESS, abi,
  functionName: "buy", args: [A.address, ITEM], value: parseEther(PRICE),
});
const receipt = await pub.waitForTransactionReceipt({ hash: tx });
if (receipt.status !== "success") fail("buy revert");

let purchaseId = null;
let tokenId = null;
for (const log of receipt.logs) {
  try {
    const ev = decodeEventLog({ abi, data: log.data, topics: log.topics });
    if (ev.eventName === "Purchased") {
      purchaseId = ev.args.purchaseId;
      tokenId = ev.args.tokenId;
    }
  } catch {}
}
if (purchaseId === null || tokenId === null) fail("Purchased 이벤트 없음");
console.log(`ok: 구매 — purchaseId=${purchaseId}, tokenId=${tokenId.toString().slice(0, 12)}…`);

await retry("에스크로 미보관 (settled 상태 이상)", async () => {
  const [buyer, , amount, , settled] = await pub.readContract({
    address: ADDRESS, abi, functionName: "purchaseOf", args: [purchaseId],
  });
  return buyer.toLowerCase() === B.address.toLowerCase() &&
    amount === parseEther(PRICE) && settled === false;
});
console.log("ok: 대금이 에스크로에 보관됨 (미정산 상태)");

await retry("ERC-1155 쿠폰 미발행", async () => {
  const bal = await pub.readContract({
    address: ADDRESS, abi, functionName: "balanceOf", args: [B.address, tokenId],
  });
  return bal >= 1n;
});
console.log("ok: ERC-1155 쿠폰 토큰이 구매자 지갑에 민팅됨");

// 3) 틀린 가격 거부
let reverted = false;
try {
  await wcB.writeContract({
    account: accB, chain: giwaSepolia, address: ADDRESS, abi,
    functionName: "buy", args: [A.address, ITEM], value: parseEther("0.0001"),
  });
} catch {
  reverted = true;
}
if (!reverted) fail("틀린 가격이 거부되지 않음");
console.log("ok: 리스팅 가격 강제 (WrongPrice revert)");

// 4) 24시간 전 release는 거부
reverted = false;
try {
  await wcA.writeContract({
    account: accA, chain: giwaSepolia, address: ADDRESS, abi,
    functionName: "release", args: [purchaseId],
  });
} catch {
  reverted = true;
}
if (!reverted) fail("조기 release가 거부되지 않음");
console.log("ok: 24시간 전 임의 정산 거부 (early revert)");

// 5) 구매자 confirm → 정산
tx = await wcB.writeContract({
  account: accB, chain: giwaSepolia, address: ADDRESS, abi,
  functionName: "confirm", args: [purchaseId],
});
const r2 = await pub.waitForTransactionReceipt({ hash: tx });
if (r2.status !== "success") fail("confirm revert");
const settledEv = (
  await pub.getContractEvents({
    address: ADDRESS, abi, eventName: "Settled",
    fromBlock: r2.blockNumber, toBlock: r2.blockNumber,
  })
).find((l) => l.transactionHash === tx);
if (!settledEv || settledEv.args.amount !== parseEther(PRICE)) fail("Settled 이벤트 이상");
console.log("ok: 구매자 확정 → 판매자 정산 (Settled 이벤트)");

// 6) 이중 정산 거부
reverted = false;
try {
  await wcB.writeContract({
    account: accB, chain: giwaSepolia, address: ADDRESS, abi,
    functionName: "confirm", args: [purchaseId],
  });
} catch {
  reverted = true;
}
if (!reverted) fail("이중 정산이 거부되지 않음");
console.log("ok: 이중 정산 거부 (settled revert)");

console.log("\nALL MARKET-V2 CHECKS PASSED");
process.exit(0);
