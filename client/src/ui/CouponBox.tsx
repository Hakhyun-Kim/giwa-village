import { useState } from "react";
import { useStore } from "../state/store";
import { loadCoupons, updateCoupon } from "../state/coupons";
import { confirmPurchase } from "../wallet/wallet";
import { giwaSepolia } from "../config/giwa";

export default function CouponBox() {
  const open = useStore((s) => s.couponsOpen);
  const walletAddress = useStore((s) => s.walletAddress);
  useStore((s) => s.couponsVersion); // refresh on new purchase
  const [busyTx, setBusyTx] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;
  const coupons = walletAddress ? loadCoupons(walletAddress) : [];
  const close = () => {
    useStore.getState().setCouponsOpen(false);
    setError(null);
  };
  const explorer = giwaSepolia.blockExplorers.default.url;

  async function onConfirm(tx: string, purchaseId: number) {
    if (busyTx || !walletAddress) return;
    setBusyTx(tx);
    setError(null);
    try {
      await confirmPurchase(purchaseId);
      updateCoupon(walletAddress, tx, { settled: true });
      useStore.getState().bumpCoupons();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.length > 100 ? msg.slice(0, 100) + "…" : msg);
    } finally {
      setBusyTx(null);
    }
  }

  return (
    <div className="gift-overlay" onClick={close}>
      <div className="gift-modal" onClick={(e) => e.stopPropagation()}>
        <div className="gift-emoji">🎫</div>
        <div className="gift-title">내 쿠폰함</div>
        <div className="gift-sub">
          {walletAddress ? `${coupons.length}장 보유 · ERC-1155 온체인 쿠폰` : "지갑 연결 필요"}
        </div>

        <div className="coupon-list">
          {coupons.length === 0 && (
            <div className="gift-note">노점이나 상점에서 구매하면 여기 담깁니다.</div>
          )}
          {coupons.map((c) => (
            <div key={c.tx} className="coupon-row">
              <span className="stall-item-emoji">{c.emoji}</span>
              <span className="coupon-name">
                {c.name}
                <em>
                  {c.from}
                  {c.tokenId ? " · NFT 쿠폰" : ""}
                </em>
              </span>
              {c.purchaseId !== undefined && !c.settled ? (
                <button
                  className="gift-btn primary small"
                  disabled={busyTx !== null}
                  onClick={() => onConfirm(c.tx, c.purchaseId!)}
                  title="에스크로 대금을 판매자에게 정산합니다 (미확정 시 24시간 후 자동)"
                >
                  {busyTx === c.tx ? "정산 중…" : "정산 확정"}
                </button>
              ) : (
                <a
                  className="coupon-price"
                  href={`${explorer}/tx/${c.tx}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {c.settled ? "정산됨 ↗" : `${c.priceEth} ETH ↗`}
                </a>
              )}
            </div>
          ))}
        </div>

        {error && <div className="gift-warn">{error}</div>}

        <div className="gift-actions">
          <button className="gift-btn" onClick={close}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
