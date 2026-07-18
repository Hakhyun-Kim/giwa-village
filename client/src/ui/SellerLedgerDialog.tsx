import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import { fetchMySales, refundSale, type SellerSale } from "../chain/village";
import { shortAddress } from "../wallet/wallet";
import { giwaSepolia } from "../config/giwa";

/** 판매자 장부 — 내 노점의 온체인 판매·분쟁 목록 + 환불 */
export default function SellerLedgerDialog() {
  const open = useStore((s) => s.ledgerOpen);
  const walletAddress = useStore((s) => s.walletAddress);
  const [sales, setSales] = useState<SellerSale[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !walletAddress) return;
    setSales(null);
    void fetchMySales(walletAddress)
      .then(setSales)
      .catch(() => setError("체인 조회 실패 — 잠시 후 다시 열어주세요."));
  }, [open, walletAddress]);

  if (!open) return null;
  const explorer = giwaSepolia.blockExplorers.default.url;

  function close() {
    useStore.getState().setLedgerOpen(false);
    setError(null);
  }

  async function onRefund(purchaseId: number) {
    if (busy !== null || !walletAddress) return;
    if (!confirm("이 판매 대금을 구매자에게 환불할까요?")) return;
    setBusy(purchaseId);
    setError(null);
    try {
      await refundSale(purchaseId);
      setSales(await fetchMySales(walletAddress));
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      setError(m.length > 100 ? m.slice(0, 100) + "…" : m);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="gift-overlay" onClick={close}>
      <div className="gift-modal guild-modal" onClick={(e) => e.stopPropagation()}>
        <div className="gift-emoji">📒</div>
        <div className="gift-title">판매 장부</div>
        <div className="gift-sub">내 노점의 온체인 판매 내역 · 분쟁은 환불로 해결</div>

        {!sales && !error && <div className="gift-note">체인에서 불러오는 중…</div>}
        {sales && sales.length === 0 && (
          <div className="gift-note">아직 판매가 없습니다.</div>
        )}

        {sales && sales.length > 0 && (
          <div className="guild-board" style={{ borderTop: "none", paddingTop: 4 }}>
            {sales.map((s) => (
              <div key={s.purchaseId} className="guild-row">
                <span className="guild-name">
                  {s.itemName}
                  <em className="honor-desc">
                    {" "}
                    {shortAddress(s.buyer)} · {s.amountEth} ETH
                  </em>
                </span>
                {s.settled ? (
                  <a
                    className="coupon-price"
                    href={`${explorer}/tx/${s.tx}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    정산됨 ↗
                  </a>
                ) : (
                  <span className="coupon-actions">
                    {s.disputed && <em className="coupon-disputed">분쟁 중</em>}
                    <button
                      className="gift-btn small"
                      disabled={busy !== null}
                      onClick={() => onRefund(s.purchaseId)}
                    >
                      {busy === s.purchaseId ? "환불 중…" : "환불"}
                    </button>
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {error && <div className="gift-warn">{error}</div>}

        <div className="gift-actions">
          <button className="gift-btn" onClick={close}>
            닫기
          </button>
        </div>
        <div className="gift-note">
          미정산 대금은 구매자 확정 또는 24시간 후 자동 정산 · 분쟁 시 7일 연장
        </div>
      </div>
    </div>
  );
}
