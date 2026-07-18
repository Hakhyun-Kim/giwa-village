// GIWA 테스트넷용 슬롯별(A~D) 테스트 지갑 생성기.
// 키는 저장소 루트 .testwallets.json(git 제외)에 저장되며,
// 개발 서버(:2567)의 /dev/wallets 엔드포인트로 클라이언트에 전달된다.
// Usage: node scripts/gen-wallets.mjs [--if-missing | --force]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = path.resolve(ROOT, ".testwallets.json");
const SLOTS = ["A", "B", "C", "D"];

const ifMissing = process.argv.includes("--if-missing");
const force = process.argv.includes("--force");

function printTable(wallets) {
  console.log("\n슬롯별 테스트 지갑 (.testwallets.json):");
  for (const w of wallets) {
    console.log(`  [${w.slot}] ${w.address}`);
  }
  console.log("\n테스트 ETH 받기 (주소를 붙여넣으세요):");
  console.log("  - GIWA Faucet  : https://faucet.giwa.io/           (0.005 ETH / 24h)");
  console.log("  - Nodit Faucet : https://faucet.lambda256.io/giwa-sepolia (0.01 ETH / 24h)");
  console.log("\n⚠ 테스트 전용 키입니다. 실제 자산을 절대 보내지 마세요.\n");
}

if (fs.existsSync(FILE) && !force) {
  const existing = JSON.parse(fs.readFileSync(FILE, "utf8"));
  if (ifMissing) {
    console.log("[wallets] 기존 .testwallets.json 재사용");
    process.exit(0);
  }
  printTable(existing);
  console.log("이미 존재합니다. 새로 만들려면 --force 를 사용하세요.");
  process.exit(0);
}

const wallets = SLOTS.map((slot) => {
  const privateKey = generatePrivateKey();
  return { slot, privateKey, address: privateKeyToAccount(privateKey).address };
});

fs.writeFileSync(FILE, JSON.stringify(wallets, null, 2) + "\n", "utf8");
console.log(`[wallets] 생성 완료 → ${FILE}`);
printTable(wallets);
