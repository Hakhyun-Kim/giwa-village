// 로컬 체인 E2E — 가스가 무제한인 anvil 위에서 컨트랙트를 배포하고
// 노점 개설 → 흥정 → 상인 봇 수락까지 전 구간을 돌린다. 테스트넷 ETH를
// 한 방울도 쓰지 않으므로 몇 번을 돌려도 된다.
//
// anvil은 chain-id를 91342(GIWA Sepolia와 동일)로 띄운다 — 코드의 체인 가드가
// 그대로 통과해야 진짜 검증이 된다.
//
// Usage: npm run test:local
//
// anvil이 없으면 설치 방법만 안내하고 종료한다 (루트 npm ci에는 영향 없음).
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  createPublicClient, createWalletClient, defineChain, formatEther, http, parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.ANVIL_PORT || 8545);
const RPC = `http://127.0.0.1:${PORT}`;
const CHAIN_ID = 91342;

// anvil이 미리 넣어 주는 결정론적 계정 #0 (공개된 테스트 키 — 실자산 없음)
const ANVIL_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

let fails = 0;
const check = (label, ok, detail = "") => {
  console.log(`  ${ok ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) fails++;
};

// ── anvil 찾기 ─────────────────────────────────────────────────────────────

function findAnvil() {
  // 1) 로컬 npm 설치를 먼저 본다 — 경로가 확정적이고 shell을 거치지 않는다
  try {
    const pkg = require.resolve("@foundry-rs/anvil/package.json", { paths: [ROOT] });
    const bin = path.join(path.dirname(pkg), "bin.mjs");
    if (fs.existsSync(bin)) return { cmd: process.execPath, args: [bin], shell: false };
  } catch {
    /* 없으면 PATH로 */
  }
  // 2) Foundry를 직접 설치한 경우
  const onPath = spawnSync("anvil", ["--version"], { encoding: "utf8", shell: true });
  if (onPath.status === 0) return { cmd: "anvil", args: [], shell: true };
  return null;
}

const anvilBin = findAnvil();
if (!anvilBin) {
  console.log("로컬 체인 테스트를 건너뜁니다 — anvil이 없습니다.\n");
  console.log("설치 (둘 중 하나):");
  console.log("  1) npm i @foundry-rs/anvil --ignore-scripts --no-save");
  console.log("     --ignore-scripts: Windows에서 postinstall이 깨지므로");
  console.log("     --no-save: package.json을 건드리지 않는다 (CI 빌드 보호)");
  console.log("  2) Foundry 설치: https://getfoundry.sh\n");
  console.log("무가스 로직 테스트는 anvil 없이도 됩니다: npm test");
  process.exit(0);
}

// ── anvil 기동 ─────────────────────────────────────────────────────────────

console.log(`로컬 체인 E2E (anvil · chain-id ${CHAIN_ID} · 가스 무제한)\n`);

const anvilArgs = ["--chain-id", String(CHAIN_ID), "--port", String(PORT), "--silent"];
const anvil = spawn(
  anvilBin.cmd,
  [...(anvilBin.args ?? []), ...anvilArgs],
  { stdio: "ignore", shell: anvilBin.shell },
);
const stopAnvil = () => {
  try {
    anvil.kill();
  } catch {}
};
process.on("exit", stopAnvil);
process.on("SIGINT", () => {
  stopAnvil();
  process.exit(130);
});

const chain = defineChain({
  id: CHAIN_ID,
  name: "GIWA Local",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});
const pub = createPublicClient({ chain, transport: http(RPC) });

// 기동 대기
let up = false;
for (let i = 0; i < 40; i++) {
  try {
    if ((await pub.getChainId()) === CHAIN_ID) {
      up = true;
      break;
    }
  } catch {
    /* 아직 */
  }
  await new Promise((r) => setTimeout(r, 300));
}
if (!up) {
  console.error("anvil이 뜨지 않았습니다.");
  stopAnvil();
  process.exit(1);
}
check("anvil 기동", true, `chain-id ${CHAIN_ID} @ ${RPC}`);

// ── 컨트랙트 컴파일 · 배포 ─────────────────────────────────────────────────

const solc = require("solc");
const FILES = ["GiwaMarketV3.sol", "GiwaOffers.sol"];
const sources = {};
for (const f of FILES) {
  sources[f] = { content: fs.readFileSync(path.join(ROOT, "contracts", f), "utf8") };
}
const out = JSON.parse(
  solc.compile(
    JSON.stringify({
      language: "Solidity",
      sources,
      settings: {
        optimizer: { enabled: false, runs: 200 },
        outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
      },
    }),
  ),
);
const compileErrors = (out.errors ?? []).filter((e) => e.severity === "error");
if (compileErrors.length) {
  for (const e of compileErrors) console.error(e.formattedMessage);
  stopAnvil();
  process.exit(1);
}
check("컨트랙트 컴파일", true, FILES.join(", "));

const deployer = privateKeyToAccount(ANVIL_KEY);
const deployWallet = createWalletClient({ account: deployer, chain, transport: http(RPC) });

async function deploy(file, name, args = []) {
  const a = out.contracts[file][name];
  const hash = await deployWallet.deployContract({
    abi: a.abi,
    bytecode: `0x${a.evm.bytecode.object}`,
    args,
  });
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success" || !r.contractAddress) throw new Error(`${name} 배포 실패`);
  return { address: r.contractAddress, abi: a.abi };
}

const market = await deploy("GiwaMarketV3.sol", "GiwaMarketV3");
const offers = await deploy("GiwaOffers.sol", "GiwaOffers", [market.address]);
check("GiwaMarketV3 배포", true, market.address);
check("GiwaOffers 배포", true, offers.address);

// ── 지갑 준비 (anvil은 원하는 주소에 잔액을 그냥 넣어 줄 수 있다) ───────────

const npcs = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "npcs.json"), "utf8")).npcs;
const merchant = npcs.find((n) => n.id === "hyangdan");
const botWalletsFile = path.join(ROOT, ".botwallets.json");
if (!fs.existsSync(botWalletsFile)) {
  console.error("\n.botwallets.json이 없습니다 — `npm run playtest`를 한 번 실행하세요.");
  stopAnvil();
  process.exit(1);
}
const botWallets = JSON.parse(fs.readFileSync(botWalletsFile, "utf8"));
const merchantAcct = privateKeyToAccount(botWallets[merchant.walletIndex].privateKey);

// 손님 2명 — 봇의 손님별 쿨다운을 피하려면 서로 다른 지갑이어야 한다.
// anvil 계정 #1, #2의 공개 키다 (Foundry 문서에 그대로 실려 있는 값 —
// 실제 체인에서는 아무 자산도 없고, 로컬 노드 밖에서는 의미가 없다).
const buyerA = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
);
const buyerB = privateKeyToAccount(
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
);

async function fund(address) {
  await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "anvil_setBalance",
      params: [address, "0xde0b6b3a7640000"], // 1 ETH
    }),
  });
}
for (const a of [merchantAcct.address, buyerA.address, buyerB.address]) await fund(a);
check("지갑 충전 (anvil_setBalance)", true, "상인 + 손님 2명, 각 1 ETH");

// ── 노점 개설 ──────────────────────────────────────────────────────────────

const LIST = "0.001";
const merchantWallet = createWalletClient({ account: merchantAcct, chain, transport: http(RPC) });
await pub.waitForTransactionReceipt({
  hash: await merchantWallet.writeContract({
    address: market.address,
    abi: market.abi,
    functionName: "openStall",
    args: [
      merchant.stall,
      1350,
      -390,
      [{ name: "꼬치", emoji: "🍡", price: parseEther(LIST) }],
    ],
  }),
});
const stall = await pub.readContract({
  address: market.address,
  abi: market.abi,
  functionName: "stallOf",
  args: [merchantAcct.address],
});
check("노점 개설", stall.open && stall.items.length === 1, `${stall.title} · 꼬치 ${LIST} ETH`);

// ── 흥정 2건: 하한선 미만 / 흥정 구간 위 ───────────────────────────────────

const floorRatio = merchant.floorRatio; // 0.65
const LOWBALL = "0.0004"; // 40% — 하한선 미만
const GOOD = "0.0009"; // 90% — 결정론 중간값(82.5%) 이상

async function makeOffer(acct, amountEth) {
  const w = createWalletClient({ account: acct, chain, transport: http(RPC) });
  await pub.waitForTransactionReceipt({
    hash: await w.writeContract({
      address: offers.address,
      abi: offers.abi,
      functionName: "makeOffer",
      args: [merchantAcct.address, "꼬치"],
      value: parseEther(amountEth),
    }),
  });
}
await makeOffer(buyerA, LOWBALL);
await makeOffer(buyerB, GOOD);

const readOffers = () =>
  pub.readContract({
    address: offers.address,
    abi: offers.abi,
    functionName: "offersFor",
    args: [merchantAcct.address],
  });
let [ids, list] = await readOffers();
check("흥정 2건 접수", ids.length === 2, list.map((o) => formatEther(o.amount)).join(", "));

// ── 상인 봇 실행 (같은 코드, RPC와 주소만 로컬로) ──────────────────────────

console.log("\n상인 봇 실행:\n");
const botOut = execFileSync(
  process.execPath,
  [path.join(ROOT, "scripts", "merchant-bot.mjs"), "--npc", merchant.id, "--once"],
  {
    cwd: ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      GIWA_RPC_URL: RPC,
      GIWA_MARKET_ADDRESS: market.address,
      GIWA_OFFERS_ADDRESS: offers.address,
      ANTHROPIC_API_KEY: "", // 로컬 테스트는 결정론 경로만 — 모델 호출 없음
    },
  },
);
console.log(botOut.trim().split("\n").map((l) => "  " + l).join("\n"));

// ── 검증 ───────────────────────────────────────────────────────────────────

console.log("\n결과:");
[ids, list] = await readOffers();
const remaining = list.map((o) => formatEther(o.amount));
check(
  "하한선 미만(40%)은 거절되어 남아 있다",
  remaining.includes(LOWBALL),
  `남은 흥정: ${remaining.join(", ") || "없음"}`,
);
check("흥정 구간(90%)은 체결되어 사라졌다", !remaining.includes(GOOD));
check(
  "봇이 하한선 미만에 모델을 부르지 않았다",
  botOut.includes("하한선 미만"),
  "로그에 '하한선 미만' 표기",
);

// 판매자에게 대금이 실제로 들어왔는지 (에스크로 정산까지)
const merchantBal = await pub.getBalance({ address: merchantAcct.address });
check(
  "상인 잔액이 늘었다 (정산 확인)",
  merchantBal > parseEther("1.0"),
  `${formatEther(merchantBal)} ETH`,
);

console.log(`\n${"─".repeat(50)}`);
console.log(fails === 0 ? "전부 통과 · 테스트넷 가스 0" : `실패 ${fails}건`);
stopAnvil();
process.exit(fails === 0 ? 0 : 1);
