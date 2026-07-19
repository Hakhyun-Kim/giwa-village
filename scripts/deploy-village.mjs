// 풀온체인 마을 컨트랙트 일괄 배포: GiwaMarketV3 + GiwaGuilds + GiwaPresence
// (solc-js, optimizer off — WASM 크래시 회피) → 슬롯 A 지갑으로 순차 배포하고
// client/src/config/{market,guilds,presence}.ts 를 자동 갱신한다.
// Usage: node scripts/deploy-village.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatEther,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const require = createRequire(import.meta.url);
const solc = require("solc");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAX_CODE = 24576; // EIP-170

const TARGETS = [
  { file: "GiwaMarketV3.sol", name: "GiwaMarketV3", out: "market.ts", prefix: "MARKET" },
  { file: "GiwaGuilds.sol", name: "GiwaGuilds", out: "guilds.ts", prefix: "GUILDS" },
  { file: "GiwaPresence.sol", name: "GiwaPresence", out: "presence.ts", prefix: "PRESENCE" },
  {
    file: "GiwaHonors.sol",
    name: "GiwaHonors",
    out: "honors.ts",
    prefix: "HONORS",
    args: (deployed) => [deployed.GiwaMarketV3, deployed.GiwaGuilds],
  },
  {
    file: "GiwaOffers.sol",
    name: "GiwaOffers",
    out: "offers.ts",
    prefix: "OFFERS",
    args: (deployed) => [deployed.GiwaMarketV3],
  },
  { file: "GiwaBoxes.sol", name: "GiwaBoxes", out: "boxes.ts", prefix: "BOXES" },
  { file: "GiwaHearth.sol", name: "GiwaHearth", out: "hearth.ts", prefix: "HEARTH" },
  { file: "GiwaWorkshop.sol", name: "GiwaWorkshop", out: "workshop.ts", prefix: "WORKSHOP" },
  {
    file: "GiwaBoss.sol",
    name: "GiwaBoss",
    out: "boss.ts",
    prefix: "BOSS",
    args: (deployed) => [deployed.GiwaGuilds, deployed.GiwaHearth],
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
];

// 이미 배포된 주소 (부분 재배포 시 생성자 인자·유지용).
// 사용법: node scripts/deploy-village.mjs [컨트랙트명 ...] — 인자 없으면 전부.
const deployed = {
  GiwaMarketV3: "0x1f34506cda6619fc3124d68742a8fd5e7ba436e2",
  GiwaGuilds: "0x65e4de091071d2f0d47b24f1ada5c2c7ba2c7638",
  GiwaPresence: "0x4d600672cefae3c8462f3d9feb2cb739001e7a93",
  GiwaHonors: "0x7e230f68c4dabe64e6de231ea3085e50f0d5a57f",
  GiwaOffers: "0x534a29c47667b54eab6995517705cfbc423bb909",
  GiwaBoxes: "0xeb0349f00fc781c807b6d15c74d7f5fb15996b2e",
  GiwaHearth: "0xf780265d5f49abd8c7e5d18d81d33426f62f3365",
  GiwaWorkshop: "0x664762337e529f853949a94e6ed50e6d8016c975",
};
const only = process.argv.slice(2);

const giwaSepolia = defineChain({
  id: 91342,
  name: "GIWA Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://sepolia-rpc.giwa.io"] } },
  testnet: true,
});

// --- 컴파일 ---
const sources = {};
for (const t of TARGETS) {
  sources[t.file] = {
    content: fs.readFileSync(path.resolve(ROOT, "contracts", t.file), "utf8"),
  };
}
const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: false, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (output.errors ?? []).filter((e) => e.severity === "error");
if (errors.length) {
  for (const e of errors) console.error(e.formattedMessage);
  process.exit(1);
}
const artifacts = {};
for (const t of TARGETS) {
  const a = output.contracts[t.file][t.name];
  const size = a.evm.bytecode.object.length / 2;
  console.log(`[compile] ${t.name} — ${size} bytes${size > MAX_CODE ? " ⚠ 24KB 초과!" : ""}`);
  if (size > MAX_CODE) process.exit(1);
  artifacts[t.name] = { abi: a.abi, bytecode: "0x" + a.evm.bytecode.object };
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
if (balance === 0n) {
  console.error("슬롯 A에 GIWA Sepolia ETH가 없습니다.");
  process.exit(1);
}

for (const t of TARGETS) {
  if (only.length && !only.includes(t.name)) continue;
  const { abi, bytecode } = artifacts[t.name];
  const hash = await wallet.deployContract({
    abi,
    bytecode,
    account,
    args: t.args ? t.args(deployed) : [],
  });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  const address = receipt.contractAddress;
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
console.log("[deploy] 완료");
