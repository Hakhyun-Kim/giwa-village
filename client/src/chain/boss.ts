// 도깨비 토벌: 주간 보스 — 함께 때려잡는 동시성 코업 (GiwaBoss)
import { publicClient, activeWalletClient, queueTx } from "../wallet/wallet";
import { BOSS_ADDRESS, BOSS_ABI } from "../config/boss";
import { useStore } from "../state/store";

export interface BossStatus {
  week: number;
  remaining: number;
  slain: boolean;
  myContrib: number;
  nextStrikeAt: number; // unix sec
  prevClaimable: boolean;
  trophies: number;
}

export const BOSS_MAX_HP = 2000;

export async function fetchBoss(who: string): Promise<BossStatus> {
  const [w, remaining, slain, myContrib, nextStrikeAt, prevClaimable, trophies] =
    (await publicClient.readContract({
      address: BOSS_ADDRESS,
      abi: BOSS_ABI,
      functionName: "statusOf",
      args: [who as `0x${string}`],
    })) as [bigint, bigint, boolean, bigint, bigint, boolean, number];
  return {
    week: Number(w),
    remaining: Number(remaining),
    slain,
    myContrib: Number(myContrib),
    nextStrikeAt: Number(nextStrikeAt),
    prevClaimable,
    trophies,
  };
}

export async function strikeBoss(): Promise<void> {
  const wc = activeWalletClient;
  if (!wc?.account) throw new Error("지갑이 없습니다.");
  const tx = await queueTx(() =>
    wc.writeContract({
      account: wc.account!,
      chain: wc.chain,
      address: BOSS_ADDRESS,
      abi: BOSS_ABI,
      functionName: "strike",
      args: [],
    }),
  );
  await publicClient.waitForTransactionReceipt({ hash: tx });
}

export async function claimBossTrophy(week: number): Promise<void> {
  const wc = activeWalletClient;
  if (!wc?.account) throw new Error("지갑이 없습니다.");
  const tx = await queueTx(() =>
    wc.writeContract({
      account: wc.account!,
      chain: wc.chain,
      address: BOSS_ADDRESS,
      abi: BOSS_ABI,
      functionName: "claimTrophy",
      args: [BigInt(week)],
    }),
  );
  await publicClient.waitForTransactionReceipt({ hash: tx });
}

/** 스토어 갱신 헬퍼 — 오케스트레이터·타격 후 호출 */
export async function refreshBoss(): Promise<void> {
  const my = useStore.getState().walletAddress;
  if (!my) return;
  try {
    const s = await fetchBoss(my);
    useStore.getState().setBoss({
      remaining: s.remaining,
      slain: s.slain,
      myContrib: s.myContrib,
      nextStrikeAt: s.nextStrikeAt,
      trophies: s.trophies,
    });
    if (s.prevClaimable) {
      await claimBossTrophy(s.week - 1);
      const id = useStore.getState().selfId;
      if (id) {
        useStore.getState().setEmote(id, "🏆");
        const at = useStore.getState().emotes[id]?.at;
        if (at) setTimeout(() => useStore.getState().clearEmote(id, at), 2600);
      }
    }
  } catch {
    /* 다음 폴에서 */
  }
}
