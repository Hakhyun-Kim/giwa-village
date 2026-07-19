import { useState } from "react";
import { useStore } from "../state/store";
import { openStall } from "../net/colyseus";
import { listOnMarket } from "../wallet/wallet";
import { DEMO } from "../config/giwa";

const PRESET_GOODS = [
  { name: "할인쿠폰", emoji: "🎫" },
  { name: "목도리", emoji: "🧣" },
  { name: "등불", emoji: "🏮" },
  { name: "꼬치", emoji: "🍡" },
  { name: "목검", emoji: "🗡️" },
  { name: "랜덤박스", emoji: "🎁" },
];

interface Draft {
  name: string;
  emoji: string;
  priceEth: string;
}

export default function StallOpenDialog() {
  const open = useStore((s) => s.stallOpenDialog);
  const [title, setTitle] = useState("");
  const [items, setItems] = useState<Draft[]>([]);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function close() {
    useStore.getState().setStallOpenDialog(false);
    setTitle("");
    setItems([]);
    setError(null);
  }

  function toggleGood(g: { name: string; emoji: string }) {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.name === g.name);
      if (idx >= 0) return prev.filter((_, i) => i !== idx);
      if (prev.length >= 3) return prev;
      return [...prev, { ...g, priceEth: "0.001" }];
    });
  }

  function setPrice(name: string, priceEth: string) {
    setItems((prev) => prev.map((i) => (i.name === name ? { ...i, priceEth } : i)));
  }

  function onOpen() {
    if (!title.trim()) {
      setError("노점 이름을 입력하세요.");
      return;
    }
    if (items.length === 0) {
      setError("상품을 1개 이상 고르세요.");
      return;
    }
    for (const it of items) {
      const n = Number(it.priceEth);
      if (!(n > 0 && n <= 1)) {
        setError(`${it.name} 가격이 올바르지 않습니다 (0~1 ETH).`);
        return;
      }
    }
    openStall(title.trim(), items);
    // 온체인 리스팅 (best-effort): 아이템 id는 서버 규칙과 동일하게 계산.
    // 같은 지갑에서 병렬 전송하면 nonce 충돌("replacement transaction
    // underpriced")이 나므로 반드시 순차 전송 — listOnMarket이 영수증까지
    // 대기하므로 순차면 안전. 일시 오류(RPC 리플리카 지연 등)는 재시도.
    // 데모(서버리스) 모드에선 openStall이 V3 openStall 단일 tx로 리스팅까지
    // 처리하므로 여기서는 건너뛴다.
    const addr = DEMO ? null : useStore.getState().walletAddress;
    if (addr) {
      const stallId = `s-${addr.slice(2, 10).toLowerCase()}`;
      const drafts = [...items];
      void (async () => {
        for (let i = 0; i < drafts.length; i++) {
          const it = drafts[i];
          for (let attempt = 0; ; attempt++) {
            try {
              await listOnMarket(`${stallId}-${i}`, it.priceEth);
              break;
            } catch (err) {
              if (attempt >= 2) {
                console.warn(`[market] ${it.name} 온체인 리스팅 실패(가스 부족 등):`, err);
                break;
              }
              await new Promise((r) => setTimeout(r, 1500));
            }
          }
        }
      })();
    }
    close();
  }

  return (
    <div className="gift-overlay" onClick={close}>
      <div className="gift-modal" onClick={(e) => e.stopPropagation()}>
        <div className="gift-emoji">🧺</div>
        <div className="gift-title">노점 열기</div>
        <div className="gift-sub">지금 서 있는 자리에 노점이 펼쳐집니다</div>

        <input
          className="gift-input wide"
          placeholder="노점 이름 (예: 싸다싸 목도리)"
          maxLength={20}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <div className="stall-goods-grid">
          {PRESET_GOODS.map((g) => {
            const sel = items.find((i) => i.name === g.name);
            return (
              <div key={g.name} className={`stall-good ${sel ? "on" : ""}`}>
                <button className="stall-good-pick" onClick={() => toggleGood(g)}>
                  {g.emoji} {g.name}
                </button>
                {sel && (
                  <input
                    className="stall-good-price"
                    type="number"
                    step="0.001"
                    min="0"
                    value={sel.priceEth}
                    onChange={(e) => setPrice(g.name, e.target.value)}
                  />
                )}
              </div>
            );
          })}
        </div>

        {error && <div className="gift-warn">{error}</div>}

        <div className="gift-actions">
          <button className="gift-btn" onClick={close}>
            취소
          </button>
          <button className="gift-btn primary" onClick={onOpen}>
            노점 개설
          </button>
        </div>
        <div className="gift-note">
          노점은 접속을 끊어도 마을에 남습니다 · 최대 3개 상품
        </div>
      </div>
    </div>
  );
}
