// E2E: GiwaMarket 컨트랙트 — 리스팅, 가격 강제, 구매 영수증(Purchased 이벤트),
// 미등록 아이템 폴백까지 GIWA Sepolia 실거래로 검증한다.
// Usage: node scripts/market-smoke.mjs
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
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => {
  console.error(`FAIL: ${m}`);
  process.exit(1);
};

const giwaSepolia = defineChain({
  id: 91342,
  name: "GIWA Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://sepolia-rpc.giwa.io"] } },
  testnet: true,
});

// 배포 스크립트가 기록한 주소를 읽는다
const marketTs = fs.readFileSync(
  path.resolve(ROOT, "client", "src", "config", "market.ts"),
  "utf8",
);
const ADDRESS = marketTs.match(/MARKET_ADDRESS = "(0x[0-9a-fA-F]{40})"/)?.[1];
if (!ADDRESS) fail("market.ts에서 컨트랙트 주소를 찾지 못함 — npm run deploy-market 먼저");

const abi = parseAbi([
  "function list(string itemId, uint128 price) external",
  "function unlist(string itemId) external",
  "function listingOf(address seller, string itemId) view returns (uint256 price, bool active)",
  "function buy(address seller, string itemId) payable",
  "event Purchased(address indexed buyer, address indexed seller, string itemId, uint256 amount)",
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

const ITEM = "smoke-item-1";
const PRICE = "0.0007";

console.log(`컨트랙트: ${ADDRESS}`);

// 1) A가 리스팅
let tx = await wcA.writeContract({
  account: accA, chain: giwaSepolia, address: ADDRESS, abi,
  functionName: "list", args: [ITEM, parseEther(PRICE)],
});
await pub.waitForTransactionReceipt({ hash: tx });
// 공개 RPC가 로드밸런싱되어 리플리카가 반 박자 늦을 수 있다 — 재시도 조회
let listed = false;
for (let i = 0; i < 10; i++) {
  const [price, active] = await pub.readContract({
    address: ADDRESS, abi, functionName: "listingOf", args: [A.address, ITEM],
  });
  if (active && price === parseEther(PRICE)) {
    listed = true;
    break;
  }
  await new Promise((r) => setTimeout(r, 1000));
}
if (!listed) fail("리스팅 조회 불일치 (10초 재시도 후에도)");
console.log(`ok: 온체인 리스팅 — ${ITEM} @ ${PRICE} ETH`);

// 2) B가 정확한 가격으로 구매 → 성공 영수증 + Purchased 이벤트
// (컨트랙트는 판매자 전달 실패 시 revert하므로, 성공 영수증 = 대금 전달 증명.
//  잔액 비교는 공개 RPC 리플리카 지연 때문에 신뢰할 수 없다.)
tx = await wcB.writeContract({
  account: accB, chain: giwaSepolia, address: ADDRESS, abi,
  functionName: "buy", args: [A.address, ITEM], value: parseEther(PRICE),
});
const receipt = await pub.waitForTransactionReceipt({ hash: tx });
if (receipt.status !== "success") fail("buy 트랜잭션이 revert됨");
const logs = await pub.getContractEvents({
  address: ADDRESS, abi, eventName: "Purchased",
  fromBlock: receipt.blockNumber, toBlock: receipt.blockNumber,
});
const ev = logs.find((l) => l.transactionHash === tx);
if (!ev) fail("Purchased 이벤트 없음");
if (
  ev.args.buyer.toLowerCase() !== B.address.toLowerCase() ||
  ev.args.seller.toLowerCase() !== A.address.toLowerCase() ||
  ev.args.itemId !== ITEM ||
  ev.args.amount !== parseEther(PRICE)
) fail("영수증 이벤트 내용 불일치");
console.log(`ok: 구매 확정 + 온체인 영수증 (tx ${tx.slice(0, 14)}…)`);

// 3) 틀린 가격은 컨트랙트가 거부
let reverted = false;
try {
  await wcB.writeContract({
    account: accB, chain: giwaSepolia, address: ADDRESS, abi,
    functionName: "buy", args: [A.address, ITEM], value: parseEther("0.0001"),
  });
} catch {
  reverted = true;
}
if (!reverted) fail("틀린 가격 구매가 거부되지 않음");
console.log("ok: 리스팅 가격 강제 (WrongPrice revert)");

// 4) A가 언리스트 → 미등록 아이템도 영수증만으로 구매 가능(봇 노점 경로)
tx = await wcA.writeContract({
  account: accA, chain: giwaSepolia, address: ADDRESS, abi,
  functionName: "unlist", args: [ITEM],
});
await pub.waitForTransactionReceipt({ hash: tx });
tx = await wcB.writeContract({
  account: accB, chain: giwaSepolia, address: ADDRESS, abi,
  functionName: "buy", args: [A.address, "unlisted-item"], value: parseEther("0.0003"),
});
const r2 = await pub.waitForTransactionReceipt({ hash: tx });
if (r2.status !== "success") fail("미등록 아이템 구매가 revert됨");
console.log("ok: 미등록 아이템 구매(영수증 전용 모드) — 가스 없는 노점용 폴백");

console.log("\nALL MARKET CHECKS PASSED");
process.exit(0);
