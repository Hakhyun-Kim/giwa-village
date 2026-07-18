// 노점 온체인: 목록 동기화·개설·폐점·구매 (GiwaMarketV3)
import { decodeEventLog, formatEther, parseEther } from "viem";
import { publicClient, activeWalletClient, queueTx } from "../wallet/wallet";
import { MARKET_ADDRESS, MARKET_ABI } from "../config/market";
import { useStore } from "../state/store";
import type { Stall } from "../types";
import type { GiftResult } from "../wallet/wallet";
import { POS_SCALE, selfPos } from "./core";

interface ChainStallItem {
  name: string;
  emoji: string;
  price: bigint;
}
interface ChainStall {
  title: string;
  x: number;
  z: number;
  openedAt: bigint;
  open: boolean;
  items: readonly ChainStallItem[];
}

export async function syncStalls(): Promise<void> {
  const [owners, data] = (await publicClient.readContract({
    address: MARKET_ADDRESS,
    abi: MARKET_ABI,
    functionName: "openStalls",
  })) as [readonly `0x${string}`[], readonly ChainStall[]];

  const chainStalls: Stall[] = owners.map((owner, i) => {
    const d = data[i];
    const id = `oc-${owner.toLowerCase()}`;
    return {
      id,
      ownerAddress: owner,
      ownerName: `나그네-${owner.slice(2, 6)}`,
      title: d.title,
      x: d.x / POS_SCALE,
      z: d.z / POS_SCALE,
      items: d.items.map((it, j) => ({
        id: `${id}-${j}`,
        name: it.name,
        emoji: it.emoji,
        priceEth: formatEther(it.price),
      })),
      createdAt: Number(d.openedAt) * 1000,
    };
  });

  const s = useStore.getState();
  const my = s.walletAddress?.toLowerCase();
  const mineOnChain = my && chainStalls.some((st) => st.ownerAddress.toLowerCase() === my);
  s.setStalls([
    ...s.stalls.filter(
      (st) =>
        !st.id.startsWith("oc-") &&
        // 체인에 내 노점이 오르면 로컬 낙관적 사본은 제거
        !(mineOnChain && st.id === `s-${my.slice(2, 10)}`),
    ),
    ...chainStalls,
  ]);
}

export async function openStallOnChain(
  title: string,
  items: { name: string; emoji: string; priceEth: string }[],
): Promise<void> {
  const wc = activeWalletClient;
  if (!wc?.account) throw new Error("지갑이 없습니다.");
  const pos = selfPos.ref;
  const tx = await queueTx(() =>
    wc.writeContract({
      account: wc.account!,
      chain: wc.chain,
      address: MARKET_ADDRESS,
      abi: MARKET_ABI,
      functionName: "openStall",
      args: [
        title,
        Math.round((pos?.x ?? 0) * POS_SCALE),
        Math.round((pos?.z ?? 0) * POS_SCALE),
        items.map((it) => ({
          name: it.name,
          emoji: it.emoji,
          price: parseEther(it.priceEth),
        })),
      ],
    }),
  );
  await publicClient.waitForTransactionReceipt({ hash: tx });
  void syncStalls();
}

export async function closeStallOnChain(): Promise<void> {
  const wc = activeWalletClient;
  if (!wc?.account) return;
  const tx = await queueTx(() =>
    wc.writeContract({
      account: wc.account!,
      chain: wc.chain,
      address: MARKET_ADDRESS,
      abi: MARKET_ABI,
      functionName: "closeStall",
      args: [],
    }),
  );
  await publicClient.waitForTransactionReceipt({ hash: tx });
  void syncStalls();
}

/** 온체인 노점 상품 구매 — 컨트랙트가 가격을 강제한다 */
export async function buyStallOnChain(
  seller: string,
  index: number,
  priceEth: string,
): Promise<GiftResult> {
  const wc = activeWalletClient;
  if (!wc?.account) throw new Error("지갑이 연결되어 있지 않습니다.");
  const tx = await queueTx(() =>
    wc.writeContract({
      account: wc.account!,
      chain: wc.chain,
      address: MARKET_ADDRESS,
      abi: MARKET_ABI,
      functionName: "buyStall",
      args: [seller as `0x${string}`, index],
      value: parseEther(priceEth),
    }),
  );
  const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
  let purchaseId: number | undefined;
  let tokenId: string | undefined;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== MARKET_ADDRESS.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: MARKET_ABI, data: log.data, topics: log.topics });
      if (ev.eventName === "Purchased") {
        const args = ev.args as unknown as { purchaseId: bigint; tokenId: bigint };
        purchaseId = Number(args.purchaseId);
        tokenId = args.tokenId.toString();
      }
    } catch {
      // 다른 이벤트 무시
    }
  }
  return { tx, amountEth: priceEth, purchaseId, tokenId };
}
