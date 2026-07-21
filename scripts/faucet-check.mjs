// 테스트 지갑 · 상인 봇 지갑 잔액 리포트 + 포셋 클레임 도우미.
// --open 시 포셋 페이지를 열고 대상 주소를 클립보드에 복사한다
// (클레임 클릭은 사용자가 직접 — 포셋 자동 클레임은 하지 않는다).
//
// Usage:
//   node scripts/faucet-check.mjs                    # 테스트 지갑 A~D 리포트
//   node scripts/faucet-check.mjs --bots             # + 상인 봇 지갑 리포트
//   node scripts/faucet-check.mjs --open --slot A    # Sepolia(L1) 포셋 열기
//   node scripts/faucet-check.mjs --open --bot hyangdan   # GIWA(L2) 포셋 열기
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createPublicClient, defineChain, formatEther, http, parseEther } from "viem";
import { sepolia } from "viem/chains";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GOOGLE_FAUCET = "https://cloud.google.com/application/web3/faucet/ethereum/sepolia";
const SEPOLIA_RPC =
  process.env.SEPOLIA_RPC ?? "https://ethereum-sepolia-rpc.publicnode.com";

// 이 아래로 떨어지면 조언 메시지를 출력한다
const L1_LOW = parseEther("0.011"); // 브리지 1회분(0.01) + 가스
const L2_LOW = parseEther("0.001");

const GIWA_FAUCET = "https://faucet.giwa.io";

const OPEN = process.argv.includes("--open");
const slotArg = process.argv[process.argv.indexOf("--slot") + 1];
const TARGET_SLOT =
  process.argv.includes("--slot") && /^[a-dA-D]$/.test(slotArg ?? "")
    ? slotArg.toUpperCase()
    : "A";
// --bot <npcId|index> 를 주면 상인 봇 지갑을 대상으로 GIWA(L2) 포셋을 연다.
// 봇은 L1을 거칠 이유가 없다 — 흥정 수락 tx 가스만 있으면 되므로 L2에 바로 받는다.
const botArg = process.argv.includes("--bot")
  ? process.argv[process.argv.indexOf("--bot") + 1]
  : null;
const SHOW_BOTS = process.argv.includes("--bots") || botArg !== null;

const giwaSepolia = defineChain({
  id: 91342,
  name: "GIWA Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://sepolia-rpc.giwa.io"] } },
  testnet: true,
});

const walletsFile = path.resolve(ROOT, ".testwallets.json");
if (!fs.existsSync(walletsFile)) {
  console.error("`.testwallets.json`이 없습니다. 먼저 `npm run wallets`를 실행하세요.");
  process.exit(1);
}
const wallets = JSON.parse(fs.readFileSync(walletsFile, "utf8"));

const l1 = createPublicClient({ chain: sepolia, transport: http(SEPOLIA_RPC) });
const l2 = createPublicClient({ chain: giwaSepolia, transport: http() });

function copyToClipboard(text) {
  const cmd =
    process.platform === "win32"
      ? "clip"
      : process.platform === "darwin"
        ? "pbcopy"
        : "xclip -selection clipboard";
  try {
    const p = spawn(cmd, { shell: true, stdio: ["pipe", "ignore", "ignore"] });
    p.stdin.end(text);
    return true;
  } catch {
    return false;
  }
}

function openBrowser(url) {
  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" });
  } else if (process.platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" });
  } else {
    spawn("xdg-open", [url], { detached: true, stdio: "ignore" });
  }
}

console.log(`잔액 리포트 (${new Date().toLocaleString("ko-KR")})\n`);
console.log("슬롯  주소           Sepolia(L1)      GIWA(L2)");

const advice = [];
for (const w of wallets) {
  let l1Bal = null;
  let l2Bal = null;
  try {
    l1Bal = await l1.getBalance({ address: w.address });
  } catch {}
  try {
    l2Bal = await l2.getBalance({ address: w.address });
  } catch {}

  const fmt = (v) => (v === null ? "조회실패" : formatEther(v));
  console.log(
    `  ${w.slot}   ${w.address.slice(0, 6)}…${w.address.slice(-4)}   ${fmt(l1Bal).padEnd(15)}  ${fmt(l2Bal)}`,
  );

  if (l2Bal !== null && l2Bal < L2_LOW) {
    if (l1Bal !== null && l1Bal >= L1_LOW) {
      advice.push(`[${w.slot}] L2 잔액 부족 → L1 재고 있음: npm run bridge -- ${w.slot} 0.01`);
    } else {
      advice.push(`[${w.slot}] L2 잔액 부족 → GIWA/Nodit 포셋 클레임 또는 L1 확보 후 브리지`);
    }
  }
}

// ── 상인 봇 지갑 (L2 가스만 필요) ──────────────────────────────────────────
// 봇은 흥정 수락 tx를 자기 지갑으로 보내므로 잔액 0이면 조용히 아무것도 못 한다.

const bots = [];
if (SHOW_BOTS) {
  const botsFile = path.resolve(ROOT, ".botwallets.json");
  const npcsFile = path.resolve(ROOT, "data", "npcs.json");
  if (!fs.existsSync(botsFile)) {
    console.log("\n`.botwallets.json`이 없습니다 — `npm run playtest` 최초 실행 시 생성됩니다.");
  } else {
    const botWallets = JSON.parse(fs.readFileSync(botsFile, "utf8"));
    const npcs = fs.existsSync(npcsFile)
      ? JSON.parse(fs.readFileSync(npcsFile, "utf8")).npcs.filter((n) => n.class === "merchant")
      : [];
    console.log("\n상인 봇 지갑 (GIWA L2 가스)\n");
    console.log("id          이름            주소             GIWA(L2)");
    for (const n of npcs) {
      const w = botWallets[n.walletIndex];
      if (!w) continue;
      let bal = null;
      try {
        bal = await l2.getBalance({ address: w.address });
      } catch {}
      bots.push({ ...n, address: w.address, balance: bal });
      console.log(
        `  ${n.id.padEnd(10)} ${n.name.padEnd(13)} ${w.address.slice(0, 6)}…${w.address.slice(-4)}   ` +
          (bal === null ? "조회실패" : formatEther(bal)),
      );
      if (bal !== null && bal < L2_LOW) {
        advice.push(`[${n.id}] ${n.name} 가스 부족 → 흥정 수락 tx를 보낼 수 없습니다`);
      }
    }
  }
}

if (advice.length) {
  console.log("\n조언:");
  for (const a of advice) console.log("  " + a);
  if (bots.some((b) => b.balance !== null && b.balance < L2_LOW)) {
    const funded = wallets.find((w) => w.slot === "A");
    console.log(
      `  ↳ 포셋은 주소당 24시간 제한이 있습니다. 슬롯 A(${funded?.slot ?? "A"})에 L2 잔액이 있으면\n` +
        "    포셋 대신 거기서 바로 보내는 편이 빠릅니다 — 상인 1명당 0.002면 충분합니다.",
    );
  }
}

if (OPEN) {
  // --bot 이 있으면 봇 지갑 + GIWA(L2) 포셋, 없으면 기존대로 슬롯 + Sepolia(L1) 포셋
  const bot = botArg
    ? bots.find((b) => b.id === botArg || String(b.walletIndex) === botArg)
    : null;
  if (botArg && !bot) {
    console.error(
      `\n--bot ${botArg} 를 찾지 못했습니다. 가능한 값: ${bots.map((b) => b.id).join(", ")}`,
    );
    process.exit(1);
  }

  const target = bot ?? wallets.find((w) => w.slot === TARGET_SLOT);
  const label = bot ? `${bot.name} (${bot.id})` : `슬롯 ${TARGET_SLOT}`;
  const url = bot ? GIWA_FAUCET : GOOGLE_FAUCET;
  const copied = copyToClipboard(target.address);

  console.log(`\n[open] ${bot ? "GIWA(L2)" : "Google Sepolia(L1)"} 포셋을 엽니다 → ${label} 대상`);
  console.log(`  주소${copied ? "가 클립보드에 복사되었습니다" : ""}: ${target.address}`);
  console.log("  포셋 페이지에서 Ctrl+V 로 붙여넣고 클레임 버튼만 누르면 됩니다.");
  if (!bot) console.log("  받은 뒤 GIWA로 옮기기: npm run bridge -- " + TARGET_SLOT + " 0.01");
  openBrowser(url);
}
