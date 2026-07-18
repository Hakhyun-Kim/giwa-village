// Dojang Verified Address 온체인 조회 검증 (GIWA Sepolia).
// 버너 지갑은 업비트 인증이 없으므로 false가 정상 — 조회 경로가 에러 없이
// 동작하는지(컨트랙트 주소·ABI·발행자 ID가 유효한지)를 확인한다.
// Usage: node scripts/dojang-smoke.mjs [확인할주소]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, defineChain, http, parseAbi } from "viem";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOJANG_SCROLL = "0xd5077b67dcb56caC8b270C7788FC3E6ee03F17B9";
const UPBIT_KOREA =
  "0xd99b42e778498aa3c9c1f6a012359130252780511687a35982e8e52735453034";

const giwaSepolia = defineChain({
  id: 91342,
  name: "GIWA Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://sepolia-rpc.giwa.io"] } },
  testnet: true,
});
const pub = createPublicClient({ chain: giwaSepolia, transport: http() });
const abi = parseAbi([
  "function isVerified(address account, bytes32 attesterId) view returns (bool)",
]);

const wallets = JSON.parse(
  fs.readFileSync(path.resolve(ROOT, ".testwallets.json"), "utf8"),
);
const targets = process.argv[2]
  ? [{ slot: "인자", address: process.argv[2] }]
  : wallets.slice(0, 2);

for (const t of targets) {
  const verified = await pub.readContract({
    address: DOJANG_SCROLL,
    abi,
    functionName: "isVerified",
    args: [t.address, UPBIT_KOREA],
  });
  console.log(
    `[${t.slot}] ${t.address} → Dojang 인증: ${verified ? "✔ 인증됨" : "미인증 (버너 지갑 정상)"}`,
  );
}
console.log("\nok: DojangScroll isVerified 조회 경로 정상 (컨트랙트/ABI/발행자 ID 유효)");
