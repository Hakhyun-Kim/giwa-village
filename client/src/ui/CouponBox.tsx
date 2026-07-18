import { useStore } from "../state/store";
import { loadCoupons } from "../state/coupons";
import { giwaSepolia } from "../config/giwa";

export default function CouponBox() {
  const open = useStore((s) => s.couponsOpen);
  const walletAddress = useStore((s) => s.walletAddress);
  useStore((s) => s.couponsVersion); // refresh on new purchase

  if (!open) return null;
  const coupons = walletAddress ? loadCoupons(walletAddress) : [];
  const close = () => useStore.getState().setCouponsOpen(false);
  const explorer = giwaSepolia.blockExplorers.default.url;

  return (
    <div className="gift-overlay" onClick={close}>
      <div className="gift-modal" onClick={(e) => e.stopPropagation()}>
        <div className="gift-emoji">🎫</div>
        <div className="gift-title">내 쿠폰함</div>
        <div className="gift-sub">
          {walletAddress ? `${coupons.length}장 보유` : "지갑 연결 필요"}
        </div>

        <div className="coupon-list">
          {coupons.length === 0 && (
            <div className="gift-note">노점이나 상점에서 구매하면 여기 담깁니다.</div>
          )}
          {coupons.map((c) => (
            <a
              key={c.tx}
              className="coupon-row"
              href={`${explorer}/tx/${c.tx}`}
              target="_blank"
              rel="noreferrer"
            >
              <span className="stall-item-emoji">{c.emoji}</span>
              <span className="coupon-name">
                {c.name}
                <em>{c.from}</em>
              </span>
              <span className="coupon-price">{c.priceEth} ETH</span>
            </a>
          ))}
        </div>

        <div className="gift-actions">
          <button className="gift-btn" onClick={close}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
