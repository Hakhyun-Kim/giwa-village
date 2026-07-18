import { useState } from "react";
import { useStore } from "../state/store";
import { sendGiftTx, shortAddress } from "../wallet/wallet";
import { sendGift } from "../net/colyseus";
import { giwaSepolia } from "../config/giwa";

const PRESETS = ["0.001", "0.005", "0.01"];

export default function GiftDialog() {
  const targetId = useStore((s) => s.giftTarget);
  const target = useStore((s) => (targetId ? s.players[targetId] : null));
  const walletAddress = useStore((s) => s.walletAddress);
  const [amount, setAmount] = useState("0.005");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ tx: string } | null>(null);

  if (!targetId || !target) return null;

  function close() {
    useStore.getState().setGiftTarget(null);
    setBusy(false);
    setError(null);
    setDone(null);
    setAmount("0.005");
  }

  async function onSend() {
    if (busy || !targetId || !target) return;
    setBusy(true);
    setError(null);
    try {
      const { tx, amountEth } = await sendGiftTx(target.address, amount);
      sendGift(targetId, amountEth, tx);
      useStore.getState().addFeed({
        kind: "gift",
        fromName: useStore.getState().selfName || "나",
        toName: target.name,
        amountEth,
        tx,
        at: Date.now(),
      });
      setDone({ tx });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.length > 120 ? msg.slice(0, 120) + "…" : msg);
    } finally {
      setBusy(false);
    }
  }

  const explorer = giwaSepolia.blockExplorers.default.url;

  return (
    <div className="gift-overlay" onClick={close}>
      <div className="gift-modal" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <>
            <div className="gift-emoji">🎁</div>
            <div className="gift-title">선물 전송 완료!</div>
            <div className="gift-sub">
              {shortAddress(target.address)} 님에게 {amount} ETH
            </div>
            <a
              className="gift-txlink"
              href={`${explorer}/tx/${done.tx}`}
              target="_blank"
              rel="noreferrer"
            >
              트랜잭션 보기 ↗
            </a>
            <button className="gift-btn primary" onClick={close}>
              닫기
            </button>
          </>
        ) : (
          <>
            <div className="gift-emoji">🎁</div>
            <div className="gift-title">{target.name} 님에게 선물</div>
            <div className="gift-sub">{shortAddress(target.address)}</div>

            <div className="gift-presets">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  className={`gift-chip ${amount === p ? "on" : ""}`}
                  onClick={() => setAmount(p)}
                  disabled={busy}
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="gift-input-row">
              <input
                className="gift-input"
                type="number"
                step="0.001"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={busy}
              />
              <span className="gift-unit">ETH</span>
            </div>

            {!walletAddress && (
              <div className="gift-warn">먼저 지갑을 연결해야 선물할 수 있습니다.</div>
            )}
            {error && <div className="gift-warn">{error}</div>}

            <div className="gift-actions">
              <button className="gift-btn" onClick={close} disabled={busy}>
                취소
              </button>
              <button
                className="gift-btn primary"
                onClick={onSend}
                disabled={busy || !walletAddress}
              >
                {busy ? "전송 중…" : `${amount} ETH 선물`}
              </button>
            </div>
            <div className="gift-note">GIWA Sepolia에서 실제 전송됩니다 (테스트넷)</div>
          </>
        )}
      </div>
    </div>
  );
}
