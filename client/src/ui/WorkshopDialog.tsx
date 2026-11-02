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
import { designFileName, designOfDay, onChainSince, remixDraft, remixSourceOf } from "../chain/pattern";
import { shortAddress } from "../wallet/wallet";
import { kstDate, recordDaily } from "../state/daily";

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
  const [lit, setLit] = useState<number | null>(null); // 원본으로 찾아가 잠깐 밝힌 줄

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
    recordDaily("craft", 1, String(i));
    window.dispatchEvent(new Event("giwa-workshop-paint"));
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

  /** 따라 그리기 — 장터의 문양을 그리기판으로 옮긴다. 등록 전까지 체인에는 아무것도 가지 않는다 */
  function onRemix(d: WorkshopDesign) {
    if (cells.some((c) => c !== 0) && !window.confirm("그리던 문양을 이 문양으로 바꿀까요?")) return;
    const draft = remixDraft(d.pixels, d.palette, d.id, d.name);
    setCells(draft.cells);
    setSlots(draft.slots);
    setName(draft.name);
    setPen(1);
    setError(null);
    setTab("make");
  }

  /** 따라 그린 문양에서 원본 줄로 — 장터에 보이면 그 줄로 내려가 잠깐 밝힌다 */
  function goSource(id: number) {
    const row = document.getElementById(`ws-design-${id}`);
    if (!row) return;
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    setLit(id);
    window.setTimeout(() => setLit((v) => (v === id ? null : v)), 1600);
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
            {(() => {
              const pickId = designOfDay(designs.map((x) => x.id), kstDate());
              const pick = designs.find((x) => x.id === pickId);
              if (!pick) return null;
              return (
                <div className="ws-pick">
                  <div className="gift-note">⭐ 오늘의 문양 — 새 문양에 밀려난 문양 하나를 오늘(KST) 맨 위에</div>
                  <DesignRow
                    d={pick}
                    anchor={false}
                    busy={busy}
                    onBuyWear={() => onBuyWear(pick)}
                    onRemix={() => onRemix(pick)}
                    lit={false}
                    source={remixSourceOf(pick.name, pick.id)}
                    sourceShown={(id) => designs.some((x) => x.id === id)}
                    onSource={goSource}
                  />
                </div>
              );
            })()}
            {designs.map((d) => (
              <DesignRow
                key={d.id}
                d={d}
                busy={busy}
                onBuyWear={() => onBuyWear(d)}
                onRemix={() => onRemix(d)}
                lit={lit === d.id}
                source={remixSourceOf(d.name, d.id)}
                sourceShown={(id) => designs.some((x) => x.id === id)}
                onSource={goSource}
              />
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
  onRemix,
  lit,
  source,
  sourceShown,
  onSource,
  anchor = true,
}: {
  d: WorkshopDesign;
  /** 원본 찾아가기가 내려가는 자리 — 맨 위에 한 번 더 보인 줄은 자리가 아니다 */
  anchor?: boolean;
  busy: boolean;
  onBuyWear: () => void;
  onRemix: () => void;
  lit: boolean;
  source: number | null;
  sourceShown: (id: number) => boolean;
  onSource: (id: number) => void;
}) {
  const dataUrl = useMemo(
    () => patternCanvas(d.pixels, d.palette, 6).toDataURL(),
    [d.pixels, d.palette],
  );
  const free = Number(d.priceEth) === 0;
  /** 내가 간직하는 사본 — 같은 온체인 픽셀을 칸당 32px(256×256)로 그려 내려받는다. 체인에는 쓰지 않는다 */
  function savePng() {
    patternCanvas(d.pixels, d.palette, 32).toBlob((b) => {
      if (!b) return;
      const a = Object.assign(document.createElement("a"), {
        href: URL.createObjectURL(b),
        download: designFileName(d.id, d.name),
      });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, "image/png");
  }
  return (
    <div
      className="guild-row ws-row"
      id={anchor ? `ws-design-${d.id}` : undefined}
      style={lit ? { outline: "1px solid #ffd66b", borderRadius: 6 } : undefined}
    >
      <img className="ws-thumb" src={dataUrl} alt={d.name} />
      <span className="guild-name">
        {d.name}
        <em className="honor-desc">
          {" "}
          {shortAddress(d.creator)} · {d.mints}회 판매
          {onChainSince(d.createdAt) && ` · ${onChainSince(d.createdAt)} 부터 온체인`}
          {source !== null &&
            (sourceShown(source) ? (
              <>
                {" · "}
                <button
                  className="gift-txlink"
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit" }}
                  onClick={() => onSource(source)}
                  title="이 문양이 시작된 원본으로"
                >
                  ↩ #{source} 에서 따라 그림
                </button>
              </>
            ) : (
              ` · #${source} 에서 따라 그림`
            ))}
        </em>
      </span>
      <div className="ws-actions">
        <button className="gift-btn small" onClick={onRemix} title="이 문양에서 시작해 내 문양을 그립니다">
          ✏️ 따라 그리기
        </button>
        <button className="gift-btn small" onClick={savePng} title="이 문양을 그림 파일(PNG)로 간직합니다">
          🖼 PNG
        </button>
        <button className="gift-btn primary small" disabled={busy} onClick={onBuyWear}>
          {free ? "받기·착용" : `${d.priceEth} ETH`}
        </button>
      </div>
    </div>
  );
}
