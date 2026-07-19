// 랜덤박스: 무료·쿨다운·블록해시 개봉, 보상은 소울바운드 장신구 (GiwaBoxes)
import { decodeEventLog } from "viem";
import { publicClient, activeWalletClient, queueTx } from "../wallet/wallet";
import { BOXES_ADDRESS, BOXES_ABI } from "../config/boxes";

export const TRINKET_DEFS = [
  { id: 1, emoji: "🪶", name: "깃털", rarity: "커먼", color: "#d9c9a3" },
  { id: 2, emoji: "🐚", name: "조개", rarity: "커먼", color: "#9ecbff" },
  { id: 3, emoji: "🌰", name: "도토리", rarity: "커먼", color: "#b07a4a" },
  { id: 4, emoji: "🍀", name: "네잎클로버", rarity: "커먼", color: "#7de08a" },
  { id: 5, emoji: "🦋", name: "나비", rarity: "레어", color: "#7db7ff" },
  { id: 6, emoji: "🎐", name: "풍경", rarity: "레어", color: "#8fe8e0" },
  { id: 7, emoji: "🌸", name: "꽃잎", rarity: "레어", color: "#ff9ec1" },
  { id: 8, emoji: "🌟", name: "별조각", rarity: "에픽", color: "#ffd66b" },
] as const;

/** 장착 장신구의 모트 색 — 아바타 코스메틱 렌더용 */
export function trinketColor(id: number | undefined): string | null {
  return TRINKET_DEFS.find((d) => d.id === id)?.color ?? null;
}

export interface BoxProfile {
  mask: number;
  equipped: number;
  pendingBlock: number;
  nextOpenAt: number; // unix sec
}

export async function fetchBoxProfile(who: string): Promise<BoxProfile> {
  const [mask, equipped, pendingBlock, nextOpenAt] = (await publicClient.readContract({
    address: BOXES_ADDRESS,
    abi: BOXES_ABI,
    functionName: "profileOf",
    args: [who as `0x${string}`],
  })) as [bigint, number, bigint, bigint];
  return {
    mask: Number(mask),
    equipped,
    pendingBlock: Number(pendingBlock),
    nextOpenAt: Number(nextOpenAt),
  };
}

/** 장착 장신구만 가볍게 조회 (피어 꾸미기용) */
export async function equippedTrinketOf(addr: string): Promise<number> {
  const [, equipped] = (await publicClient.readContract({
    address: BOXES_ADDRESS,
    abi: BOXES_ABI,
    functionName: "profileOf",
    args: [addr as `0x${string}`],
  })) as [bigint, number, bigint, bigint];
  return equipped;
}

export async function openBoxOnChain(): Promise<void> {
  const wc = activeWalletClient;
  if (!wc?.account) throw new Error("지갑이 없습니다.");
  const tx = await queueTx(() =>
    wc.writeContract({
      account: wc.account!,
      chain: wc.chain,
      address: BOXES_ADDRESS,
      abi: BOXES_ABI,
      functionName: "openBox",
      args: [],
    }),
  );
  await publicClient.waitForTransactionReceipt({ hash: tx });
}

/** 개봉 — 결과 kind(1..8)를 반환 */
export async function revealBoxOnChain(): Promise<number> {
  const wc = activeWalletClient;
  if (!wc?.account) throw new Error("지갑이 없습니다.");
  const tx = await queueTx(() =>
    wc.writeContract({
      account: wc.account!,
      chain: wc.chain,
      address: BOXES_ADDRESS,
      abi: BOXES_ABI,
      functionName: "reveal",
      args: [],
    }),
  );
  const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
  for (const log of receipt.logs) {
    try {
      const ev = decodeEventLog({ abi: BOXES_ABI, data: log.data, topics: log.topics });
      if (ev.eventName === "BoxRevealed") {
        return Number((ev.args as unknown as { kind: number }).kind);
      }
    } catch {
      /* skip */
    }
  }
  return 0;
}

export async function equipTrinketOnChain(kind: number): Promise<void> {
  const wc = activeWalletClient;
  if (!wc?.account) throw new Error("지갑이 없습니다.");
  const tx = await queueTx(() =>
    wc.writeContract({
      account: wc.account!,
      chain: wc.chain,
      address: BOXES_ADDRESS,
      abi: BOXES_ABI,
      functionName: "equipTrinket",
      args: [kind],
    }),
  );
  await publicClient.waitForTransactionReceipt({ hash: tx });
}
