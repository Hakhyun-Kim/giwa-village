import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import {
  HONOR_DEFS,
  fetchHonors,
  honorWrite,
  type HonorProfile,
} from "../chain/village";

/** 소울바운드 칭호 — 온체인 조건 검증 클레임 + 이름표 배지 장착 */
export default function HonorsDialog() {
  const open = useStore((s) => s.honorsOpen);
  const walletAddress = useStore((s) => s.walletAddress);
  const [profile, setProfile] = useState<HonorProfile | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !walletAddress) return;
    setProfile(null);
    void fetchHonors(walletAddress)
      .then(setProfile)
      .catch(() => setError("체인 조회 실패 — 잠시 후 다시 열어주세요."));
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
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      setError(m.length > 100 ? m.slice(0, 100) + "…" : m);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="gift-overlay" onClick={close}>
      <div className="gift-modal" onClick={(e) => e.stopPropagation()}>
        <div className="gift-emoji">🎖</div>
        <div className="gift-title">칭호</div>
        <div className="gift-sub">
          온체인 기록으로 증명하고, 장착하면 이름표에 배지가 붙습니다
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

        {error && <div className="gift-warn">{error}</div>}

        <div className="gift-actions">
          <button className="gift-btn" onClick={close}>
            닫기
          </button>
        </div>
        <div className="gift-note">
          칭호는 양도 불가(소울바운드) — 전송 함수가 아예 없는 온체인 기록입니다
        </div>
      </div>
    </div>
  );
}
