// 소울바운드 칭호: 온체인 조건 클레임·장착 + 코스메틱 정의 (GiwaHonors)
import { publicClient, activeWalletClient, queueTx } from "../wallet/wallet";
import { HONORS_ADDRESS, HONORS_ABI } from "../config/honors";

export const HONOR_DEFS = [
  { id: 1, emoji: "🧺", name: "개점", desc: "노점을 열어본 자", charm: "#ff9d4d" },
  { id: 2, emoji: "🏯", name: "길드 창설자", desc: "길드를 세운 자", charm: "#ffd66b" },
  { id: 3, emoji: "⛰️", name: "등반가", desc: "길드 최고 기록 10층 이상", charm: "#7de0c3" },
  { id: 4, emoji: "🌕", name: "고층 정복자", desc: "길드 최고 기록 30층 이상", charm: "#b48cff" },
  { id: 5, emoji: "🥇", name: "등반왕", desc: "이번 주 1위 길드의 길드원", charm: "#ff6b6b" },
] as const;

/** 장착 칭호의 부적(charm) 색 — 아바타 코스메틱 렌더용 */
export function honorCharmColor(id: number | undefined): string | null {
  return HONOR_DEFS.find((d) => d.id === id)?.charm ?? null;
}

export interface HonorProfile {
  mask: number;
  equipped: number;
  eligible: boolean[]; // HONOR_DEFS 순서
}

export async function fetchHonors(who: string): Promise<HonorProfile> {
  const [profile, ...elig] = await Promise.all([
    publicClient.readContract({
      address: HONORS_ADDRESS,
      abi: HONORS_ABI,
      functionName: "profileOf",
      args: [who as `0x${string}`],
    }) as Promise<[bigint, bigint]>,
    ...HONOR_DEFS.map(
      (d) =>
        publicClient.readContract({
          address: HONORS_ADDRESS,
          abi: HONORS_ABI,
          functionName: "eligible",
          args: [who as `0x${string}`, BigInt(d.id)],
        }) as Promise<boolean>,
    ),
  ]);
  return { mask: Number(profile[0]), equipped: Number(profile[1]), eligible: elig };
}

export async function honorWrite(functionName: "claim" | "equip", id: number): Promise<void> {
  const wc = activeWalletClient;
  if (!wc?.account) throw new Error("지갑이 없습니다.");
  const tx = await queueTx(() =>
    wc.writeContract({
      account: wc.account!,
      chain: wc.chain,
      address: HONORS_ADDRESS,
      abi: HONORS_ABI,
      functionName,
      args: [BigInt(id)],
    }),
  );
  await publicClient.waitForTransactionReceipt({ hash: tx });
}

/** 장착 칭호만 가볍게 조회 (피어 꾸미기용) */
export async function equippedHonorOf(addr: string): Promise<number> {
  const [, equipped] = (await publicClient.readContract({
    address: HONORS_ADDRESS,
    abi: HONORS_ABI,
    functionName: "profileOf",
    args: [addr as `0x${string}`],
  })) as [bigint, bigint];
  return Number(equipped);
}
