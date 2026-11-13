// 모닥불(화로) + 장날: 함께 쬔 온기의 온체인 증명 (GiwaHearth)
import { publicClient, activeWalletClient, queueTx } from "../wallet/wallet";
import { sfxWarm } from "../audio/sfx";
import { track } from "../net/analytics";
import { HEARTH_ADDRESS, HEARTH_ABI } from "../config/hearth";

export interface HearthStatus {
  window: number;
  joinedNow: boolean;
  count: number;
  prevClaimable: boolean;
  warmth: number;
}

export async function fetchHearth(who: string): Promise<HearthStatus> {
  const [w, joinedNow, cnt, prevClaimable, warmth] = (await publicClient.readContract({
    address: HEARTH_ADDRESS,
    abi: HEARTH_ABI,
    functionName: "statusOf",
    args: [who as `0x${string}`],
  })) as [bigint, boolean, number, boolean, number];
  return {
    window: Number(w),
    joinedNow,
    count: cnt,
    prevClaimable,
    warmth,
  };
}

export async function gatherHearth(): Promise<void> {
  const wc = activeWalletClient;
  if (!wc?.account) throw new Error("지갑이 없습니다.");
  track("sit");
  const tx = await queueTx(() =>
    wc.writeContract({
      account: wc.account!,
      chain: wc.chain,
      address: HEARTH_ADDRESS,
      abi: HEARTH_ABI,
      functionName: "gather",
      args: [],
    }),
  );
  await publicClient.waitForTransactionReceipt({ hash: tx });
}

export async function claimHearth(window: number): Promise<void> {
  const wc = activeWalletClient;
  if (!wc?.account) throw new Error("지갑이 없습니다.");
  const tx = await queueTx(() =>
    wc.writeContract({
      account: wc.account!,
      chain: wc.chain,
      address: HEARTH_ADDRESS,
      abi: HEARTH_ABI,
      functionName: "claim",
      args: [BigInt(window)],
    }),
  );
  await publicClient.waitForTransactionReceipt({ hash: tx });
  sfxWarm();
}

// 장날 판정 · 남은 시간 · 문구는 순수 모듈(marketDay.ts)에 있다 — npm test 가 그 함수를 그대로 불러 본다
export * from "./marketDay";
