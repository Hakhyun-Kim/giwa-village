// 검증 가능한 공정성 — 던전 원정 결과를 온체인 데이터만으로 제3자가 재현·검증한다.
//
// 등반 기록이 조작되지 않았다는 걸 증명하는 방법은 "믿어달라"가 아니라 "같은 계산을
// 남이 돌려서 같은 값이 나오는 것"이다. settleRun 트랜잭션의 입력(문 선택 배열)과
// 주차 시드(블록해시)만 있으면, 게임 서버도 클라이언트도 없이 @giwa-village/core 의
// resolveRun 으로 오른 층수를 그대로 재현해 온체인 RunSettled 이벤트와 대조한다.
// 서명·API 키·신뢰 불필요.
//
//   실행:  node scripts/verify-run.mjs                # 최근 원정들을 검증
//          node scripts/verify-run.mjs 0x<txHash>     # 특정 settleRun tx 검증
//          node scripts/verify-run.mjs --blocks 20000 # 스캔 범위(블록 수) 조정
//
// 한계: 던전(doorRoll)은 시드·선택만으로 완전 재현된다. 보스(strike)는 엔트로피에
// block.timestamp 가 섞여 아카이브 노드 없이는 과거 온기 재구성이 어려우므로 여기선
// 다루지 않는다 (docs/core-roadmap.md §5).
import { createPublicClient, defineChain, http, decodeFunctionData } from "viem";
import { resolveRun } from "../core/src/index.ts";
import { GUILDS_ADDRESS, GUILDS_ABI, GUILDS_DEPLOY_BLOCK } from "../client/src/config/guilds.ts";

/** RPC 범위 제한을 피해 청크로 나눠 이벤트를 모은다 */
async function scanEvents(pub, eventName, fromBlock, toBlock, chunk = 50000n) {
  const out = [];
  for (let from = fromBlock; from <= toBlock; from += chunk) {
    const to = from + chunk - 1n < toBlock ? from + chunk - 1n : toBlock;
    try {
      const ev = await pub.getContractEvents({
        address: GUILDS_ADDRESS,
        abi: GUILDS_ABI,
        eventName,
        fromBlock: from,
        toBlock: to,
      });
      out.push(...ev);
    } catch {
      /* 범위 거부 시 해당 청크만 건너뛴다 */
    }
  }
  return out;
}

const EPOCH_SECONDS = 604800n; // GiwaGuilds.EPOCH_SECONDS (7 days)

const giwaSepolia = defineChain({
  id: 91342,
  name: "GIWA Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://sepolia-rpc.giwa.io"] } },
  testnet: true,
});
const pub = createPublicClient({ chain: giwaSepolia, transport: http() });

// 색은 NO_COLOR/FORCE_COLOR=0 을 존중한다 — render-run.mjs 가 SVG 증거로 렌더할 때
// ANSI 이스케이프가 섞이지 않게 해야 한다.
const NO_COLOR = !!process.env.NO_COLOR || process.env.FORCE_COLOR === "0";
const GREEN = NO_COLOR ? "" : "\x1b[32m";
const RED = NO_COLOR ? "" : "\x1b[31m";
const DIM = NO_COLOR ? "" : "\x1b[2m";
const RST = NO_COLOR ? "" : "\x1b[0m";

/** settleRun tx + RunSettled 결과를 받아 코어로 재현·대조한다 */
async function verifyRun({ guildId, txHash, onchainClimbed, blockNumber }) {
  const [tx, block] = await Promise.all([
    pub.getTransaction({ hash: txHash }),
    pub.getBlock({ blockNumber }),
  ]);
  const { functionName, args } = decodeFunctionData({ abi: GUILDS_ABI, data: tx.input });
  if (functionName !== "settleRun") return null;
  const attempt = Number(args[0]);
  const picks = args[1].map(Number);

  const epoch = block.timestamp / EPOCH_SECONDS;
  const seed = await pub.readContract({
    address: GUILDS_ADDRESS,
    abi: GUILDS_ABI,
    functionName: "epochSeed",
    args: [epoch],
  });

  const sim = resolveRun(seed, guildId, attempt, picks);
  const matches = sim.ok && sim.climbed === Number(onchainClimbed);
  return {
    guildId: Number(guildId),
    attempt,
    doors: picks.length,
    reproduced: sim.climbed,
    onchain: Number(onchainClimbed),
    matches,
    seed,
    txHash,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const txArg = args.find((a) => /^0x[0-9a-fA-F]{64}$/.test(a));
  const blocksArg = Number(args[args.indexOf("--blocks") + 1]) || 15000;

  console.log(`\n검증 가능한 공정성 — 던전 원정 재현 (GIWA Sepolia)`);
  console.log(`${DIM}시드·문 선택만으로 코어(resolveRun)가 온체인 결과를 재현한다${RST}\n`);

  let targets = [];
  if (txArg) {
    const receipt = await pub.getTransactionReceipt({ hash: txArg });
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== GUILDS_ADDRESS.toLowerCase()) continue;
      try {
        const ev = await pub.getContractEvents({
          address: GUILDS_ADDRESS,
          abi: GUILDS_ABI,
          eventName: "RunSettled",
          blockHash: receipt.blockHash,
        });
        for (const e of ev)
          if (e.transactionHash.toLowerCase() === txArg.toLowerCase())
            targets.push({
              guildId: e.args.guildId,
              txHash: e.transactionHash,
              onchainClimbed: e.args.climbed,
              blockNumber: e.blockNumber,
            });
      } catch {
        /* skip */
      }
      break;
    }
  } else {
    const latest = await pub.getBlockNumber();
    // --blocks 를 주면 최근 N 블록만(빠름), 아니면 배포 블록부터 전체 청크 스캔
    const hasBlocks = args.includes("--blocks");
    const fromBlock = hasBlocks
      ? latest > BigInt(blocksArg)
        ? latest - BigInt(blocksArg)
        : 0n
      : GUILDS_DEPLOY_BLOCK;
    console.log(`${DIM}블록 ${fromBlock}~${latest} 에서 RunSettled 이벤트 스캔…${RST}`);
    const events = await scanEvents(pub, "RunSettled", fromBlock, latest);
    targets = events.slice(-10).map((e) => ({
      guildId: e.args.guildId,
      txHash: e.transactionHash,
      onchainClimbed: e.args.climbed,
      blockNumber: e.blockNumber,
    }));
  }

  if (targets.length === 0) {
    console.log(
      `\n${DIM}대상 원정이 없습니다 (최근 ${blocksArg} 블록에 RunSettled 없음).${RST}`,
    );
    console.log(
      `${DIM}특정 tx 를 넘겨 검증하려면:  node scripts/verify-run.mjs 0x<settleRun txHash>${RST}\n`,
    );
    return;
  }

  let okCount = 0;
  for (const t of targets) {
    const r = await verifyRun(t);
    if (!r) continue;
    if (r.matches) okCount++;
    // render-run.mjs 가 ✅/❌ 와 " — " 를 색으로 구분해 SVG 증거로 렌더한다
    const sym = r.matches ? "✅" : "❌";
    console.log(
      `  ${sym} 길드 #${r.guildId} 원정 #${r.attempt} · 문 ${r.doors}개 · ` +
        `재현 +${r.reproduced}층 ${r.matches ? "=" : "≠"} 온체인 +${r.onchain}층` +
        ` — 시드 ${r.seed.slice(0, 14)}… · tx ${r.txHash.slice(0, 14)}…`,
    );
  }

  console.log(
    `\n${okCount === targets.length ? GREEN : RED}` +
      `${okCount === targets.length ? "전부 통과" : "실패"} (${okCount}/${targets.length}건)` +
      `${RST} · 온체인과 바이트 단위로 재현 · 서버·신뢰 0`,
  );
  if (okCount !== targets.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error("verify-run 실패:", e.message);
  process.exitCode = 1;
});
