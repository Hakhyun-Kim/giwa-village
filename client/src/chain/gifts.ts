// 쿠폰 선물: ERC-1155 전송 + 받은 쿠폰 체인 스캔 (GiwaMarketV3)
// 받은 쿠폰의 이름·이모지는 Purchased 이벤트(tokenId→상품명·판매자)로 복원한다
// — 서버도 localStorage 동기화도 필요 없다.
import { parseAbiItem } from "viem";
import { publicClient, activeWalletClient, queueTx } from "../wallet/wallet";
import { MARKET_ADDRESS, MARKET_ABI, MARKET_DEPLOY_BLOCK } from "../config/market";
import { useStore } from "../state/store";
import { PURCHASED_EVENT } from "./ledger";

const TRANSFER_SINGLE_EVENT = parseAbiItem(
  "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)",
);
const ZERO = "0x0000000000000000000000000000000000000000";

export interface ReceivedCoupon {
  tokenId: string;
  name: string;
  emoji: string;
  fromAddr: string;
  tx: string;
}

/** 쿠폰 1장을 다른 지갑에 선물한다 */
export async function giftCoupon(to: string, tokenId: string): Promise<`0x${string}`> {
  const wc = activeWalletClient;
  if (!wc?.account) throw new Error("지갑이 연결되어 있지 않습니다.");
  if (!/^0x[0-9a-fA-F]{40}$/.test(to)) throw new Error("받는 주소가 올바르지 않습니다.");
  const tx = await queueTx(() =>
    wc.writeContract({
      account: wc.account!,
      chain: wc.chain,
      address: MARKET_ADDRESS,
      abi: MARKET_ABI,
      functionName: "safeTransferFrom",
      args: [wc.account!.address, to as `0x${string}`, BigInt(tokenId), 1n, "0x"],
    }),
  );
  await publicClient.waitForTransactionReceipt({ hash: tx });
  return tx;
}

/** 남에게서 받은 쿠폰 — 아직 보유 중(잔고>0)인 것만 */
export async function fetchReceivedCoupons(me: string): Promise<ReceivedCoupon[]> {
  const incoming = await publicClient.getLogs({
    address: MARKET_ADDRESS,
    event: TRANSFER_SINGLE_EVENT,
    args: { to: me as `0x${string}` },
    fromBlock: MARKET_DEPLOY_BLOCK,
  });
  const gifts = incoming.filter(
    (l) => l.args.from && l.args.from.toLowerCase() !== ZERO,
  );
  if (gifts.length === 0) return [];

  // tokenId → 상품명·판매자 복원 (민팅 시점의 Purchased 이벤트)
  const purchases = await publicClient.getLogs({
    address: MARKET_ADDRESS,
    event: PURCHASED_EVENT,
    fromBlock: MARKET_DEPLOY_BLOCK,
  });
  const meta = new Map<string, { name: string; seller: string }>();
  for (const p of purchases) {
    if (p.args.tokenId !== undefined && p.args.itemId) {
      meta.set(p.args.tokenId.toString(), {
        name: p.args.itemId,
        seller: (p.args.seller ?? "").toLowerCase(),
      });
    }
  }

  const stalls = useStore.getState().stalls;
  const out: ReceivedCoupon[] = [];
  const seen = new Set<string>();
  for (const g of gifts.reverse()) {
    const id = g.args.id!.toString();
    if (seen.has(id)) continue;
    seen.add(id);
    const bal = (await publicClient.readContract({
      address: MARKET_ADDRESS,
      abi: MARKET_ABI,
      functionName: "balanceOf",
      args: [me as `0x${string}`, BigInt(id)],
    })) as bigint;
    if (bal === 0n) continue; // 이미 사용했거나 다시 선물함
    const m = meta.get(id);
    const stall = m
      ? stalls.find((s) => s.ownerAddress.toLowerCase() === m.seller)
      : undefined;
    const emoji = stall?.items.find((i) => i.name === m?.name)?.emoji ?? "🎁";
    out.push({
      tokenId: id,
      name: m?.name ?? "쿠폰",
      emoji,
      fromAddr: g.args.from!,
      tx: g.transactionHash,
    });
  }
  return out;
}
