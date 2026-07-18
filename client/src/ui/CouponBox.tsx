import { useState } from "react";
import { useStore } from "../state/store";
import { loadCoupons, updateCoupon } from "../state/coupons";
import { confirmPurchase, disputePurchase, redeemCoupon } from "../wallet/wallet";
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

  async function onDispute(tx: string, purchaseId: number) {
    if (busyTx || !walletAddress) return;
    if (!confirm("분쟁을 신고할까요? 자동 정산이 7일로 늦춰지고, 판매자가 환불할 수 있게 됩니다.")) return;
    setBusyTx(tx);
    setError(null);
    try {
      await disputePurchase(purchaseId);
      updateCoupon(walletAddress, tx, { disputed: true });
      useStore.getState().bumpCoupons();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.length > 100 ? msg.slice(0, 100) + "…" : msg);
    } finally {
      setBusyTx(null);
    }
  }

  async function onRedeem(tx: string, tokenId: string) {
    if (busyTx || !walletAddress) return;
    if (!confirm("쿠폰을 사용할까요? 토큰이 소각되고 온체인 사용 증빙이 남습니다.")) return;
    setBusyTx(tx);
    setError(null);
    try {
      const usedTx = await redeemCoupon(tokenId);
      updateCoupon(walletAddress, tx, { usedTx });
      useStore.getState().bumpCoupons();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.length > 100 ? msg.slice(0, 100) + "…" : msg);
    } finally {
      setBusyTx(null);
    }
  }

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
                <span className="coupon-actions">
                  <button
                    className="gift-btn primary small"
                    disabled={busyTx !== null}
                    onClick={() => onConfirm(c.tx, c.purchaseId!)}
                    title="에스크로 대금을 판매자에게 정산합니다 (미확정 시 24시간 후 자동)"
                  >
                    {busyTx === c.tx ? "처리 중…" : "정산 확정"}
                  </button>
                  {c.disputed ? (
                    <em className="coupon-disputed">분쟁 중</em>
                  ) : (
                    <button
                      className="gift-btn small"
                      disabled={busyTx !== null}
                      onClick={() => onDispute(c.tx, c.purchaseId!)}
                      title="자동 정산을 7일로 늦추고 판매자 환불을 가능하게 합니다"
                    >
                      신고
                    </button>
                  )}
                </span>
              ) : c.usedTx ? (
                <a
                  className="coupon-price"
                  href={`${explorer}/tx/${c.usedTx}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  사용됨 ↗
                </a>
              ) : (
                <span className="coupon-actions">
                  {c.settled && c.tokenId && (
                    <button
                      className="gift-btn primary small"
                      disabled={busyTx !== null}
                      onClick={() => onRedeem(c.tx, c.tokenId!)}
                      title="쿠폰 토큰을 소각하고 온체인 사용 증빙을 남깁니다"
                    >
                      {busyTx === c.tx ? "사용 중…" : "사용"}
                    </button>
                  )}
                  <a
                    className="coupon-price"
                    href={`${explorer}/tx/${c.tx}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {c.settled ? "정산됨 ↗" : `${c.priceEth} ETH ↗`}
                  </a>
                </span>
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
