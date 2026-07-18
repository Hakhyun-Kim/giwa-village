// UP.ID 역방향 조회 경로 검증 — UPNameRegistry(ERC-721 이름 NFT)의
// hasActiveName → ownedTokenId → getLabel 경로가 에러 없이 동작하는지 확인.
// 테스트 지갑은 Dojang 인증이 없어 이름 미등록(null)이 정상이다.
// Usage: node scripts/upid-smoke.mjs [주소]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, defineChain, http, parseAbi, toHex } from "viem";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = "0x091D00004f21eb2Fc30964A8a4995692d9b49628";
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
const pub = createPublicClient({ chain: giwaSepolia, transport: http() });
const abi = parseAbi([
  "function hasActiveName(address owner) view returns (bool)",
  "function ownedTokenId(address owner) view returns (uint256)",
  "function getLabel(bytes32 key) view returns (string)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
]);

const code = await pub.getCode({ address: REGISTRY });
if (!code || code === "0x") fail("UPNameRegistry 코드 없음");
const [nftName, symbol] = await Promise.all([
  pub.readContract({ address: REGISTRY, abi, functionName: "name" }),
  pub.readContract({ address: REGISTRY, abi, functionName: "symbol" }),
]);
console.log(`ok: UPNameRegistry 연결 — 컬렉션 "${nftName}" (${symbol})`);

const wallets = JSON.parse(
  fs.readFileSync(path.resolve(ROOT, ".testwallets.json"), "utf8"),
);
const targets = process.argv[2]
  ? [{ slot: "인자", address: process.argv[2] }]
  : wallets.slice(0, 2);

for (const t of targets) {
  const has = await pub.readContract({
    address: REGISTRY, abi, functionName: "hasActiveName", args: [t.address],
  });
  if (!has) {
    console.log(`[${t.slot}] ${t.address} → UP.ID 미등록 (Dojang 미인증 지갑 정상)`);
    continue;
  }
  const tokenId = await pub.readContract({
    address: REGISTRY, abi, functionName: "ownedTokenId", args: [t.address],
  });
  const label = await pub.readContract({
    address: REGISTRY, abi, functionName: "getLabel", args: [toHex(tokenId, { size: 32 })],
  });
  console.log(`[${t.slot}] ${t.address} → UP.ID: ${label}`);
}
console.log("\nok: UP.ID 역방향 조회 경로 정상");
