// 로컬 체인 하네스 — anvil 기동·컴파일·배포·시간 조작을 한곳에 모았다.
//
// 로컬 체인의 진짜 값어치는 "공짜"보다 **시간을 마음대로 돌릴 수 있다**는 데 있다.
// 장날(토 21시 KST), 도깨비 쿨다운 30초, 모닥불 10분 창, 주간 리셋 —
// 테스트넷에서는 실제로 그 시각이 될 때까지 기다려야만 확인할 수 있던 것들을
// 여기서는 초 단위로 점프해 검증한다.
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const require = createRequire(import.meta.url);
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CHAIN_ID = 91342; // GIWA Sepolia와 같게 — 코드의 체인 가드를 그대로 통과시킨다

/** anvil이 미리 넣어 주는 결정론적 계정 (Foundry 문서에 공개된 값 — 실자산 없음) */
export const ANVIL_KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
];

export function findAnvil() {
  try {
    const pkg = require.resolve("@foundry-rs/anvil/package.json", { paths: [ROOT] });
    const bin = path.join(path.dirname(pkg), "bin.mjs");
    if (fs.existsSync(bin)) return { cmd: process.execPath, args: [bin], shell: false };
  } catch {
    /* PATH로 */
  }
  const onPath = spawnSync("anvil", ["--version"], { encoding: "utf8", shell: true });
  if (onPath.status === 0) return { cmd: "anvil", args: [], shell: true };
  return null;
}

export function anvilMissingMessage() {
  return [
    "로컬 체인 테스트를 건너뜁니다 — anvil이 없습니다.",
    "",
    "설치 (둘 중 하나):",
    "  1) npm i @foundry-rs/anvil --ignore-scripts --no-save",
    "     --ignore-scripts: Windows에서 postinstall이 깨지므로",
    "     --no-save: package.json을 건드리지 않는다 (CI 빌드 보호)",
    "  2) Foundry 설치: https://getfoundry.sh",
    "",
    "무가스 로직 테스트는 anvil 없이도 됩니다: npm test",
  ].join("\n");
}

/** anvil을 띄우고 준비될 때까지 기다린다. */
export async function startChain({ port = 8545 } = {}) {
  const bin = findAnvil();
  if (!bin) return null;

  const rpc = `http://127.0.0.1:${port}`;
  const proc = spawn(
    bin.cmd,
    [...bin.args, "--chain-id", String(CHAIN_ID), "--port", String(port), "--silent"],
    { stdio: "ignore", shell: bin.shell },
  );

  const chain = defineChain({
    id: CHAIN_ID,
    name: "GIWA Local",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpc] } },
  });
  const pub = createPublicClient({ chain, transport: http(rpc) });

  let up = false;
  for (let i = 0; i < 50; i++) {
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

  const stop = () => {
    try {
      proc.kill();
    } catch {
      /* 이미 죽음 */
    }
  };
  process.on("exit", stop);

  if (!up) {
    stop();
    throw new Error("anvil이 기동하지 않았습니다.");
  }

  const rpcCall = async (method, params = []) => {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const j = await res.json();
    if (j.error) throw new Error(`${method}: ${j.error.message}`);
    return j.result;
  };

  return {
    rpc,
    chain,
    pub,
    stop,
    rpcCall,
    wallet: (key) =>
      createWalletClient({ account: privateKeyToAccount(key), chain, transport: http(rpc) }),
    /** 지정 주소에 잔액을 그대로 넣는다 (포셋도 브리지도 필요 없다) */
    fund: (address, wei = 10n ** 18n) =>
      rpcCall("anvil_setBalance", [address, `0x${wei.toString(16)}`]),
    mine: (n = 1) => rpcCall("anvil_mine", [`0x${n.toString(16)}`]),
    /** 상대 시간 점프 (초) */
    increaseTime: async (seconds) => {
      await rpcCall("evm_increaseTime", [seconds]);
      await rpcCall("anvil_mine", ["0x1"]);
    },
    /** 절대 시각으로 점프 (초 단위 unix). anvil은 과거로는 못 간다. */
    setTime: async (unixSeconds) => {
      await rpcCall("evm_setNextBlockTimestamp", [unixSeconds]);
      await rpcCall("anvil_mine", ["0x1"]);
    },
    now: async () => Number((await pub.getBlock()).timestamp),
  };
}

/** 마을 컨트랙트 전체. 순서·생성자 인자는 deploy-village.mjs와 같다. */
export const TARGETS = [
  { file: "GiwaMarketV3.sol", name: "GiwaMarketV3" },
  { file: "GiwaGuilds.sol", name: "GiwaGuilds" },
  { file: "GiwaPresence.sol", name: "GiwaPresence" },
  { file: "GiwaHonors.sol", name: "GiwaHonors", args: (d) => [d.GiwaMarketV3, d.GiwaGuilds] },
  { file: "GiwaOffers.sol", name: "GiwaOffers", args: (d) => [d.GiwaMarketV3] },
  { file: "GiwaBoxes.sol", name: "GiwaBoxes" },
  { file: "GiwaHearth.sol", name: "GiwaHearth" },
  { file: "GiwaWorkshop.sol", name: "GiwaWorkshop" },
  { file: "GiwaBoss.sol", name: "GiwaBoss", args: (d) => [d.GiwaGuilds, d.GiwaHearth] },
  {
    file: "GiwaProfile.sol",
    name: "GiwaProfile",
    args: (d) => [
      d.GiwaGuilds, d.GiwaHonors, d.GiwaBoxes, d.GiwaHearth, d.GiwaWorkshop, d.GiwaBoss,
    ],
  },
];

/** solc로 전부 컴파일 (deploy-village.mjs와 같은 설정 — optimizer off) */
export function compileAll(targets = TARGETS) {
  const solc = require("solc");
  const sources = {};
  for (const t of targets) {
    sources[t.file] = { content: fs.readFileSync(path.join(ROOT, "contracts", t.file), "utf8") };
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
  const errors = (out.errors ?? []).filter((e) => e.severity === "error");
  if (errors.length) {
    for (const e of errors) console.error(e.formattedMessage);
    throw new Error("컴파일 실패");
  }
  const artifacts = {};
  for (const t of targets) {
    const a = out.contracts[t.file][t.name];
    artifacts[t.name] = { abi: a.abi, bytecode: `0x${a.evm.bytecode.object}` };
  }
  return artifacts;
}

/** 의존 순서대로 순차 배포하고 이름 → {address, abi} 맵을 돌려준다 */
export async function deployAll(chain, deployerKey, artifacts, targets = TARGETS) {
  const wallet = chain.wallet(deployerKey);
  const addresses = {};
  const contracts = {};
  for (const t of targets) {
    const a = artifacts[t.name];
    const hash = await wallet.deployContract({
      abi: a.abi,
      bytecode: a.bytecode,
      args: t.args ? t.args(addresses) : [],
    });
    const r = await chain.pub.waitForTransactionReceipt({ hash });
    if (r.status !== "success" || !r.contractAddress) throw new Error(`${t.name} 배포 실패`);
    addresses[t.name] = r.contractAddress;
    contracts[t.name] = { address: r.contractAddress, abi: a.abi };
  }
  return contracts;
}

// ── 장날 시각 계산 ─────────────────────────────────────────────────────────
// 컨트랙트 규칙: day % 7 == 2 && 12시 ≤ 시각(UTC) < 13시
// (1970-01-01이 목요일이라 day%7==2가 토요일 · UTC 12시 = KST 21시)

/** 주어진 시각 이후 첫 장날 시작 시각(초). 컨트랙트 규칙을 그대로 옮긴 것. */
export function nextMarketDayStart(afterUnixSeconds) {
  const day = Math.floor(afterUnixSeconds / 86400);
  for (let d = 0; d < 9; d++) {
    if ((day + d) % 7 === 2) {
      const start = (day + d) * 86400 + 12 * 3600;
      if (start > afterUnixSeconds) return start;
    }
  }
  throw new Error("장날을 찾지 못했습니다");
}
