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
import { deployedAddresses } from "./lib/deployments.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAX_CODE = 24576; // EIP-170

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
  { file: "GiwaBoxes.sol", name: "GiwaBoxes", out: "boxes.ts", prefix: "BOXES" },
  { file: "GiwaHearth.sol", name: "GiwaHearth", out: "hearth.ts", prefix: "HEARTH" },
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
const guildBundle = ["GiwaGuilds", "GiwaHonors", "GiwaBoss", "GiwaProfile"];
if (only.includes("GiwaGuilds")) {
  const missing = guildBundle.filter((name) => !only.includes(name));
  if (missing.length) {
    throw new Error(
      `[deploy] GiwaGuilds 교체는 종속 컨트랙트와 함께 해야 합니다: ${guildBundle.join(" ")}`,
    );
  }
}

const require = createRequire(import.meta.url);
const solc = require("solc");

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
    outputSelection: {
      "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] },
    },
  },
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (output.errors ?? []).filter((e) => e.severity === "error");
if (errors.length) {
  for (const e of errors) console.error(e.formattedMessage);
  throw new Error("[compile] Solidity 컴파일 실패");
}
const artifacts = {};
for (const t of TARGETS) {
  const a = output.contracts[t.file][t.name];
  const initSize = a.evm.bytecode.object.length / 2;
  const runtimeSize = a.evm.deployedBytecode.object.length / 2;
  console.log(
    `[compile] ${t.name} — runtime ${runtimeSize} bytes · init ${initSize} bytes` +
      (runtimeSize > MAX_CODE ? " ⚠ runtime 24KB 초과!" : ""),
  );
  if (runtimeSize > MAX_CODE) throw new Error(`[compile] ${t.name} 런타임 코드 크기 초과`);
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
  const hash = await wallet.deployContract({
    abi,
    bytecode,
    account,
    args: t.args ? t.args(deployed) : [],
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
console.log("[deploy] 완료");
