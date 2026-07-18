import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import { buyOnMarket, shortAddress, isDojangVerified } from "../wallet/wallet";
import { useUpidName } from "../wallet/upid";
import { buyStallItem } from "../net/colyseus";
import { addCoupon } from "../state/coupons";
import { giwaSepolia } from "../config/giwa";
import { MARKET_ADDRESS } from "../config/market";

const THEME_EMOJI: Record<string, string> = {
  pizza: "🍕",
  cvs: "🏪",
  burger: "🍔",
};

export default function StallDialog() {
  const stallId = useStore((s) => s.stallView);
  const stall = useStore((s) =>
    s.stallView ? s.stalls.find((x) => x.id === s.stallView) : undefined,
  );
  const walletAddress = useStore((s) => s.walletAddress);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [boughtItem, setBoughtItem] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ownerDojang, setOwnerDojang] = useState(false);

  const ownerAddress = stall?.ownerAddress;
  const ownerUpid = useUpidName(ownerAddress ?? null);
  useEffect(() => {
    setOwnerDojang(false);
    if (!ownerAddress) return;
    let cancelled = false;
    void isDojangVerified(ownerAddress).then((v) => {
      if (!cancelled) setOwnerDojang(v);
    });
    return () => {
      cancelled = true;
    };
  }, [ownerAddress]);

  if (!stallId || !stall) return null;

  const isMine =
    !!walletAddress &&
    stall.ownerAddress.toLowerCase() === walletAddress.toLowerCase();

  function close() {
    useStore.getState().setStallView(null);
    setBusyItem(null);
    setBoughtItem(null);
    setError(null);
  }

  async function onBuy(itemId: string) {
    if (busyItem || !stall) return;
    const item = stall.items.find((i) => i.id === itemId);
    if (!item) return;
    setBusyItem(itemId);
    setError(null);
    try {
      const { tx, purchaseId, tokenId } = await buyOnMarket(
        stall.ownerAddress,
        item.id,
        item.priceEth,
      );
      buyStallItem(stall.id, item.id, tx);
      // 쿠폰은 구매 당사자가 에스크로 정보와 함께 직접 저장한다
      const my = useStore.getState().walletAddress;
      if (my) {
        addCoupon(my, {
          name: item.name,
          emoji: item.emoji,
          from: stall.title,
          priceEth: item.priceEth,
          tx,
          at: Date.now(),
          purchaseId,
          tokenId,
        });
        useStore.getState().bumpCoupons();
      }
      setBoughtItem(itemId);
      setTimeout(() => setBoughtItem(null), 2500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.length > 120 ? msg.slice(0, 120) + "…" : msg);
    } finally {
      setBusyItem(null);
    }
  }

  const icon = stall.brand ? (THEME_EMOJI[stall.theme ?? ""] ?? "🏪") : "🧺";

  return (
    <div className="gift-overlay" onClick={close}>
      <div className="gift-modal" onClick={(e) => e.stopPropagation()}>
        <div className="gift-emoji">{icon}</div>
        <div className="gift-title">
          {stall.title}
          {stall.tag && <span className="stall-dialog-tag">{stall.tag}</span>}
        </div>
        <div className="gift-sub">
          {ownerDojang ? (
            <span className="badge-dojang">✔ Dojang 인증 상인</span>
          ) : (
            <span className="badge-inline">✓ 지갑 상인</span>
          )}{" "}
          {stall.brand ? stall.title : stall.ownerName} ·{" "}
          {ownerUpid ?? shortAddress(stall.ownerAddress)}
        </div>

        <div className="stall-items">
          {stall.items.map((it) => (
            <div key={it.id} className="stall-item">
              <span className="stall-item-emoji">{it.emoji}</span>
              <span className="stall-item-name">{it.name}</span>
              <button
                className="gift-btn primary small"
                disabled={!!busyItem || !walletAddress || isMine}
                onClick={() => onBuy(it.id)}
              >
                {busyItem === it.id
                  ? "결제 중…"
                  : boughtItem === it.id
                    ? "구매 완료!"
                    : `${it.priceEth} ETH`}
              </button>
            </div>
          ))}
        </div>

        {!walletAddress && (
          <div className="gift-warn">지갑을 연결해야 구매할 수 있습니다.</div>
        )}
        {isMine && <div className="gift-note">내 노점입니다.</div>}
        {error && <div className="gift-warn">{error}</div>}

        <div className="gift-actions">
          <button className="gift-btn" onClick={close}>
            닫기
          </button>
        </div>
        <div className="gift-note">
          결제는 에스크로 보관 · 쿠폰은 ERC-1155 토큰으로 지갑에 발행 ·
          쿠폰함에서 정산 확정 (24시간 후 자동){" "}
          <a
            className="gift-txlink"
            href={`${giwaSepolia.blockExplorers.default.url}/address/${MARKET_ADDRESS}`}
            target="_blank"
            rel="noreferrer"
          >
            컨트랙트 ↗
          </a>
        </div>
      </div>
    </div>
  );
}
