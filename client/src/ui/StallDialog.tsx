import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import { buyOnMarket, shortAddress, isDojangVerified } from "../wallet/wallet";
import {
  buyStallOnChain,
  makeOfferOnChain,
  cancelOfferOnChain,
  fetchOffersFor,
  type StallOffer,
} from "../chain/village";
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
  const [offerFor, setOfferFor] = useState<string | null>(null);
  const [offerEth, setOfferEth] = useState("");
  const [myOffers, setMyOffers] = useState<StallOffer[]>([]);

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

  // 이 판매자에게 내가 걸어둔 흥정 (온체인 노점만)
  useEffect(() => {
    setMyOffers([]);
    if (!ownerAddress || !walletAddress || !stallId?.startsWith("oc-")) return;
    let cancelled = false;
    void fetchOffersFor(ownerAddress)
      .then((list) => {
        if (!cancelled) {
          setMyOffers(
            list.filter((o) => o.buyer.toLowerCase() === walletAddress.toLowerCase()),
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ownerAddress, walletAddress, stallId, busyItem]);

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
      // 온체인 노점(oc-)은 buyStall(인덱스 기반, 가격 강제), 나머지는 v2 경로
      const { tx, purchaseId, tokenId } = stall.id.startsWith("oc-")
        ? await buyStallOnChain(
            stall.ownerAddress,
            stall.items.findIndex((i) => i.id === itemId),
            item.priceEth,
          )
        : await buyOnMarket(stall.ownerAddress, item.id, item.priceEth);
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

  async function onOffer(itemName: string) {
    if (busyItem || !stall) return;
    setBusyItem("offer");
    setError(null);
    try {
      await makeOfferOnChain(stall.ownerAddress, itemName, offerEth.trim());
      setOfferFor(null);
      setOfferEth("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.length > 120 ? msg.slice(0, 120) + "…" : msg);
    } finally {
      setBusyItem(null);
    }
  }

  async function onCancelOffer(id: number) {
    if (busyItem) return;
    setBusyItem("offer");
    setError(null);
    try {
      await cancelOfferOnChain(id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.length > 120 ? msg.slice(0, 120) + "…" : msg);
    } finally {
      setBusyItem(null);
    }
  }

  const canOffer = !!stallId?.startsWith("oc-") && !!walletAddress && !isMine;
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
              {canOffer && (
                <button
                  className="gift-btn small"
                  disabled={!!busyItem}
                  onClick={() => {
                    setOfferFor(offerFor === it.id ? null : it.id);
                    setOfferEth("");
                  }}
                  title="원하는 가격을 제안합니다 — 판매자가 수락하면 즉시 체결"
                >
                  흥정
                </button>
              )}
            </div>
          ))}
        </div>

        {canOffer && offerFor && (
          <div className="coupon-gift-row">
            <input
              className="gift-input wide"
              type="number"
              step="0.0001"
              min="0"
              placeholder="제안가 (ETH)"
              value={offerEth}
              onChange={(e) => setOfferEth(e.target.value)}
            />
            <button
              className="gift-btn primary small"
              disabled={!!busyItem || !(Number(offerEth) > 0)}
              onClick={() =>
                onOffer(stall.items.find((i) => i.id === offerFor)?.name ?? "")
              }
            >
              {busyItem === "offer" ? "제안 중…" : "제안"}
            </button>
          </div>
        )}

        {myOffers.length > 0 && (
          <div className="gift-note">
            내 흥정:{" "}
            {myOffers.map((o) => (
              <span key={o.id}>
                {o.itemName} {o.amountEth} ETH{" "}
                <button
                  className="gift-txlink"
                  style={{ background: "none", border: "none", cursor: "pointer" }}
                  disabled={!!busyItem}
                  onClick={() => onCancelOffer(o.id)}
                >
                  취소
                </button>{" "}
              </span>
            ))}
          </div>
        )}

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
