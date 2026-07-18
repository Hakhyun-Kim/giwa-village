// E2E: 슬롯 A가 슬롯 B에게 GIWA Sepolia에서 실제 ETH를 선물하고,
// village 룸을 통해 gift 브로드캐스트가 B에게 도달하는지 검증한다.
// Usage: node scripts/gift-smoke.mjs [금액ETH=0.005]
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
const AMOUNT = process.argv[2] ?? "0.005";
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
const accA = privateKeyToAccount(A.privateKey);

const pub = createPublicClient({ chain: giwaSepolia, transport: http() });
const walletA = createWalletClient({
  account: accA,
  chain: giwaSepolia,
  transport: http(),
});

const value = parseEther(AMOUNT);
const balA = await pub.getBalance({ address: A.address });
const balBefore = await pub.getBalance({ address: B.address });
console.log(`A 잔액: ${formatEther(balA)} ETH / B 잔액: ${formatEther(balBefore)} ETH`);
if (balA < value) fail(`A 잔액 부족 (필요 ${AMOUNT})`);

// --- room: A와 B 접속, B는 gift 수신 대기 ---
const clientA = new Client(WS);
const clientB = new Client(WS);
const roomA = await clientA.joinOrCreate("village", {
  name: "A-gift",
  address: A.address,
  color: 1,
});
const roomB = await clientB.joinOrCreate("village", {
  name: "B-gift",
  address: B.address,
  color: 2,
});
let giftAtB = null;
roomA.onMessage("snapshot", () => {});
roomA.onMessage("gift", () => {});
roomA.onMessage("emote", () => {});
roomA.onMessage("leave", () => {});
roomB.onMessage("snapshot", () => {});
roomB.onMessage("emote", () => {});
roomB.onMessage("leave", () => {});
roomB.onMessage("gift", (g) => (giftAtB = g));
await sleep(400);
console.log("ok: A, B 룸 접속");

// --- 실제 온체인 전송 ---
console.log(`\n[tx] A → B ${AMOUNT} ETH 전송 중…`);
const tx = await walletA.sendTransaction({
  account: accA,
  chain: giwaSepolia,
  to: B.address,
  value,
});
console.log(`  tx: ${giwaSepolia.blockExplorers?.default?.url ?? ""}/tx/${tx}`);
console.log(`      https://sepolia-explorer.giwa.io/tx/${tx}`);
await pub.waitForTransactionReceipt({ hash: tx });

const balAfter = await pub.getBalance({ address: B.address });
if (balAfter - balBefore !== value) {
  fail(`B 잔액 증가분 불일치: +${formatEther(balAfter - balBefore)} (기대 ${AMOUNT})`);
}
console.log(`ok: 온체인 전송 확정, B 잔액 ${formatEther(balBefore)} → ${formatEther(balAfter)} ETH`);

// --- gift 브로드캐스트 ---
roomA.send("gift", { to: roomB.sessionId, amountEth: AMOUNT, tx });
await sleep(600);
if (!giftAtB) fail("B가 gift 브로드캐스트를 수신하지 못함");
if (giftAtB.tx !== tx) fail(`gift tx 불일치: ${giftAtB.tx}`);
if (giftAtB.to !== roomB.sessionId) fail("gift 수신자 세션 불일치");
if (giftAtB.amountEth !== AMOUNT) fail(`gift 금액 불일치: ${giftAtB.amountEth}`);
console.log(`ok: B가 gift 수신 — ${giftAtB.fromName} → ${giftAtB.toName} ${giftAtB.amountEth} ETH`);

// --- 위조 tx 해시는 서버가 거부 ---
giftAtB = null;
roomA.send("gift", { to: roomB.sessionId, amountEth: "1.0", tx: "not-a-hash" });
await sleep(400);
if (giftAtB) fail("서버가 잘못된 tx 해시를 거부하지 않음");
console.log("ok: 서버가 형식이 잘못된 tx 해시를 거부");

await roomA.leave();
await roomB.leave();
console.log("\nALL GIFT CHECKS PASSED");
process.exit(0);
