// 복주머니: 무료·쿨다운·블록해시 개봉, 보상은 소울바운드 장신구 (GiwaBoxes)
import { decodeEventLog } from "viem";
import { publicClient, activeWalletClient, queueTx } from "../wallet/wallet";
import { BOXES_ADDRESS, BOXES_ABI } from "../config/boxes";
import { sfxJackpot, sfxSuccess } from "../audio/sfx";

// 등급 이름(커먼·레어·에픽)은 두지 않는다 — GiwaBoxes.reveal 의 굴림은 여덟 가지가
// 모두 1/8(32/256)로 나오므로, 등급을 붙이면 실제와 다른 희소성을 말하게 된다.
// 별조각(8)은 소리만 다르다(sfxJackpot) — 더 드문 것이 아니라 더 반짝이는 것이다.
export const TRINKET_DEFS = [
  { id: 1, emoji: "🪶", name: "깃털", color: "#d9c9a3" },
  { id: 2, emoji: "🐚", name: "조개", color: "#9ecbff" },
  { id: 3, emoji: "🌰", name: "도토리", color: "#b07a4a" },
  { id: 4, emoji: "🍀", name: "네잎클로버", color: "#7de08a" },
  { id: 5, emoji: "🦋", name: "나비", color: "#7db7ff" },
  { id: 6, emoji: "🎐", name: "풍경", color: "#8fe8e0" },
  { id: 7, emoji: "🌸", name: "꽃잎", color: "#ff9ec1" },
  { id: 8, emoji: "🌟", name: "별조각", color: "#ffd66b" },
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
        const kind = Number((ev.args as unknown as { kind: number }).kind);
        // 별조각은 소리로 먼저 안다 — 확률은 여덟 가지 모두 같고, 소리만 한 옥타브 위다
        if (kind === 8) sfxJackpot();
        else sfxSuccess();
        return kind;
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
