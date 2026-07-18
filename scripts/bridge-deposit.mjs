// Sepolia ETH → GIWA Sepolia 브리지 입금.
// L1StandardBridge로 ETH를 보내면 1~3분 뒤 같은 주소의 GIWA Sepolia 잔액으로 들어온다.
// Usage: node scripts/bridge-deposit.mjs <슬롯 A~D> [금액ETH=0.01]
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
import { sepolia } from "viem/chains";

// https://docs.giwa.io/network-information/contracts.md
const L1_STANDARD_BRIDGE = "0x77b2ffc0F57598cAe1DB76cb398059cF5d10A7E7";
const SEPOLIA_RPC =
  process.env.SEPOLIA_RPC ?? "https://ethereum-sepolia-rpc.publicnode.com";

const giwaSepolia = defineChain({
  id: 91342,
  name: "GIWA Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://sepolia-rpc.giwa.io"] } },
  testnet: true,
});

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const slot = (process.argv[2] ?? "").toUpperCase();
const amount = process.argv[3] ?? "0.01";

if (!/^[A-D]$/.test(slot)) {
  console.log("Usage: node scripts/bridge-deposit.mjs <슬롯 A~D> [금액ETH=0.01]");
  process.exit(1);
}

const walletsFile = path.resolve(ROOT, ".testwallets.json");
if (!fs.existsSync(walletsFile)) {
  console.error("`.testwallets.json`이 없습니다. 먼저 `npm run wallets`를 실행하세요.");
  process.exit(1);
}
const wallet = JSON.parse(fs.readFileSync(walletsFile, "utf8")).find(
  (w) => w.slot === slot,
);
const account = privateKeyToAccount(wallet.privateKey);

const l1 = createPublicClient({ chain: sepolia, transport: http(SEPOLIA_RPC) });
const l1Wallet = createWalletClient({
  account,
  chain: sepolia,
  transport: http(SEPOLIA_RPC),
});
const l2 = createPublicClient({ chain: giwaSepolia, transport: http() });

const value = parseEther(amount);
const l1Balance = await l1.getBalance({ address: account.address });
const l2Before = await l2.getBalance({ address: account.address });

console.log(`슬롯 ${slot} — ${account.address}`);
console.log(`  Sepolia(L1) 잔액 : ${formatEther(l1Balance)} ETH`);
console.log(`  GIWA(L2) 잔액    : ${formatEther(l2Before)} ETH`);

if (l1Balance < value + parseEther("0.001")) {
  console.error(
    `\nSepolia ETH가 부족합니다 (필요: ${amount} + 가스 여유분 0.001).`,
  );
  console.log("Sepolia ETH 받는 곳:");
  console.log("  - Google Cloud Faucet : https://cloud.google.com/application/web3/faucet/ethereum/sepolia");
  console.log("  - PoW Faucet(채굴형)  : https://sepolia-faucet.pk910.de/");
  console.log("  - Alchemy Faucet      : https://www.alchemy.com/faucets/ethereum-sepolia");
  process.exit(1);
}

console.log(`\n[bridge] ${amount} ETH → L1StandardBridge(${L1_STANDARD_BRIDGE})`);
const hash = await l1Wallet.sendTransaction({
  to: L1_STANDARD_BRIDGE,
  value,
});
console.log(`  L1 tx: https://sepolia.etherscan.io/tx/${hash}`);

const receipt = await l1.waitForTransactionReceipt({ hash });
console.log(`  L1 확정 (block ${receipt.blockNumber}). L2 반영 대기 중…`);

const deadline = Date.now() + 5 * 60_000;
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 15_000));
  const l2Now = await l2.getBalance({ address: account.address });
  process.stdout.write(`  GIWA 잔액: ${formatEther(l2Now)} ETH\r`);
  if (l2Now > l2Before) {
    console.log(`\n완료! GIWA Sepolia 잔액: ${formatEther(l2Now)} ETH`);
    process.exit(0);
  }
}
console.log("\n5분 내 반영을 확인하지 못했습니다. 잠시 후 대시보드에서 잔액을 확인하세요.");
