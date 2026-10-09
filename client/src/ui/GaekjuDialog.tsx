import { useEffect, useState } from "react";
import { formatEther } from "viem";
import { useStore } from "../state/store";
import { loadGaekju, type GaekjuSnapshot } from "../chain/gaekju";
import {
  ACCOUNT_LABEL,
  EXCEPTION_POLICY,
  STATE_LABEL,
  type Account,
  type PurchaseState,
} from "../ledger/escrowBook";
import { shortAddress } from "../wallet/wallet";
import { giwaSepolia } from "../config/giwa";
import { MARKET_ADDRESS } from "../config/market";
import { OFFERS_ADDRESS } from "../config/offers";

/** 소수점 아래 0 을 걷어 낸 ETH — 0.00100000 → 0.001 */
const eth = (wei: bigint) => {
  const s = formatEther(wei < 0n ? -wei : wei);
  return (wei < 0n ? "−" : "") + (s.includes(".") ? s.replace(/\.?0+$/, "") : s);
};

const ACCOUNTS: Account[] = ["buyer", "escrow", "seller", "refund"];

/** 상태 머신의 칸 — 왼쪽에서 오른쪽으로 흐르고, 마지막 두 칸이 끝이다 */
function StateFlow({ snap }: { snap: GaekjuSnapshot }) {
  const cell = (s: PurchaseState) => {
    const v = snap.book.byState[s];
    return (
      <div className={`gaekju-state gaekju-state-${s}${v.count ? " on" : ""}`}>
        <b>{STATE_LABEL[s]}</b>
        <span>{v.count}건</span>
        <em>{eth(v.amount)} ETH</em>
      </div>
    );
  };
  return (
    <div className="gaekju-flow" aria-label="거래 상태 흐름">
      <div className="gaekju-state gaekju-state-start">
        <b>구매</b>
        <span>{snap.book.rows.length}건</span>
        <em>대금 → 에스크로</em>
      </div>
      <i>→</i>
      <div className="gaekju-col">
        {cell("escrow")}
        {cell("disputed")}
      </div>
      <i>→</i>
      {cell("releasable")}
      <i>→</i>
      <div className="gaekju-col">
        {cell("settled")}
        {cell("refunded")}
      </div>
    </div>
  );
}

/** 객주 장부 — 장터 전체의 에스크로 원장. 읽기만 한다(쓰기 0 · 지갑 불필요) */
export default function GaekjuDialog() {
  const open = useStore((s) => s.gaekjuOpen);
  const [snap, setSnap] = useState<GaekjuSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);

  async function refresh() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      setSnap(await loadGaekju());
    } catch {
      setError("체인 조회 실패 — 공개 RPC 가 바쁠 수 있습니다. 잠시 후 '다시 읽기'를 눌러 주세요.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && !snap) void refresh();
  }, [open]);

  if (!open) return null;
  const explorer = giwaSepolia.blockExplorers.default.url;
  const close = () => useStore.getState().setGaekjuOpen(false);
  const book = snap?.book;
  const rows = book ? [...book.rows].reverse() : [];
  const shownRows = showAll ? rows : rows.slice(0, 8);
  const rec = book?.reconciliation;
  const balanced = rec ? rec.market.diff === 0n && rec.offers.diff === 0n : false;

  return (
    <div className="gift-overlay" onClick={close}>
      <div className="gift-modal gaekju-modal" onClick={(e) => e.stopPropagation()}>
        <div className="gift-emoji">📜</div>
        <div className="gift-title">객주 장부</div>
        <div className="gaekju-lede">
          장터의 모든 거래 대금은 판매자에게 바로 가지 않고 장터 계약이 맡아 둡니다(에스크로).
          객주는 그 돈이 지금 어디 있는지 — 보관 · 정산 · 환불 — 를 체인에서 직접 읽어 장부로 맞춥니다.
        </div>

        {!snap && !error && <div className="gift-note">체인에서 장부를 맞추는 중…</div>}
        {error && <div className="gift-warn">{error}</div>}

        {snap && book && rec && (
          <>
            <section className={`gaekju-recon ${balanced ? "ok" : "bad"}`}>
              <div className="gaekju-recon-head">
                {balanced ? "✔ 대사 일치" : "⚠ 대사 불일치"}
                <span>
                  블록 #{snap.block.toString()} 기준
                </span>
              </div>
              <div className="gaekju-recon-grid">
                <span>장터 계약 실제 잔액</span>
                <a href={`${explorer}/address/${MARKET_ADDRESS}`} target="_blank" rel="noreferrer">
                  {eth(rec.market.actual)} ETH ↗
                </a>
                <span>장부상 미정산 합계</span>
                <b>{eth(rec.market.expected)} ETH</b>
                <span>흥정 공탁 실제 잔액</span>
                <a href={`${explorer}/address/${OFFERS_ADDRESS}`} target="_blank" rel="noreferrer">
                  {eth(rec.offers.actual)} ETH ↗
                </a>
                <span>장부상 활성 제안 합계</span>
                <b>{eth(rec.offers.expected)} ETH</b>
              </div>
            </section>

            <div className="gaekju-h">거래 상태 흐름</div>
            <StateFlow snap={snap} />

            <div className="gaekju-h">계정 (누계 · 복식부기)</div>
            <div className="gaekju-accounts">
              {ACCOUNTS.map((a) => (
                <div key={a} className={`gaekju-acct gaekju-acct-${a}`}>
                  <span>{ACCOUNT_LABEL[a]}</span>
                  <b>{eth(book.accounts[a])}</b>
                </div>
              ))}
            </div>
            <div className="gaekju-eq">
              구매자 지급 {eth(book.accounts.buyer)} = 보관 {eth(book.accounts.escrow)} + 정산 {eth(book.accounts.seller)} + 환불{" "}
              {eth(book.accounts.refund)}
            </div>

            <div className="gaekju-h">예외함 {book.exceptions.length > 0 && <em>{book.exceptions.length}</em>}</div>
            {book.exceptions.length === 0 ? (
              <div className="gift-note">사람이 볼 건이 없습니다.</div>
            ) : (
              <div className="gaekju-exc-list">
                {book.exceptions.map((x, i) => {
                  const pol = EXCEPTION_POLICY[x.kind];
                  return (
                    <details key={i} className={`gaekju-exc ${x.severity}`}>
                      <summary>
                        <b>{pol.title}</b>
                        {x.purchaseId !== undefined && <span>#{x.purchaseId}</span>}
                        <em>{eth(x.amount)} ETH</em>
                      </summary>
                      <p>{x.detail}</p>
                      <dl>
                        <dt>결정</dt>
                        <dd>{pol.owner}</dd>
                        <dt>사용자</dt>
                        <dd>{pol.user}</dd>
                        <dt>정책</dt>
                        <dd>{pol.policy}</dd>
                      </dl>
                    </details>
                  );
                })}
              </div>
            )}

            <div className="gaekju-h">거래 원장 (최근 순)</div>
            <div className="gaekju-rows">
              {shownRows.map((r) => (
                <div key={r.id} className="gaekju-row">
                  <span className="gaekju-id">#{r.id}</span>
                  <span className="gaekju-item">
                    {r.label ?? (r.itemId || "—")}
                    <em>
                      {r.viaOffer ? "흥정" : shortAddress(r.buyer)} → {shortAddress(r.seller)}
                    </em>
                  </span>
                  <span className="gaekju-amt">{eth(r.amount)}</span>
                  {r.tx ? (
                    <a
                      className={`gaekju-chip ${r.state}`}
                      href={`${explorer}/tx/${r.tx}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {STATE_LABEL[r.state]}
                    </a>
                  ) : (
                    <span className={`gaekju-chip ${r.state}`}>{STATE_LABEL[r.state]}</span>
                  )}
                </div>
              ))}
              {rows.length === 0 && <div className="gift-note">아직 거래가 없습니다.</div>}
            </div>
            {rows.length > 8 && (
              <button className="gaekju-more" onClick={() => setShowAll((v) => !v)}>
                {showAll ? "접기" : `${rows.length - 8}건 더 보기`}
              </button>
            )}
          </>
        )}

        <div className="gift-actions">
          <button className="gift-btn" onClick={() => void refresh()} disabled={loading}>
            {loading ? "읽는 중…" : "다시 읽기"}
          </button>
          <button className="gift-btn primary" onClick={close}>
            닫기
          </button>
        </div>
        <div className="gift-note">
          읽기 전용 · 이 창은 체인에 아무것도 쓰지 않습니다 · GIWA Sepolia 테스트넷(금전 가치 없음) ·{" "}
          <a
            href="https://github.com/Hakhyun-Kim/giwa-village/blob/main/guide/GAEKJU.md"
            target="_blank"
            rel="noreferrer"
          >
            정책 문서 ↗
          </a>
        </div>
      </div>
    </div>
  );
}
