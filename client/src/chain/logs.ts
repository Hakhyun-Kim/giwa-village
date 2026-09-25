// 긴 구간의 이벤트 조회 — 배포 블록부터 지금까지(수백만 블록)를 한 번에 훑는 자리.
// 공개 RPC 의 eth_getLogs 는 한 번에 1만 블록까지만 받으므로, 먼저 GIWA Sepolia 의
// Blockscout(익스플로러) API 로 묻고, 안 되면 RPC 를 1만 블록씩 잘라 묻는다.
import {
  encodeEventTopics,
  parseEventLogs,
  type AbiEvent,
  type Hex,
  type Log,
} from "viem";
import { publicClient } from "../wallet/wallet";
import { giwaSepolia } from "../config/giwa";

/** 공개 RPC 가 한 번의 eth_getLogs 에 받아 주는 블록 수 */
const RPC_SPAN = 10_000n;
/** 잘라 묻기의 동시 요청 수 — 공개 RPC 에 부담을 주지 않을 만큼 */
const RPC_PARALLEL = 4;
/** Blockscout 의 getLogs 한 번 응답 상한 — 이만큼 오면 마지막 블록부터 이어 묻는다 */
const EXPLORER_PAGE = 1000;

interface ScanOptions<E extends AbiEvent> {
  address: `0x${string}`;
  event: E;
  args?: Record<string, unknown>;
  fromBlock: bigint;
}

/** 이벤트를 배포 블록부터 지금까지 모은다(블록 순). 반환 모양은 viem getLogs 와 같다. */
export async function scanLogs<E extends AbiEvent>(opts: ScanOptions<E>) {
  try {
    return await viaExplorer(opts);
  } catch {
    return await viaChunkedRpc(opts);
  }
}

type Parsed<E extends AbiEvent> = ReturnType<typeof parseEventLogs<[E]>>;

async function viaExplorer<E extends AbiEvent>(opts: ScanOptions<E>): Promise<Parsed<E>> {
  const topics = encodeEventTopics({
    abi: [opts.event] as AbiEvent[],
    eventName: opts.event.name,
    args: opts.args as never,
  }) as (Hex | Hex[] | null)[];
  const base = `${giwaSepolia.blockExplorers.default.url}/api`;
  const raw: Log[] = [];
  const seen = new Set<string>();
  let from = opts.fromBlock;
  for (let page = 0; page < 50; page++) {
    const q = new URLSearchParams({
      module: "logs",
      action: "getLogs",
      fromBlock: from.toString(),
      toBlock: "latest",
      address: opts.address,
    });
    topics.forEach((t, i) => {
      if (typeof t === "string") q.set(`topic${i}`, t);
    });
    for (let i = 0; i < topics.length; i++)
      for (let j = i + 1; j < topics.length; j++)
        if (typeof topics[i] === "string" && typeof topics[j] === "string")
          q.set(`topic${i}_${j}_opr`, "and");
    const res = await fetch(`${base}?${q}`);
    if (!res.ok) throw new Error(`explorer ${res.status}`);
    const body = (await res.json()) as { status?: string; message?: string; result?: unknown };
    // 결과가 없을 때 Blockscout 는 status "0" · message "No logs found" 와 빈 배열을 준다
    if (!Array.isArray(body.result)) throw new Error(`explorer: ${body.message ?? "bad body"}`);
    const rows = body.result as {
      address: string;
      topics: (Hex | null)[];
      data: Hex;
      blockNumber: Hex;
      transactionHash: Hex;
      logIndex: Hex;
      blockHash?: Hex;
      transactionIndex?: Hex;
    }[];
    for (const r of rows) {
      const key = `${r.transactionHash}:${r.logIndex}`;
      if (seen.has(key)) continue;
      seen.add(key);
      raw.push({
        address: r.address as `0x${string}`,
        topics: r.topics.filter((t): t is Hex => !!t) as [Hex, ...Hex[]],
        data: r.data,
        blockNumber: BigInt(r.blockNumber),
        transactionHash: r.transactionHash,
        logIndex: Number(BigInt(r.logIndex || "0x0")),
        blockHash: (r.blockHash ?? null) as Hex,
        transactionIndex: r.transactionIndex ? Number(BigInt(r.transactionIndex)) : 0,
        removed: false,
      } as Log);
    }
    if (rows.length < EXPLORER_PAGE) break;
    // 상한만큼 왔다 — 마지막 블록부터 다시(같은 블록의 겹침은 seen 이 거른다)
    from = BigInt(rows[rows.length - 1].blockNumber);
  }
  raw.sort((a, b) =>
    a.blockNumber === b.blockNumber
      ? (a.logIndex ?? 0) - (b.logIndex ?? 0)
      : a.blockNumber! < b.blockNumber! ? -1 : 1,
  );
  return parseEventLogs({ abi: [opts.event] as [E], logs: raw, strict: false }) as Parsed<E>;
}

async function viaChunkedRpc<E extends AbiEvent>(opts: ScanOptions<E>) {
  const latest = await publicClient.getBlockNumber();
  const spans: [bigint, bigint][] = [];
  for (let a = opts.fromBlock; a <= latest; a += RPC_SPAN) {
    const b = a + RPC_SPAN - 1n;
    spans.push([a, b > latest ? latest : b]);
  }
  const chunks: Awaited<ReturnType<typeof getChunk>>[] = new Array(spans.length);
  async function getChunk([a, b]: [bigint, bigint]) {
    return publicClient.getLogs({
      address: opts.address,
      event: opts.event,
      args: opts.args as never,
      fromBlock: a,
      toBlock: b,
    });
  }
  let next = 0;
  await Promise.all(
    Array.from({ length: RPC_PARALLEL }, async () => {
      while (next < spans.length) {
        const i = next++;
        chunks[i] = await getChunk(spans[i]);
      }
    }),
  );
  return chunks.flat();
}
