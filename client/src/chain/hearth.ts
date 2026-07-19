// 모닥불(화로) + 장날: 함께 쬔 온기의 온체인 증명 (GiwaHearth)
import { publicClient, activeWalletClient, queueTx } from "../wallet/wallet";
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
}

// ---------- 장날 (토요일 21:00 KST = 12:00 UTC, 1시간) ----------

export function isMarketDayNow(now = Date.now()): boolean {
  const ts = Math.floor(now / 1000);
  const day = Math.floor(ts / 86400);
  const sec = ts % 86400;
  return day % 7 === 2 && sec >= 12 * 3600 && sec < 13 * 3600;
}

/** 다음 장날 시작까지 남은 ms (장날 중이면 0) */
export function msToMarketDay(now = Date.now()): number {
  if (isMarketDayNow(now)) return 0;
  const ts = Math.floor(now / 1000);
  const day = Math.floor(ts / 86400);
  for (let d = 0; d < 8; d++) {
    if ((day + d) % 7 === 2) {
      const start = (day + d) * 86400 + 12 * 3600;
      if (start * 1000 > now) return start * 1000 - now;
    }
  }
  return 0;
}

export function marketDayLabel(now = Date.now()): string {
  if (isMarketDayNow(now)) return "🏮 장날이 열렸습니다! (온기 2배)";
  const ms = msToMarketDay(now);
  const h = Math.floor(ms / 3600000);
  if (h >= 24) return `🏮 장날까지 ${Math.floor(h / 24)}일 ${h % 24}시간`;
  const m = Math.floor((ms % 3600000) / 60000);
  return `🏮 장날까지 ${h}시간 ${m}분`;
}
