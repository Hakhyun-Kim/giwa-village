// 풀온체인 마을 컨트랙트 배포 — 슬롯 A 지갑으로 순차 배포하고 client/src/config/<모듈>.ts 를 갱신한다.
// 컴파일은 test:local 과 같은 compileAll(기본 optimizer off · 24KB 에 걸리는 v4 장터 묶음만 켠다).
// Usage: node scripts/deploy-village.mjs [컨트랙트명 ...]   (예: GiwaMarketV4 GiwaOffersV2)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatEther,
  getContractAddress,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { deployedAddresses } from "./lib/deployments.mjs";
import { compileAll } from "./lib/localchain.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAX_CODE = 24576; // EIP-170
// Dojang (GIWA Sepolia) — client/src/config/dojang.ts 와 같은 값
const DOJANG_SCROLL = "0xd5077b67dcb56caC8b270C7788FC3E6ee03F17B9";
const UPBIT_KOREA_ATTESTER_ID = "0xd99b42e778498aa3c9c1f6a012359130252780511687a35982e8e52735453034";

const TARGETS = [
  { file: "GiwaMarketV3.sol", name: "GiwaMarketV3", out: "market.ts", prefix: "MARKET" },
  {
    file: "GiwaGuilds.sol",
    name: "GiwaGuilds",
    out: "guilds.ts",
    prefix: "GUILDS",
    args: (deployed) => [deployed.GiwaGuilds],
  },
  { file: "GiwaPresence.sol", name: "GiwaPresence", out: "presence.ts", prefix: "PRESENCE" },
  {
    file: "GiwaHonors.sol",
    name: "GiwaHonors",
    out: "honors.ts",
    prefix: "HONORS",
    args: (deployed) => [deployed.GiwaMarketV3, deployed.GiwaGuilds, deployed.GiwaHonors],
  },
  {
    file: "GiwaOffers.sol",
    name: "GiwaOffers",
    out: "offers.ts",
    prefix: "OFFERS",
    args: (deployed) => [deployed.GiwaMarketV3],
  },
  // 호패는 모닥불이 사람을 셀 때 읽는다 — 모닥불보다 먼저
  { file: "GiwaIdentity.sol", name: "GiwaIdentity", out: "identity.ts", prefix: "IDENTITY" },
  // 복주머니 v2 — 앞 판의 보유 · 장착을 legacyBoxes 로 잇는다(지금 config 의 주소가 앞 판)
  {
    file: "GiwaBoxes.sol",
    name: "GiwaBoxes",
    out: "boxes.ts",
    prefix: "BOXES",
    args: (deployed) => [deployed.GiwaBoxes],
  },
  // 모닥불 v2 — 사람을 센다(호패 · Dojang). 앞 판의 온기를 legacyHearth 로 잇는다
  {
    file: "GiwaHearth.sol",
    name: "GiwaHearth",
    out: "hearth.ts",
    prefix: "HEARTH",
    args: (deployed) => [deployed.GiwaHearth, deployed.GiwaIdentity, DOJANG_SCROLL, UPBIT_KOREA_ATTESTER_ID],
  },
  { file: "GiwaWorkshop.sol", name: "GiwaWorkshop", out: "workshop.ts", prefix: "WORKSHOP" },
  {
    file: "GiwaBoss.sol",
    name: "GiwaBoss",
    out: "boss.ts",
    prefix: "BOSS",
    args: (deployed) => [deployed.GiwaGuilds, deployed.GiwaHearth, deployed.GiwaBoss],
  },
  {
    file: "GiwaProfile.sol",
    name: "GiwaProfile",
    out: "profile.ts",
    prefix: "PROFILE",
    args: (deployed) => [
      deployed.GiwaGuilds,
      deployed.GiwaHonors,
      deployed.GiwaBoxes,
      deployed.GiwaHearth,
      deployed.GiwaWorkshop,
      deployed.GiwaBoss,
    ],
  },
  // v4 장터 묶음 — 둘을 함께, 이 순서로 배포한다(장터가 바로 다음 nonce 의 흥정 주소를 고정한다)
  {
    file: "GiwaMarketV4.sol",
    name: "GiwaMarketV4",
    out: "marketV4.ts",
    prefix: "MARKET_V4",
    optimize: true,
    args: (_deployed, predict) => [predict(1)],
  },
  {
    file: "GiwaOffersV2.sol",
    name: "GiwaOffersV2",
    out: "offersV2.ts",
    prefix: "OFFERS_V2",
    optimize: true,
    args: (deployed) => [deployed.GiwaMarketV4],
  },
];

// 현재 config가 배포 주소의 원본이다. 부분 재배포 시 생성자 인자와 마이그레이션
// 원본으로 쓰고, 각 배포가 확정될 때 해당 config를 새 주소로 갱신한다.
const deployed = { ...deployedAddresses };
const only = process.argv.slice(2);
const known = new Set(TARGETS.map((target) => target.name));
const unknown = only.filter((name) => !known.has(name));
if (unknown.length) {
  throw new Error(`[deploy] 알 수 없는 컨트랙트: ${unknown.join(", ")}`);
}
const marketBundle = ["GiwaMarketV4", "GiwaOffersV2"];
if (marketBundle.some((name) => only.includes(name)) && !marketBundle.every((name) => only.includes(name))) {
  throw new Error(`[deploy] 장터 v4 는 흥정 v2 와 함께 배포해야 합니다: ${marketBundle.join(" ")}`);
}
// 생성자에 주소를 고정하는 것끼리 — 앞의 것을 바꾸면 뒤의 것도 다시 지어야 옛 주소를 붙들지 않는다
const DEPENDENTS = {
  GiwaHearth: ["GiwaBoss", "GiwaProfile"],
  GiwaBoss: ["GiwaProfile"],
  GiwaBoxes: ["GiwaProfile"],
  GiwaWorkshop: ["GiwaProfile"],
  GiwaHonors: ["GiwaProfile"],
};
for (const name of only) {
  const missing = (DEPENDENTS[name] ?? []).filter((dep) => !only.includes(dep));
  if (missing.length) {
    throw new Error(`[deploy] ${name} 을 바꾸면 ${missing.join(" ")} 도 함께 배포해야 합니다`);
  }
}
if (only.includes("GiwaHearth") && !deployed.GiwaIdentity && !only.includes("GiwaIdentity")) {
  throw new Error("[deploy] 모닥불 v2 는 호패(GiwaIdentity)를 읽습니다 — 호패를 먼저(또는 함께) 배포하세요");
}
const guildBundle = ["GiwaGuilds", "GiwaHonors", "GiwaBoss", "GiwaProfile"];
if (only.includes("GiwaGuilds")) {
  const missing = guildBundle.filter((name) => !only.includes(name));
  if (missing.length) {
    throw new Error(
      `[deploy] GiwaGuilds 교체는 종속 컨트랙트와 함께 해야 합니다: ${guildBundle.join(" ")}`,
    );
  }
}

const giwaSepolia = defineChain({
  id: 91342,
  name: "GIWA Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://sepolia-rpc.giwa.io"] } },
  testnet: true,
});

// --- 컴파일 (test:local 과 같은 함수 · 계약마다 optimizer 설정을 따른다) ---
const artifacts = compileAll(TARGETS);
for (const t of TARGETS) {
  const { runtimeSize } = artifacts[t.name];
  console.log(
    `[compile] ${t.name} — runtime ${runtimeSize} bytes${t.optimize ? " · optimizer" : ""}` +
      (runtimeSize > MAX_CODE ? " ⚠ runtime 24KB 초과!" : ""),
  );
  if (runtimeSize > MAX_CODE) throw new Error(`[compile] ${t.name} 런타임 코드 크기 초과`);
}

// --- 배포 (순차 — 같은 지갑 nonce 충돌 방지) ---
const wallets = JSON.parse(
  fs.readFileSync(path.resolve(ROOT, ".testwallets.json"), "utf8"),
);
const A = wallets.find((w) => w.slot === "A");
const account = privateKeyToAccount(A.privateKey);
const pub = createPublicClient({ chain: giwaSepolia, transport: http() });
const wallet = createWalletClient({ account, chain: giwaSepolia, transport: http() });

const balance = await pub.getBalance({ address: account.address });
console.log(`[deploy] 배포자 슬롯 A (${account.address}) 잔액 ${formatEther(balance)} ETH`);
const chainId = await pub.getChainId();
if (chainId !== giwaSepolia.id) {
  throw new Error(`[deploy] 체인 ID 불일치: 기대 ${giwaSepolia.id}, 실제 ${chainId}`);
}
if (balance === 0n) {
  throw new Error("슬롯 A에 GIWA Sepolia ETH가 없습니다.");
}

for (const t of TARGETS) {
  if (only.length && !only.includes(t.name)) continue;
  const { abi, bytecode } = artifacts[t.name];
  const nonce = await pub.getTransactionCount({ address: account.address, blockTag: "pending" });
  const predict = (k) => getContractAddress({ from: account.address, nonce: BigInt(nonce + k) });
  const hash = await wallet.deployContract({
    abi,
    bytecode,
    account,
    args: t.args ? t.args(deployed, predict) : [],
  });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  const address = receipt.contractAddress;
  if (receipt.status !== "success" || !address) {
    throw new Error(`[deploy] ${t.name} 배포 실패: ${hash}`);
  }
  deployed[t.name] = address;
  console.log(`[deploy] ${t.name}: https://sepolia-explorer.giwa.io/address/${address}`);

  const ts = `// 자동 생성 파일 — scripts/deploy-village.mjs 가 기록한다. 직접 수정 금지.
export const ${t.prefix}_ADDRESS = ${JSON.stringify(address)} as \`0x\${string}\`;
export const ${t.prefix}_DEPLOY_TX = ${JSON.stringify(hash)};
export const ${t.prefix}_DEPLOY_BLOCK = ${receipt.blockNumber.toString()}n;
export const ${t.prefix}_ABI = ${JSON.stringify(abi, null, 2)} as const;
`;
  fs.writeFileSync(
    path.resolve(ROOT, "client", "src", "config", t.out),
    ts,
    "utf8",
  );
  console.log(`[deploy] client/src/config/${t.out} 갱신`);
}
if (only.includes("GiwaMarketV4")) {
  // 장터가 고정한 흥정 주소가 실제로 배포된 흥정 v2 인가 — 어긋나면 흥정 수락이 영영 막힌다
  const fixed = await pub.readContract({
    address: deployed.GiwaMarketV4,
    abi: artifacts.GiwaMarketV4.abi,
    functionName: "offers",
  });
  if (fixed.toLowerCase() !== deployed.GiwaOffersV2.toLowerCase()) {
    throw new Error(`[deploy] 장터 v4 의 offers(${fixed}) ≠ 흥정 v2(${deployed.GiwaOffersV2}) — 둘 다 다시 배포하세요`);
  }
  console.log("[deploy] 장터 v4 ↔ 흥정 v2 연결 확인");
}
console.log("[deploy] 완료");
