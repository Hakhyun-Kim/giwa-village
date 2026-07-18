// GiwaMarket 컨트랙트 컴파일(solc-js) + GIWA Sepolia 배포(슬롯 A 지갑).
// 결과는 client/src/config/market.ts 로 기록되어 클라이언트가 바로 사용한다.
// Usage: node scripts/deploy-market.mjs
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
const SRC = path.resolve(ROOT, "contracts", "GiwaMarketV2.sol");
const CONTRACT = "GiwaMarketV2";
const OUT_TS = path.resolve(ROOT, "client", "src", "config", "market.ts");

const giwaSepolia = defineChain({
  id: 91342,
  name: "GIWA Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://sepolia-rpc.giwa.io"] } },
  testnet: true,
});

// --- 컴파일 ---
const source = fs.readFileSync(SRC, "utf8");
const input = {
  language: "Solidity",
  sources: { [`${CONTRACT}.sol`]: { content: source } },
  settings: {
    // solc-js WASM이 V2+optimizer 조합에서 크래시 — 테스트넷이라 최적화 불필요
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
const artifact = output.contracts[`${CONTRACT}.sol`][CONTRACT];
const abi = artifact.abi;
const bytecode = "0x" + artifact.evm.bytecode.object;
console.log(`[compile] ${CONTRACT} — bytecode ${(bytecode.length - 2) / 2} bytes`);

// --- 배포 ---
const wallets = JSON.parse(
  fs.readFileSync(path.resolve(ROOT, ".testwallets.json"), "utf8"),
);
const A = wallets.find((w) => w.slot === "A");
const account = privateKeyToAccount(A.privateKey);
const pub = createPublicClient({ chain: giwaSepolia, transport: http() });
const wallet = createWalletClient({
  account,
  chain: giwaSepolia,
  transport: http(),
});

const balance = await pub.getBalance({ address: account.address });
console.log(`[deploy] 배포자 슬롯 A (${account.address}) 잔액 ${formatEther(balance)} ETH`);
if (balance === 0n) {
  console.error("슬롯 A에 GIWA Sepolia ETH가 없습니다.");
  process.exit(1);
}

const hash = await wallet.deployContract({ abi, bytecode, account });
console.log(`[deploy] tx: https://sepolia-explorer.giwa.io/tx/${hash}`);
const receipt = await pub.waitForTransactionReceipt({ hash });
const address = receipt.contractAddress;
console.log(`[deploy] 컨트랙트: https://sepolia-explorer.giwa.io/address/${address}`);

// --- 클라이언트 설정 기록 ---
const ts = `// 자동 생성 파일 — scripts/deploy-market.mjs 가 기록한다. 직접 수정 금지.
export const MARKET_ADDRESS = ${JSON.stringify(address)} as \`0x\${string}\`;
export const MARKET_DEPLOY_TX = ${JSON.stringify(hash)};
export const MARKET_DEPLOY_BLOCK = ${receipt.blockNumber.toString()}n;
export const MARKET_ABI = ${JSON.stringify(abi, null, 2)} as const;
`;
fs.writeFileSync(OUT_TS, ts, "utf8");
console.log(`[deploy] client/src/config/market.ts 갱신 완료`);
