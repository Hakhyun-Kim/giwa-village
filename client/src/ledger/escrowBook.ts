// 객주 장부 — 장터 에스크로의 원장 계산. 체인도 viem 도 모르는 순수 모듈이다.
//
// 체인(GiwaMarketV3 · GiwaOffers)에서 읽은 날 데이터를 받아 다섯 가지를 낸다:
//   1. 거래마다의 상태(상태 머신의 어느 칸인가)
//   2. 분개(복식부기) — 구매 · 정산 · 환불이 어느 계정에서 어느 계정으로 옮기는가
//   3. 계정 잔액(T-계정) — 구매자 지급 · 에스크로 보관 · 판매자 정산 · 구매자 환불
//   4. 대사 — 컨트랙트의 실제 잔액 = 장부가 말하는 미정산 합계인가
//   5. 예외함 — 사람이 결정해야 하거나 정책(guide/V4.md)이 필요한 건
// 순수 모듈이라 npm test 가 그대로 걸어 본다. 화면(GaekjuDialog)은 이 결과를 그리기만 한다.

/** 상태 머신의 칸. 체인의 Purchase{settled, disputed, releaseAt} + Refunded 이벤트로 정해진다 */
export type PurchaseState =
  | "escrow" // 대금 보관 중 — 구매자 확정 또는 정산 가능 시각을 기다린다
  | "disputed" // 분쟁 보류 — 정산 가능 시각이 7일 뒤로 밀렸다
  | "releasable" // 정산 가능 — 누구나 release 를 부를 수 있지만 저절로 되지는 않는다
  | "settled" // 판매자에게 정산됨
  | "refunded"; // 구매자에게 환불됨

export const STATE_ORDER: PurchaseState[] = ["escrow", "disputed", "releasable", "settled", "refunded"];

export const STATE_LABEL: Record<PurchaseState, string> = {
  escrow: "보관 중",
  disputed: "분쟁 보류",
  releasable: "정산 가능",
  settled: "정산 완료",
  refunded: "환불 완료",
};

/** 체인에서 읽은 구매 한 건 (purchaseOf + Purchased · Refunded 이벤트) */
export interface RawPurchase {
  id: number;
  buyer: string;
  seller: string;
  itemId: string;
  tokenId: bigint;
  amount: bigint;
  /** 초 — 이 시각부터 release 가 된다 */
  releaseAt: number;
  settled: boolean;
  disputed: boolean;
  /** Refunded 이벤트가 있었는가 — 체인의 settled 는 정산과 환불 모두에서 true 가 된다 */
  refunded: boolean;
  /** 흥정(GiwaOffers)이 체결한 구매인가 — 이때 체인의 buyer 는 Offers 컨트랙트다 */
  viaOffer: boolean;
  /** 이 판매자 · 품목의 체인 기준 가격(노점 상품가 또는 리스팅가). 없으면 null */
  referencePrice: bigint | null;
  /** 화면(클라이언트 코드)에만 적힌 가격 — 주민 상인의 품목이 그렇다. 체인은 이 값을 모른다 */
  clientPrice?: bigint | null;
  /** 화면에 쓰는 품목 이름(itemId 가 "s-…-0" 같은 내부 id 일 때) */
  label?: string;
  tx?: string;
}

export interface RawOffer {
  id: number;
  amount: bigint;
  active: boolean;
}

export interface BookInput {
  purchases: RawPurchase[];
  offers: RawOffer[];
  /** GiwaMarketV3 의 실제 ETH 잔액(wei) */
  marketBalance: bigint;
  /** GiwaOffers 의 실제 ETH 잔액(wei) */
  offersBalance: bigint;
  /** 환불된 (구매자, tokenId) 별 지금 그 구매자가 가진 쿠폰 수. 키는 couponKey() */
  couponBalances: Record<string, bigint>;
  /** 초 */
  now: number;
}

export const couponKey = (buyer: string, tokenId: bigint) => `${buyer.toLowerCase()}:${tokenId}`;

export function stateOf(p: Pick<RawPurchase, "settled" | "disputed" | "refunded" | "releaseAt">, now: number): PurchaseState {
  if (p.settled) return p.refunded ? "refunded" : "settled";
  if (now >= p.releaseAt) return "releasable";
  return p.disputed ? "disputed" : "escrow";
}

/** 장부의 계정 — 돈이 머무는 자리 */
export type Account = "buyer" | "escrow" | "seller" | "refund";
export const ACCOUNT_LABEL: Record<Account, string> = {
  buyer: "구매자 지급",
  escrow: "에스크로 보관",
  seller: "판매자 정산",
  refund: "구매자 환불",
};

/** 분개 한 줄 — from 계정에서 to 계정으로 amount 가 옮겨 갔다 */
export interface JournalEntry {
  purchaseId: number;
  kind: "purchase" | "settle" | "refund";
  from: Account;
  to: Account;
  amount: bigint;
}

export type ExceptionKind =
  | "reconcile-market" // 컨트랙트 잔액 ≠ 미정산 합계
  | "reconcile-offers" // 흥정 공탁 잔액 ≠ 활성 제안 합계
  | "unclaimed" // 정산 가능한데 아무도 release 하지 않았다
  | "disputed" // 분쟁 보류 중
  | "refund-coupon-kept" // 환불됐는데 쿠폰이 구매자에게 남았다 (V4 §3)
  | "price-unbacked" // 체인에 근거 가격이 없는 구매 (V4 §1 — 1 wei 우회)
  | "price-mismatch"; // 근거 가격과 다른 금액

export interface BookException {
  kind: ExceptionKind;
  severity: "critical" | "warn" | "info";
  purchaseId?: number;
  amount: bigint;
  /** 화면에 그대로 쓰는 한 줄 */
  detail: string;
}

export interface Book {
  rows: (RawPurchase & { state: PurchaseState })[];
  byState: Record<PurchaseState, { count: number; amount: bigint }>;
  journal: JournalEntry[];
  accounts: Record<Account, bigint>;
  reconciliation: {
    market: { actual: bigint; expected: bigint; diff: bigint };
    offers: { actual: bigint; expected: bigint; diff: bigint };
  };
  exceptions: BookException[];
}

/** 날 데이터로 장부를 짓는다. 같은 입력이면 늘 같은 장부 — 시각도 입력으로 받는다 */
export function buildBook(input: BookInput): Book {
  const { now } = input;
  const rows = [...input.purchases]
    .sort((a, b) => a.id - b.id)
    .map((p) => ({ ...p, state: stateOf(p, now) }));

  const byState = Object.fromEntries(STATE_ORDER.map((s) => [s, { count: 0, amount: 0n }])) as Book["byState"];
  const journal: JournalEntry[] = [];
  const accounts: Record<Account, bigint> = { buyer: 0n, escrow: 0n, seller: 0n, refund: 0n };
  const move = (purchaseId: number, kind: JournalEntry["kind"], from: Account, to: Account, amount: bigint) => {
    journal.push({ purchaseId, kind, from, to, amount });
    // T-계정: 보관 계정은 들어오면 늘고 나가면 준다. 나머지 셋은 그 방향으로 흘러간 누계다
    if (from === "escrow") accounts.escrow -= amount;
    if (to === "escrow") accounts.escrow += amount;
    if (from === "buyer") accounts.buyer += amount;
    if (to === "seller") accounts.seller += amount;
    if (to === "refund") accounts.refund += amount;
  };

  for (const r of rows) {
    byState[r.state].count++;
    byState[r.state].amount += r.amount;
    move(r.id, "purchase", "buyer", "escrow", r.amount);
    if (r.state === "settled") move(r.id, "settle", "escrow", "seller", r.amount);
    if (r.state === "refunded") move(r.id, "refund", "escrow", "refund", r.amount);
  }

  const expectedMarket = accounts.escrow;
  const expectedOffers = input.offers.filter((o) => o.active).reduce((s, o) => s + o.amount, 0n);
  const reconciliation = {
    market: { actual: input.marketBalance, expected: expectedMarket, diff: input.marketBalance - expectedMarket },
    offers: { actual: input.offersBalance, expected: expectedOffers, diff: input.offersBalance - expectedOffers },
  };

  const exceptions: BookException[] = [];
  for (const [kind, rec, what] of [
    ["reconcile-market", reconciliation.market, "장터 에스크로"],
    ["reconcile-offers", reconciliation.offers, "흥정 공탁"],
  ] as const) {
    if (rec.diff === 0n) continue;
    exceptions.push({
      kind,
      // 모자라면 누군가의 돈을 내줄 수 없다 — 가장 무겁다. 남으면 출처 없는 돈이 들어온 것이다
      severity: rec.diff < 0n ? "critical" : "warn",
      amount: rec.diff < 0n ? -rec.diff : rec.diff,
      detail: rec.diff < 0n
        ? `${what} 잔액이 장부보다 모자랍니다 — 지급 불능 위험`
        : `${what} 잔액이 장부보다 많습니다 — 장부에 없는 입금(출처 확인 필요)`,
    });
  }

  // 같은 (구매자, 쿠폰)에 환불 아닌 구매가 몇 건 있는가 — 그만큼은 정당하게 가진 쿠폰이다
  const keptBase = new Map<string, number>();
  for (const r of rows) {
    if (r.viaOffer || r.state === "refunded") continue;
    const k = couponKey(r.buyer, r.tokenId);
    keptBase.set(k, (keptBase.get(k) ?? 0) + 1);
  }
  const refundedSeen = new Map<string, number>();

  for (const r of rows) {
    if (r.state === "releasable") {
      exceptions.push({
        kind: "unclaimed",
        severity: "info",
        purchaseId: r.id,
        amount: r.amount,
        detail: `정산 가능 시각이 ${formatAge(now - r.releaseAt)} 지났지만 대금이 아직 에스크로에 있습니다`,
      });
    }
    if (r.state === "disputed") {
      exceptions.push({
        kind: "disputed",
        severity: "warn",
        purchaseId: r.id,
        amount: r.amount,
        detail: `분쟁 보류 — ${formatAge(r.releaseAt - now)} 뒤 정산 가능. 그 전에 판매자 환불 또는 구매자 확정`,
      });
    }
    if (r.state === "refunded") {
      const k = couponKey(r.buyer, r.tokenId);
      const held = input.couponBalances[k];
      if (held !== undefined) {
        // 이 (구매자, 쿠폰)의 환불 건을 차례로 센다 — 정당분을 넘는 보유만 '남은 쿠폰'으로 본다
        const nth = (refundedSeen.get(k) ?? 0) + 1;
        refundedSeen.set(k, nth);
        if (held - BigInt(keptBase.get(k) ?? 0) >= BigInt(nth)) {
          exceptions.push({
            kind: "refund-coupon-kept",
            severity: "warn",
            purchaseId: r.id,
            amount: r.amount,
            detail: "대금은 환불됐는데 쿠폰이 구매자 지갑에 남아 있습니다 — 돈과 쿠폰을 함께 가진 상태",
          });
        }
      }
    }
    if (!r.viaOffer && r.state !== "refunded") {
      if (r.referencePrice === null) {
        const cp = r.clientPrice ?? null;
        exceptions.push({
          kind: "price-unbacked",
          // 화면 가격과도 다르면 누군가 화면을 거치지 않고 값을 정했다는 뜻이다
          severity: cp !== null && cp !== r.amount ? "warn" : "info",
          purchaseId: r.id,
          amount: r.amount,
          detail:
            cp === null
              ? "체인에도 화면에도 이 품목의 가격이 없습니다 — 구매자가 정한 금액으로 체결됐습니다"
              : cp === r.amount
                ? "화면 가격대로 체결됐지만, 그 가격은 클라이언트 코드에만 있습니다 — 체인은 금액을 강제하지 않았습니다"
                : "화면 가격과 다른 금액으로 체결됐습니다 — 체인에 가격이 없어 막지 못했습니다",
        });
      } else if (r.referencePrice !== r.amount) {
        exceptions.push({
          kind: "price-mismatch",
          severity: "info",
          purchaseId: r.id,
          amount: r.amount,
          detail: "지금 체인의 가격과 체결 금액이 다릅니다 — 그 뒤 가격이 바뀌었을 수 있습니다",
        });
      }
    }
  }

  const rank = { critical: 0, warn: 1, info: 2 } as const;
  exceptions.sort((a, b) => rank[a.severity] - rank[b.severity] || (a.purchaseId ?? -1) - (b.purchaseId ?? -1));
  return { rows, byState, journal, accounts, reconciliation, exceptions };
}

/** 초를 사람이 읽는 길이로 — "3일" · "5시간" · "12분" */
export function formatAge(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  if (s >= 86400) return `${Math.floor(s / 86400)}일`;
  if (s >= 3600) return `${Math.floor(s / 3600)}시간`;
  return `${Math.max(1, Math.floor(s / 60))}분`;
}

/** 예외 유형마다 — 누가 결정하고, 사용자에게 무엇을 보이며, 정책이 어디 적혀 있는가.
 *  화면과 정책 문서(guide/GAEKJU.md)가 같은 표를 읽도록 여기 한 곳에 둔다 */
export const EXCEPTION_POLICY: Record<ExceptionKind, { title: string; owner: string; user: string; policy: string }> = {
  "reconcile-market": {
    title: "대사 불일치 — 장터",
    owner: "운영 · 재무",
    user: "신규 구매를 멈추고 \"점검 중\"을 띄운다",
    policy: "V3 는 직접 송금을 받지 않는다(receive 없음). 차이가 나면 장부나 컨트랙트 둘 중 하나가 틀린 것이다",
  },
  "reconcile-offers": {
    title: "대사 불일치 — 흥정 공탁",
    owner: "운영 · 재무",
    user: "새 제안을 멈춘다. 걸어 둔 제안의 취소는 열어 둔다",
    policy: "공탁 잔액 = 활성 제안 합계여야 한다",
  },
  unclaimed: {
    title: "미수령 정산금",
    owner: "판매자 (누구나 실행 가능)",
    user: "판매 장부에 '정산 받기'",
    policy: "V4: withdrawReleased(ids[]) 로 한 번에 받는다. 체인에는 타이머가 없으므로 '자동 정산'이라 쓰지 않는다",
  },
  disputed: {
    title: "분쟁 보류",
    owner: "판매자 · 구매자 합의",
    user: "쿠폰함 · 판매 장부에 '분쟁 중'과 남은 기간",
    policy: "보류 7일. 전자상거래법 청약철회 7일과의 관계는 메인넷 전 법률 검토",
  },
  "refund-coupon-kept": {
    title: "환불 후 쿠폰 잔존",
    owner: "정책 (컨트랙트 변경)",
    user: "—",
    policy: "V4 §3: 정산 전까지 쿠폰을 계약이 보관하고, 환불이면 태운다",
  },
  "price-unbacked": {
    title: "근거 가격 없는 구매",
    owner: "정책 (컨트랙트 변경)",
    user: "—",
    policy: "V4 §1: 리스팅 없는 buy 는 되돌리고, 값을 정하지 않은 거래는 흥정만 지난다",
  },
  "price-mismatch": {
    title: "가격 불일치",
    owner: "확인만",
    user: "—",
    policy: "체결 시점 가격은 체인에 남지 않는다 — 노점 가격이 바뀌면 이렇게 보인다. V4 에서 구매 기록에 단가를 남길지 검토",
  },
};
