import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import {
  HONOR_DEFS,
  fetchHonors,
  honorWrite,
  TRINKET_DEFS,
  fetchBoxProfile,
  openBoxOnChain,
  revealBoxOnChain,
  equipTrinketOnChain,
  fetchHearth,
  type HonorProfile,
  type BoxProfile,
} from "../chain/village";

/** 소울바운드 칭호 — 온체인 조건 검증 클레임 + 이름표 배지 장착 */
export default function HonorsDialog() {
  const open = useStore((s) => s.honorsOpen);
  const walletAddress = useStore((s) => s.walletAddress);
  const [profile, setProfile] = useState<HonorProfile | null>(null);
  const [box, setBox] = useState<BoxProfile | null>(null);
  const [boxBusy, setBoxBusy] = useState(false);
  const [lastKind, setLastKind] = useState<number | null>(null);
  const [warmth, setWarmth] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !walletAddress) return;
    setProfile(null);
    setBox(null);
    setLastKind(null);
    void fetchHonors(walletAddress)
      .then(setProfile)
      .catch(() => setError("체인 조회 실패 — 잠시 후 다시 열어주세요."));
    void fetchBoxProfile(walletAddress).then(setBox).catch(() => {});
    void fetchHearth(walletAddress)
      .then((h) => setWarmth(h.warmth))
      .catch(() => {});
  }, [open, walletAddress]);

  if (!open) return null;

  function close() {
    useStore.getState().setHonorsOpen(false);
    setError(null);
  }

  async function act(fn: "claim" | "equip", id: number) {
    if (busy !== null || !walletAddress) return;
    setBusy(id);
    setError(null);
    try {
      await honorWrite(fn, id);
      setProfile(await fetchHonors(walletAddress));
      if (fn === "equip") {
        // 자기 아바타 코스메틱 즉시 반영
        useStore.getState().setSelfHonor(id === 0 ? null : id);
      }
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      setError(m.length > 100 ? m.slice(0, 100) + "…" : m);
    } finally {
      setBusy(null);
    }
  }

  async function onBox() {
    if (boxBusy || !walletAddress || !box) return;
    setBoxBusy(true);
    setError(null);
    setLastKind(null);
    try {
      if (box.pendingBlock === 0) {
        await openBoxOnChain();
        // 결과는 개봉 tx 블록 해시로 봉인 — 다음 블록에서 확정
        await new Promise((r) => setTimeout(r, 2500));
      }
      const kind = await revealBoxOnChain();
      setLastKind(kind);
      setBox(await fetchBoxProfile(walletAddress));
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      setError(m.length > 100 ? m.slice(0, 100) + "…" : m);
      void fetchBoxProfile(walletAddress).then(setBox).catch(() => {});
    } finally {
      setBoxBusy(false);
    }
  }

  async function onEquipTrinket(kind: number) {
    if (boxBusy || !walletAddress) return;
    setBoxBusy(true);
    setError(null);
    try {
      await equipTrinketOnChain(kind);
      setBox(await fetchBoxProfile(walletAddress));
      useStore.getState().setSelfTrinket(kind === 0 ? null : kind);
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      setError(m.length > 100 ? m.slice(0, 100) + "…" : m);
    } finally {
      setBoxBusy(false);
    }
  }

  const canOpenBox =
    !!box && (box.pendingBlock !== 0 || Date.now() / 1000 >= box.nextOpenAt);
  const lastDef = TRINKET_DEFS.find((d) => d.id === lastKind);

  return (
    <div className="gift-overlay" onClick={close}>
      <div className="gift-modal guild-modal" onClick={(e) => e.stopPropagation()}>
        <div className="gift-emoji">🎖</div>
        <div className="gift-title">칭호 · 장신구</div>
        <div className="gift-sub">
          온체인 기록으로 증명하고, 장착하면 이름표에 배지가 붙습니다
          {warmth !== null && warmth > 0 && <> · 🔥 온기 {warmth}</>}
        </div>

        {!walletAddress && <div className="gift-warn">지갑이 필요합니다.</div>}
        {walletAddress && !profile && !error && (
          <div className="gift-note">체인에서 불러오는 중…</div>
        )}

        {profile && (
          <div className="guild-board" style={{ borderTop: "none", paddingTop: 4 }}>
            {HONOR_DEFS.map((d, i) => {
              const owned = (profile.mask & (1 << d.id)) !== 0;
              const equipped = profile.equipped === d.id;
              return (
                <div key={d.id} className="guild-row">
                  <span className="guild-rank">{d.emoji}</span>
                  <span className="guild-name">
                    {d.name}
                    <em className="honor-desc"> {d.desc}</em>
                  </span>
                  {equipped ? (
                    <button
                      className="gift-btn small"
                      disabled={busy !== null}
                      onClick={() => act("equip", 0)}
                    >
                      {busy === 0 ? "…" : "장착됨 ✓"}
                    </button>
                  ) : owned ? (
                    <button
                      className="gift-btn primary small"
                      disabled={busy !== null}
                      onClick={() => act("equip", d.id)}
                    >
                      {busy === d.id ? "…" : "장착"}
                    </button>
                  ) : profile.eligible[i] ? (
                    <button
                      className="gift-btn primary small"
                      disabled={busy !== null}
                      onClick={() => act("claim", d.id)}
                    >
                      {busy === d.id ? "획득 중…" : "획득"}
                    </button>
                  ) : (
                    <span className="guild-count">미달성</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {walletAddress && box && (
          <div className="guild-board">
            <div className="guild-board-title">🎁 랜덤박스 — 장신구 뽑기 (무료 · 60초 쿨다운)</div>
            <div className="gift-actions" style={{ marginTop: 8 }}>
              <button
                className="gift-btn primary"
                disabled={boxBusy || !canOpenBox}
                onClick={onBox}
                title="결과는 개봉 트랜잭션이 담긴 블록의 해시로 확정됩니다"
              >
                {boxBusy
                  ? "개봉 중…"
                  : box.pendingBlock !== 0
                    ? "🎁 개봉하기"
                    : canOpenBox
                      ? "🎁 상자 열기"
                      : "쿨다운 중…"}
              </button>
            </div>
            {lastDef && (
              <div className="dungeon-result">
                {lastDef.emoji} <b>{lastDef.name}</b> ({lastDef.rarity}) 획득!
              </div>
            )}
            {TRINKET_DEFS.map((d) => {
              const owned = (box.mask & (1 << d.id)) !== 0;
              const equipped = box.equipped === d.id;
              return (
                <div key={d.id} className="guild-row">
                  <span className="guild-rank">{owned ? d.emoji : "❔"}</span>
                  <span className="guild-name">
                    {owned ? d.name : "???"}
                    <em className="honor-desc"> {d.rarity}</em>
                  </span>
                  {equipped ? (
                    <button
                      className="gift-btn small"
                      disabled={boxBusy}
                      onClick={() => onEquipTrinket(0)}
                    >
                      장착됨 ✓
                    </button>
                  ) : owned ? (
                    <button
                      className="gift-btn primary small"
                      disabled={boxBusy}
                      onClick={() => onEquipTrinket(d.id)}
                    >
                      장착
                    </button>
                  ) : (
                    <span className="guild-count">미보유</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {error && <div className="gift-warn">{error}</div>}

        <div className="gift-actions">
          <button className="gift-btn" onClick={close}>
            닫기
          </button>
        </div>
        <div className="gift-note">
          칭호·장신구는 양도 불가(소울바운드) — 전송 함수가 아예 없는 온체인
          기록입니다. 랜덤박스는 참가비가 없고, 결과는 블록 해시로 확정됩니다
        </div>
      </div>
    </div>
  );
}
