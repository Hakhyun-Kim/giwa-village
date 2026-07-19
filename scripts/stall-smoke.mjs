// E2E: 노점 시스템 — A가 노점을 열고, B가 실제 온체인 결제로 구매하고,
// 판매 브로드캐스트/영속성/폐점까지 검증한다.
// Usage: node scripts/stall-smoke.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatEther,
  http,
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Client } from "colyseus.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WS = process.env.WS_URL ?? "ws://localhost:2567";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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

const wallets = JSON.parse(
  fs.readFileSync(path.resolve(ROOT, ".testwallets.json"), "utf8"),
);
const A = wallets.find((w) => w.slot === "A");
const B = wallets.find((w) => w.slot === "B");
const accB = privateKeyToAccount(B.privateKey);
const pub = createPublicClient({ chain: giwaSepolia, transport: http() });
const walletB = createWalletClient({
  account: accB,
  chain: giwaSepolia,
  transport: http(),
});

const PRICE = "0.001";

// --- 접속 ---
const clientA = new Client(WS);
const clientB = new Client(WS);
const roomA = await clientA.joinOrCreate("village", {
  name: "노점상A", address: A.address, color: 1,
});
const roomB = await clientB.joinOrCreate("village", {
  name: "손님B", address: B.address, color: 2,
});

let stallsAtB = null;
let saleAtB = null;
for (const r of [roomA, roomB]) {
  r.onMessage("snapshot", () => {});
  r.onMessage("emote", () => {});
  r.onMessage("leave", () => {});
  r.onMessage("gift", () => {});
}
roomA.onMessage("stalls", () => {});
roomA.onMessage("stall:sale", () => {});
roomB.onMessage("stalls", (list) => (stallsAtB = list));
roomB.onMessage("stall:sale", (s) => (saleAtB = s));

roomB.send("stalls:get");
await sleep(400);

// --- 브랜드 상점 시드 확인 ---
if (!stallsAtB) fail("stalls:get 응답 없음");
const brands = stallsAtB.filter((s) => s.brand);
if (brands.length !== 3) fail(`브랜드 상점 3곳 기대, ${brands.length}곳`);
console.log(`ok: 브랜드 상점 시드 — ${brands.map((b) => b.title).join(", ")}`);

// --- A 노점 개설 ---
roomA.send("stall:open", {
  title: "스모크 노점",
  items: [
    { name: "테스트쿠폰", emoji: "🎫", priceEth: PRICE },
    { name: "등불", emoji: "🏮", priceEth: "0.002" },
  ],
});
await sleep(500);
const myStall = stallsAtB?.find((s) => s.ownerAddress === A.address && !s.brand);
if (!myStall) fail("A의 노점이 B에게 브로드캐스트되지 않음");
if (myStall.items.length !== 2) fail("노점 상품 수 불일치");
console.log(`ok: 노점 개설 전파 — "${myStall.title}" (${myStall.items.length}개 상품)`);

// --- 잘못된 노점(가격 오류)은 거부 ---
const beforeCount = stallsAtB.length;
roomB.send("stall:open", {
  title: "사기 노점",
  items: [{ name: "무료무료", emoji: "🎫", priceEth: "-1" }],
});
await sleep(400);
if (stallsAtB.length !== beforeCount) fail("서버가 잘못된 가격의 노점을 허용함");
console.log("ok: 서버가 잘못된 가격의 노점 개설 거부");

// --- B가 실제 온체인 결제로 구매 ---
const item = myStall.items[0];
const balABefore = await pub.getBalance({ address: A.address });
console.log(`\n[tx] B → A ${PRICE} ETH 결제 중… (${item.name})`);
const tx = await walletB.sendTransaction({
  account: accB,
  chain: giwaSepolia,
  to: A.address,
  value: parseEther(PRICE),
});
await pub.waitForTransactionReceipt({ hash: tx });
const balAAfter = await pub.getBalance({ address: A.address });
if (balAAfter - balABefore !== parseEther(PRICE)) {
  fail(`A 잔액 증가분 불일치: +${formatEther(balAAfter - balABefore)}`);
}
console.log(`ok: 온체인 결제 확정 (https://sepolia-explorer.giwa.io/tx/${tx})`);

roomB.send("stall:buy", { stallId: myStall.id, itemId: item.id, tx });
await sleep(500);
if (!saleAtB) fail("판매 브로드캐스트 미수신");
if (saleAtB.tx !== tx || saleAtB.itemName !== item.name) fail("판매 내용 불일치");
if (saleAtB.buyerAddress !== B.address) fail("구매자 주소 불일치");
console.log(`ok: 판매 브로드캐스트 — ${saleAtB.buyerName}이 ${saleAtB.stallTitle}에서 ${saleAtB.itemName} 구매`);

// --- 위조 tx는 거부 ---
saleAtB = null;
roomB.send("stall:buy", { stallId: myStall.id, itemId: item.id, tx: "0xdead" });
await sleep(400);
if (saleAtB) fail("서버가 위조 tx 해시를 거부하지 않음");
console.log("ok: 위조 tx 해시 거부");

// --- 영속성 파일 확인 ---
const stallsFile = path.resolve(ROOT, "server", "data", "stalls.json");
if (!fs.existsSync(stallsFile)) fail("stalls.json 영속성 파일 없음");
const persisted = JSON.parse(fs.readFileSync(stallsFile, "utf8"));
if (!persisted.find((s) => s.id === myStall.id)) fail("노점이 파일에 저장되지 않음");
console.log("ok: 노점 영속성 (server/data/stalls.json)");

// --- 폐점 ---
roomA.send("stall:close");
await sleep(500);
if (stallsAtB.find((s) => s.id === myStall.id)) fail("폐점이 전파되지 않음");
console.log("ok: 폐점 전파");

await roomA.leave();
await roomB.leave();
console.log("\nALL STALL CHECKS PASSED");
process.exit(0);
