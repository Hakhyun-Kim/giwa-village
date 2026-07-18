// 흥정(오퍼): 제안 에스크로 → 판매자 수락 시 즉시 체결 (GiwaOffers)
import { formatEther, parseEther } from "viem";
import { publicClient, activeWalletClient, queueTx } from "../wallet/wallet";
import { OFFERS_ADDRESS, OFFERS_ABI } from "../config/offers";

export interface StallOffer {
  id: number;
  buyer: string;
  amountEth: string;
  itemName: string;
}

export async function makeOfferOnChain(
  seller: string,
  itemName: string,
  amountEth: string,
): Promise<`0x${string}`> {
  const wc = activeWalletClient;
  if (!wc?.account) throw new Error("지갑이 연결되어 있지 않습니다.");
  const value = parseEther(amountEth);
  if (value <= 0n) throw new Error("금액이 올바르지 않습니다.");
  const tx = await queueTx(() =>
    wc.writeContract({
      account: wc.account!,
      chain: wc.chain,
      address: OFFERS_ADDRESS,
      abi: OFFERS_ABI,
      functionName: "makeOffer",
      args: [seller as `0x${string}`, itemName],
      value,
    }),
  );
  await publicClient.waitForTransactionReceipt({ hash: tx });
  return tx;
}

export async function cancelOfferOnChain(id: number): Promise<void> {
  const wc = activeWalletClient;
  if (!wc?.account) throw new Error("지갑이 없습니다.");
  const tx = await queueTx(() =>
    wc.writeContract({
      account: wc.account!,
      chain: wc.chain,
      address: OFFERS_ADDRESS,
      abi: OFFERS_ABI,
      functionName: "cancelOffer",
      args: [BigInt(id)],
    }),
  );
  await publicClient.waitForTransactionReceipt({ hash: tx });
}

/** 판매자 수락 — 제안가로 즉시 체결 (buy→confirm→쿠폰 전달이 한 tx) */
export async function acceptOfferOnChain(id: number): Promise<void> {
  const wc = activeWalletClient;
  if (!wc?.account) throw new Error("지갑이 없습니다.");
  const tx = await queueTx(() =>
    wc.writeContract({
      account: wc.account!,
      chain: wc.chain,
      address: OFFERS_ADDRESS,
      abi: OFFERS_ABI,
      functionName: "acceptOffer",
      args: [BigInt(id)],
    }),
  );
  await publicClient.waitForTransactionReceipt({ hash: tx });
}

interface ChainOffer {
  buyer: `0x${string}`;
  seller: `0x${string}`;
  amount: bigint;
  active: boolean;
  itemName: string;
}

/** 판매자에게 걸린 활성 흥정 목록 */
export async function fetchOffersFor(seller: string): Promise<StallOffer[]> {
  const [ids, list] = (await publicClient.readContract({
    address: OFFERS_ADDRESS,
    abi: OFFERS_ABI,
    functionName: "offersFor",
    args: [seller as `0x${string}`],
  })) as [readonly bigint[], readonly ChainOffer[]];
  return ids.map((id, i) => ({
    id: Number(id),
    buyer: list[i].buyer,
    amountEth: formatEther(list[i].amount),
    itemName: list[i].itemName,
  }));
}
