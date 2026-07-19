import { useEffect, useMemo, useState } from "react";
import { useStore } from "../state/store";
import {
  PRESET16,
  paletteSlot,
  patternCanvas,
  fetchDesigns,
  ownedDesign,
  registerDesign,
  buyDesignOnChain,
  wearDesign,
  wornPatternOf,
  type WorkshopDesign,
} from "../chain/village";
import { refreshSelfHonor } from "../chain/village";
import { shortAddress } from "../wallet/wallet";

const DEFAULT_PALETTE = [1, 3, 5, 8]; // 검정·홍·금·하늘

/** 8x8 픽셀 문양 공방 — 그리기·온체인 등록·장터·착용 */
export default function WorkshopDialog() {
  const open = useStore((s) => s.workshopOpen);
  const walletAddress = useStore((s) => s.walletAddress);
  const [tab, setTab] = useState<"make" | "market">("make");
  const [cells, setCells] = useState<number[]>(() => new Array(64).fill(0));
  const [slots, setSlots] = useState<number[]>(DEFAULT_PALETTE);
  const [pen, setPen] = useState(1); // 팔레트 슬롯 0..3
  const [name, setName] = useState("");
  const [price, setPrice] = useState("0");
  const [designs, setDesigns] = useState<WorkshopDesign[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || tab !== "market") return;
    void fetchDesigns().then(setDesigns).catch(() => {});
  }, [open, tab]);

  if (!open) return null;

  function close() {
    useStore.getState().setWorkshopOpen(false);
    setError(null);
  }

  function paint(i: number) {
    setCells((c) => {
      const next = [...c];
      next[i] = pen;
      return next;
    });
  }

  async function onRegister() {
    if (busy) return;
    if (!name.trim()) {
      setError("문양 이름을 입력하세요.");
      return;
    }
    if (cells.every((c) => c === 0)) {
      setError("빈 문양은 등록할 수 없습니다.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await registerDesign(name.trim(), cells, slots, price.trim() || "0");
      setName("");
      setTab("market");
      void fetchDesigns().then(setDesigns).catch(() => {});
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      setError(m.length > 100 ? m.slice(0, 100) + "…" : m);
    } finally {
      setBusy(false);
    }
  }

  async function onBuyWear(d: WorkshopDesign) {
    if (busy || !walletAddress) return;
    setBusy(true);
    setError(null);
    try {
      const owned = await ownedDesign(walletAddress, d.id);
      if (!owned) await buyDesignOnChain(d.id, d.priceEth);
      await wearDesign(d.id + 1);
      useStore.getState().setSelfWear(await wornPatternOf(walletAddress));
      void refreshSelfHonor();
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      setError(m.length > 100 ? m.slice(0, 100) + "…" : m);
    } finally {
      setBusy(false);
    }
  }

  async function onTakeOff() {
    if (busy || !walletAddress) return;
    setBusy(true);
    try {
      await wearDesign(0);
      useStore.getState().setSelfWear(null);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gift-overlay" onClick={close}>
      <div className="gift-modal guild-modal" onClick={(e) => e.stopPropagation()}>
        <div className="gift-emoji">🎨</div>
        <div className="gift-title">문양 공방</div>
        <div className="gift-sub">
          내 문양을 그려 온체인에 등록하고, 저잣거리에서 팔고, 아바타에 답니다
        </div>

        <div className="gift-presets" style={{ marginTop: 12 }}>
          <button className={`gift-chip ${tab === "make" ? "on" : ""}`} onClick={() => setTab("make")}>
            🖌 그리기
          </button>
          <button className={`gift-chip ${tab === "market" ? "on" : ""}`} onClick={() => setTab("market")}>
            🏬 문양 장터
          </button>
          {walletAddress && (
            <button className="gift-chip" onClick={onTakeOff} disabled={busy}>
              벗기
            </button>
          )}
        </div>

        {tab === "make" ? (
          <>
            <div className="ws-editor">
              <div className="ws-grid">
                {cells.map((c, i) => (
                  <button
                    key={i}
                    className="ws-cell"
                    style={{ background: c === 0 ? "#0f131c" : paletteSlot(encode(slots), c) }}
                    onMouseDown={() => paint(i)}
                    onMouseEnter={(e) => e.buttons === 1 && paint(i)}
                  />
                ))}
              </div>
              <div className="ws-side">
                <div className="ws-pens">
                  {[0, 1, 2, 3].map((sl) => (
                    <button
                      key={sl}
                      className={`ws-pen ${pen === sl ? "on" : ""}`}
                      style={{ background: sl === 0 ? "#0f131c" : PRESET16[slots[sl]] }}
                      onClick={() => setPen(sl)}
                      title={sl === 0 ? "지우개(투명)" : `색 ${sl}`}
                    />
                  ))}
                </div>
                <div className="ws-swatches">
                  {PRESET16.map((hex, idx) =>
                    idx === 0 ? null : (
                      <button
                        key={idx}
                        className="ws-swatch"
                        style={{ background: hex }}
                        onClick={() =>
                          setSlots((s) => s.map((v, i) => (i === pen && pen !== 0 ? idx : v)))
                        }
                      />
                    ),
                  )}
                </div>
                <button className="gift-btn small" onClick={() => setCells(new Array(64).fill(0))}>
                  전체 지우기
                </button>
              </div>
            </div>
            <input
              className="gift-input wide"
              placeholder="문양 이름 (예: 달무늬)"
              maxLength={36}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="coupon-gift-row">
              <input
                className="gift-input wide"
                type="number"
                step="0.0001"
                min="0"
                placeholder="판매가 (ETH · 0이면 무료)"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
              <button className="gift-btn primary small" disabled={busy} onClick={onRegister}>
                {busy ? "등록 중…" : "온체인 등록"}
              </button>
            </div>
          </>
        ) : (
          <div className="guild-board" style={{ borderTop: "none" }}>
            {designs.length === 0 && (
              <div className="gift-note">아직 등록된 문양이 없습니다 — 첫 문양을 그려보세요.</div>
            )}
            {designs.map((d) => (
              <DesignRow key={d.id} d={d} busy={busy} onBuyWear={() => onBuyWear(d)} />
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
          문양 데이터는 전부 온체인 · 판매 대금은 창작자에게 직접 전달됩니다
        </div>
      </div>
    </div>
  );

  function encode(s: number[]): number {
    return ((s[0] & 0xf) << 12) | ((s[1] & 0xf) << 8) | ((s[2] & 0xf) << 4) | (s[3] & 0xf);
  }
}

function DesignRow({
  d,
  busy,
  onBuyWear,
}: {
  d: WorkshopDesign;
  busy: boolean;
  onBuyWear: () => void;
}) {
  const dataUrl = useMemo(
    () => patternCanvas(d.pixels, d.palette, 6).toDataURL(),
    [d.pixels, d.palette],
  );
  const free = Number(d.priceEth) === 0;
  return (
    <div className="guild-row">
      <img className="ws-thumb" src={dataUrl} alt={d.name} />
      <span className="guild-name">
        {d.name}
        <em className="honor-desc">
          {" "}
          {shortAddress(d.creator)} · {d.mints}회 판매
        </em>
      </span>
      <button className="gift-btn primary small" disabled={busy} onClick={onBuyWear}>
        {free ? "받기·착용" : `${d.priceEth} ETH`}
      </button>
    </div>
  );
}
