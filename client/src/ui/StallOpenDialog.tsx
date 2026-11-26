import { useState } from "react";
import { useStore } from "../state/store";
import { openStallOnChain } from "../chain/village";
import { sfxStallOpen } from "../audio/sfx";
import { track } from "../net/analytics";
import { txErrorText } from "../net/txError";
import { parseEthInput } from "../chain/ethAmount";

const PRESET_GOODS = [
  { name: "할인쿠폰", emoji: "🎫" },
  { name: "목도리", emoji: "🧣" },
  { name: "등불", emoji: "🏮" },
  { name: "꼬치", emoji: "🍡" },
  { name: "목검", emoji: "🗡️" },
  { name: "노리개", emoji: "🎀" },
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

  const [busy, setBusy] = useState(false);

  if (!open) return null;

  function close() {
    if (busy) return;
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

  async function onOpen() {
    if (busy) return;
    if (!title.trim()) {
      setError("노점 이름을 입력하세요.");
      return;
    }
    if (items.length === 0) {
      setError("상품을 1개 이상 고르세요.");
      return;
    }
    for (const it of items) {
      // Number() 는 "1e-3" · 19자리 소수(체인에서는 0 wei — 공짜 상품)를 통과시킨다 — wei 로 따져 본다
      const price = parseEthInput(it.priceEth, 1);
      if (price.error) {
        setError(`${it.name} 가격: ${price.error}`);
        return;
      }
    }
    setBusy(true);
    try {
      await openStallOnChain(title.trim(), items);
      sfxStallOpen();
      track("stall_open", { items: items.length });
      useStore.getState().setStallOpenDialog(false);
      setTitle(""); setItems([]); setError(null);
    } catch (err) {
      setError(txErrorText(err, 120));
    } finally { setBusy(false); }
  }

  return (
    <div className="gift-overlay" onClick={close}>
      <div role="dialog" aria-modal="true" className="gift-modal" onClick={(e) => e.stopPropagation()}>
        <div className="gift-emoji">🧺</div>
        <div className="gift-title">{busy ? "체인에 노점 기록 중…" : "노점 열기"}</div>
        <div className="gift-sub">지금 서 있는 자리에 노점이 펼쳐집니다</div>

        <input
          className="gift-input wide"
          aria-label="노점 이름"
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
                    aria-label={`${g.name} 가격 (ETH)`}
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
          <button className="gift-btn primary" onClick={onOpen} disabled={busy}>
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
