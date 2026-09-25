// 판매자 장부: 내 노점의 온체인 판매·분쟁 목록 + 환불 (GiwaMarketV3)
import { formatEther, parseAbiItem } from "viem";
import { publicClient, activeWalletClient, queueTx } from "../wallet/wallet";
import { scanLogs } from "./logs";
import { MARKET_ADDRESS, MARKET_ABI, MARKET_DEPLOY_BLOCK } from "../config/market";

export const PURCHASED_EVENT = parseAbiItem(
  "event Purchased(address indexed buyer, address indexed seller, string itemId, uint256 amount, uint256 indexed purchaseId, uint256 tokenId)",
);

export interface SellerSale {
  purchaseId: number;
  itemName: string;
  amountEth: string;
  buyer: string;
  settled: boolean;
  disputed: boolean;
  /** 이 시각(초) 뒤로는 누구나 release 로 정산할 수 있다 — 저절로 되지는 않는다 */
  releaseAt: number;
  tx: string;
}

export async function fetchMySales(me: string): Promise<SellerSale[]> {
  const logs = await scanLogs({
    address: MARKET_ADDRESS,
    event: PURCHASED_EVENT,
    args: { seller: me as `0x${string}` },
    fromBlock: MARKET_DEPLOY_BLOCK,
  });
  const sales = await Promise.all(
    logs.map(async (l) => {
      const p = (await publicClient.readContract({
        address: MARKET_ADDRESS,
        abi: MARKET_ABI,
        functionName: "purchaseOf",
        args: [l.args.purchaseId!],
      })) as [string, string, bigint, bigint, boolean, boolean];
      return {
        purchaseId: Number(l.args.purchaseId),
        itemName: l.args.itemId ?? "",
        amountEth: formatEther(l.args.amount ?? 0n),
        buyer: l.args.buyer ?? "",
        settled: p[4],
        disputed: p[5],
        releaseAt: Number(p[3]),
        tx: l.transactionHash,
      };
    }),
  );
  return sales.reverse();
}

/** 정산 받기 — 정산 가능 시각(구매 24시간 뒤, 분쟁 시 7일 뒤)이 지난 대금을 판매자에게 보낸다 */
export async function releaseSale(purchaseId: number): Promise<void> {
  const wc = activeWalletClient;
  if (!wc?.account) throw new Error("지갑이 없습니다.");
  const tx = await queueTx(() =>
    wc.writeContract({
      account: wc.account!,
      chain: wc.chain,
      address: MARKET_ADDRESS,
      abi: MARKET_ABI,
      functionName: "release",
      args: [BigInt(purchaseId)],
    }),
  );
  await publicClient.waitForTransactionReceipt({ hash: tx });
}

/** 판매자 환불 — 에스크로 대금을 구매자에게 돌려준다 */
export async function refundSale(purchaseId: number): Promise<void> {
  const wc = activeWalletClient;
  if (!wc?.account) throw new Error("지갑이 없습니다.");
  const tx = await queueTx(() =>
    wc.writeContract({
      account: wc.account!,
      chain: wc.chain,
      address: MARKET_ADDRESS,
      abi: MARKET_ABI,
      functionName: "refund",
      args: [BigInt(purchaseId)],
    }),
  );
  await publicClient.waitForTransactionReceipt({ hash: tx });
}
