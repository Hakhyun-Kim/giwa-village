// 객주 장부의 체인 읽기 — 장터 전체의 구매 · 흥정 공탁 · 컨트랙트 잔액을 모아 ledger/escrowBook 에 넘긴다.
// 읽기만 한다. 지갑이 없어도(첫 방문자 · 심사자) 열 수 있어야 하므로 publicClient 만 쓴다.
import { parseAbiItem, parseEther } from "viem";
import { publicClient } from "../wallet/wallet";
import { scanLogs } from "./logs";
import { MARKET_ADDRESS, MARKET_ABI, MARKET_DEPLOY_BLOCK } from "../config/market";
import { OFFERS_ADDRESS, OFFERS_ABI } from "../config/offers";
import { PURCHASED_EVENT } from "./ledger";
import { buildBook, couponKey, type Book, type RawOffer, type RawPurchase } from "../ledger/escrowBook";
import { DEMO_STALLS } from "../demo/demoData";

/** 주민 상인의 품목 — 가격이 체인이 아니라 이 클라이언트 코드에만 있다(guide/V4.md §1) */
const CLIENT_CATALOG = new Map(
  DEMO_STALLS.flatMap((s) =>
    s.items.map((it) => [`${s.ownerAddress.toLowerCase()}:${it.id}`, { name: `${it.emoji} ${it.name}`, price: parseEther(it.priceEth) }] as const),
  ),
);

const REFUNDED_EVENT = parseAbiItem(
  "event Refunded(uint256 indexed purchaseId, address indexed buyer, uint256 amount)",
);

/** 공개 RPC 에 한꺼번에 몰리지 않게 — logs.ts 의 잘라 묻기와 같은 폭 */
const PARALLEL = 4;

async function pool<T, R>(items: T[], fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(PARALLEL, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

export interface GaekjuSnapshot {
  book: Book;
  /** 장부를 지은 시각(초) — 화면이 "몇 초 전 기준"을 적는다 */
  at: number;
  block: bigint;
}

export async function loadGaekju(): Promise<GaekjuSnapshot> {
  const offersLower = OFFERS_ADDRESS.toLowerCase();
  // 한 블록에 못 박는다 — 잔액과 구매 목록을 서로 다른 순간에 읽으면, 그 사이의 거래 하나로
  // 대사가 어긋나 보인다. 이벤트도 이 블록까지만 센다.
  const block = await publicClient.getBlockNumber();
  const pin = { blockNumber: block };
  const upTo = <L extends { blockNumber: bigint | null }>(logs: L[]) =>
    logs.filter((l) => l.blockNumber !== null && l.blockNumber <= block);
  const [purchasedAll, refundedAll, marketBalance, offersBalance, offerCount] = await Promise.all([
    scanLogs({ address: MARKET_ADDRESS, event: PURCHASED_EVENT, fromBlock: MARKET_DEPLOY_BLOCK }),
    scanLogs({ address: MARKET_ADDRESS, event: REFUNDED_EVENT, fromBlock: MARKET_DEPLOY_BLOCK }),
    publicClient.getBalance({ address: MARKET_ADDRESS, ...pin }),
    publicClient.getBalance({ address: OFFERS_ADDRESS, ...pin }),
    publicClient.readContract({ address: OFFERS_ADDRESS, abi: OFFERS_ABI, functionName: "offerCount", ...pin }) as Promise<bigint>,
  ]);
  const purchasedLogs = upTo(purchasedAll);
  const refundedLogs = upTo(refundedAll);
  const refundedIds = new Set(refundedLogs.map((l) => Number(l.args.purchaseId)));

  // 구매 상태 — 이벤트는 '무엇을 샀나', purchaseOf 는 '지금 어디 있나'
  const purchaseState = await pool(purchasedLogs, async (l) => {
    const p = (await publicClient.readContract({
      address: MARKET_ADDRESS,
      abi: MARKET_ABI,
      functionName: "purchaseOf",
      args: [l.args.purchaseId!],
      ...pin,
    })) as readonly [string, string, bigint, bigint, boolean, boolean];
    return p;
  });

  // 근거 가격 — 판매자의 지금 노점 상품가, 없으면 리스팅가. (판매자, 품목)마다 한 번만 묻는다
  const stallBySeller = new Map<string, Promise<Map<string, bigint>>>();
  const stallPrices = (seller: string) => {
    const k = seller.toLowerCase();
    if (!stallBySeller.has(k)) {
      stallBySeller.set(
        k,
        (publicClient.readContract({
          address: MARKET_ADDRESS,
          abi: MARKET_ABI,
          functionName: "stallOf",
          args: [seller as `0x${string}`],
          ...pin,
        }) as Promise<{ items: readonly { name: string; price: bigint }[] }>)
          .then((s) => new Map(s.items.map((it) => [it.name, it.price])))
          .catch(() => new Map()),
      );
    }
    return stallBySeller.get(k)!;
  };
  const referencePrice = async (seller: string, itemId: string): Promise<bigint | null> => {
    const fromStall = (await stallPrices(seller)).get(itemId);
    if (fromStall !== undefined) return fromStall;
    const [price, active] = (await publicClient.readContract({
      address: MARKET_ADDRESS,
      abi: MARKET_ABI,
      functionName: "listingOf",
      args: [seller as `0x${string}`, itemId],
      ...pin,
    })) as readonly [bigint, boolean];
    return active ? price : null;
  };

  const purchases: RawPurchase[] = await pool(purchasedLogs.map((l, i) => [l, purchaseState[i]] as const), async ([l, p]) => {
    const id = Number(l.args.purchaseId);
    const buyer = l.args.buyer ?? p[0];
    const seller = l.args.seller ?? p[1];
    const itemId = l.args.itemId ?? "";
    const viaOffer = buyer.toLowerCase() === offersLower;
    const catalog = CLIENT_CATALOG.get(`${seller.toLowerCase()}:${itemId}`);
    return {
      id,
      buyer,
      seller,
      itemId,
      tokenId: l.args.tokenId ?? 0n,
      amount: p[2],
      releaseAt: Number(p[3]),
      settled: p[4],
      disputed: p[5],
      refunded: refundedIds.has(id),
      viaOffer,
      // 흥정은 값을 합의로 정한다 — 근거 가격을 묻지 않는다
      referencePrice: viaOffer ? null : await referencePrice(seller, itemId).catch(() => null),
      clientPrice: catalog?.price ?? null,
      label: catalog?.name,
      tx: l.transactionHash ?? undefined,
    };
  });

  const offers: RawOffer[] = await pool(
    Array.from({ length: Number(offerCount) }, (_, i) => i),
    async (i) => {
      const o = (await publicClient.readContract({
        address: OFFERS_ADDRESS,
        abi: OFFERS_ABI,
        functionName: "offerAt",
        args: [BigInt(i)],
        ...pin,
      })) as { amount: bigint; active: boolean };
      return { id: i, amount: o.amount, active: o.active };
    },
  );

  // 환불된 건의 쿠폰이 아직 구매자에게 있는가
  const refundedPairs = [
    ...new Map(
      purchases.filter((p) => p.refunded).map((p) => [couponKey(p.buyer, p.tokenId), p] as const),
    ).values(),
  ];
  const couponBalances: Record<string, bigint> = {};
  await pool(refundedPairs, async (p) => {
    couponBalances[couponKey(p.buyer, p.tokenId)] = (await publicClient.readContract({
      address: MARKET_ADDRESS,
      abi: MARKET_ABI,
      functionName: "balanceOf",
      args: [p.buyer as `0x${string}`, p.tokenId],
      ...pin,
    })) as bigint;
  });

  // 시각은 블록이 아니라 이 기기의 시계다 — 화면의 '정산 가능' 판정(SellerLedgerDialog)과 같은 기준
  const at = Math.floor(Date.now() / 1000);
  return {
    book: buildBook({ purchases, offers, marketBalance, offersBalance, couponBalances, now: at }),
    at,
    block,
  };
}
