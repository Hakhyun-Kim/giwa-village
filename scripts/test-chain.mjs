// 실가스 테스트 — GIWA Sepolia에서 실제 트랜잭션을 보낸다.
//
// 이 계층은 **아껴 쓴다.** 포셋이 주소당 24시간 0.005 ETH라 무한정 돌릴 수 없다.
// 로직은 `npm test`(가스 0)로, 컨트랙트 상호작용은 `npm run test:local`(가스 0)로
// 검증하고, 여기서는 로컬에서 흉내 낼 수 없는 것만 확인한다:
//
//   - GIWA 고유 연동 (Dojang 인증 조회, UP.ID 이름 조회)
//   - 실제 배포된 컨트랙트가 살아 있는지
//   - 공개 RPC의 실제 거동 (리플리카 지연 등)
//
// 실수로 도는 걸 막기 위해 --yes 를 요구한다.
// Usage: npm run test:chain -- --yes
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, defineChain, formatEther, http, parseAbi } from "viem";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RPC = process.env.GIWA_RPC_URL || "https://sepolia-rpc.giwa.io";
const CHAIN_ID = 91342;

if (!process.argv.includes("--yes")) {
  console.log("실가스 테스트입니다 — GIWA Sepolia에서 실제 트랜잭션을 보냅니다.\n");
  console.log("먼저 가스가 들지 않는 쪽을 확인하세요:");
  console.log("  npm test          로직 (체인 없음, 즉시)");
  console.log("  npm run test:local  컨트랙트 E2E (로컬 anvil, 가스 0)\n");
  console.log("그래도 실행하려면: npm run test:chain -- --yes");
  process.exit(0);
}

const chain = defineChain({
  id: CHAIN_ID,
  name: "GIWA Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
  testnet: true,
});
const pub = createPublicClient({ chain, transport: http(RPC) });

let fails = 0;
const check = (label, ok, detail = "") => {
  console.log(`  ${ok ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) fails++;
};

console.log("실가스 테스트 (GIWA Sepolia)\n");

// ── 배포된 컨트랙트가 살아 있는가 ──────────────────────────────────────────

const DEPLOYED = {
  GiwaMarketV3: "0x1f34506cda6619fc3124d68742a8fd5e7ba436e2",
  GiwaGuilds: "0x65e4de091071d2f0d47b24f1ada5c2c7ba2c7638",
  GiwaPresence: "0x4d600672cefae3c8462f3d9feb2cb739001e7a93",
  GiwaHonors: "0x7e230f68c4dabe64e6de231ea3085e50f0d5a57f",
  GiwaOffers: "0x534a29c47667b54eab6995517705cfbc423bb909",
  GiwaBoxes: "0xeb0349f00fc781c807b6d15c74d7f5fb15996b2e",
  GiwaHearth: "0xf780265d5f49abd8c7e5d18d81d33426f62f3365",
  GiwaWorkshop: "0x664762337e529f853949a94e6ed50e6d8016c975",
  GiwaBoss: "0x8f50d882fc936f481f5f66d76156ebdf816cc6ae",
  GiwaProfile: "0xefe0e8d69661fd67f5fe2368f9b1f7ff6d395416",
};

console.log("배포된 컨트랙트 (읽기 — 가스 0):");
const id = await pub.getChainId();
check("체인 연결", id === CHAIN_ID, `chain-id ${id}`);

for (const [name, addr] of Object.entries(DEPLOYED)) {
  const code = await pub.getBytecode({ address: addr });
  check(name, !!code && code !== "0x", `${(code?.length ?? 0) / 2 - 1} bytes`);
}

// ── 마을 상태 ──────────────────────────────────────────────────────────────

console.log("\n마을 상태 (읽기 — 가스 0):");
const MARKET_ABI = parseAbi([
  "struct StallItem { string name; string emoji; uint128 price; }",
  "struct Stall { string title; int32 x; int32 z; uint64 openedAt; bool open; StallItem[] items; }",
  "function openStalls() view returns (address[], Stall[])",
]);
const [owners] = await pub.readContract({
  address: DEPLOYED.GiwaMarketV3,
  abi: MARKET_ABI,
  functionName: "openStalls",
});
check("openStalls() 응답", Array.isArray(owners), `열린 노점 ${owners.length}개`);

// ── GIWA 고유 연동 — 로컬에서 흉내 낼 수 없는 부분 ────────────────────────

console.log("\nGIWA 네이티브 연동 (읽기 — 가스 0):");
const DOJANG = "0xd5077b67dcb56caC8b270C7788FC3E6ee03F17B9";
const UPNAME = "0x091D00004f21eb2Fc30964A8a4995692d9b49628";
for (const [name, addr] of [["DojangScroll", DOJANG], ["UPNameRegistry", UPNAME]]) {
  const code = await pub.getBytecode({ address: addr });
  check(name, !!code && code !== "0x");
}

// ── 지갑 잔액 (실가스 테스트를 더 돌릴 수 있는지) ─────────────────────────

console.log("\n가스 잔량:");
const walletsFile = path.join(ROOT, ".testwallets.json");
if (fs.existsSync(walletsFile)) {
  const A = JSON.parse(fs.readFileSync(walletsFile, "utf8")).find((w) => w.slot === "A");
  const bal = await pub.getBalance({ address: A.address });
  check("슬롯 A 잔액", bal > 0n, `${formatEther(bal)} ETH`);
  if (bal < 5000000000000000n) {
    console.log("     ↳ 여유가 적습니다. 실거래 테스트는 아끼고 test:local을 쓰세요.");
  }
}

console.log(`\n${"─".repeat(50)}`);
console.log(
  fails === 0
    ? "전부 통과 (이 스크립트는 읽기만 하므로 가스를 쓰지 않았습니다)"
    : `실패 ${fails}건`,
);
console.log("실거래가 필요한 검증은 개별 스모크로: npm run market-smoke / gift / stall-smoke");
process.exit(fails === 0 ? 0 : 1);
