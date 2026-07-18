import { useEffect } from "react";
import { useStore } from "../state/store";
import { dungeonEnter, dungeonPick, dungeonBank } from "../net/colyseus";
import { giwaSepolia, DUNGEON_URL } from "../config/giwa";

const OUTCOME_TEXT = {
  safe: "🕯️ 무사히 올랐다 — +1층",
  bonus: "🌬️ 순풍이 분다 — +2층!",
  trap: "💥 함정! 이번 원정의 수확을 잃었다…",
} as const;

export default function DungeonDialog() {
  const open = useStore((s) => s.dungeonOpen);
  const dungeon = useStore((s) => s.dungeon);
  const guilds = useStore((s) => s.guilds);
  const walletAddress = useStore((s) => s.walletAddress);
  const error = useStore((s) => s.guildError);

  const myGuild = walletAddress
    ? guilds.find((g) =>
        g.members.some(
          (m) => m.address.toLowerCase() === walletAddress.toLowerCase(),
        ),
      )
    : undefined;

  // 다이얼로그가 열리면 원정 세션을 시작한다
  useEffect(() => {
    if (open && myGuild) dungeonEnter();
  }, [open, myGuild?.id]);

  if (!open) return null;

  function close() {
    useStore.getState().setDungeonOpen(false);
    useStore.getState().setDungeon(null);
  }

  function goGuild() {
    close();
    useStore.getState().setGuildOpen(true);
  }

  const explorer = giwaSepolia.blockExplorers.default.url;

  return (
    <div className="gift-overlay" onClick={close}>
      <div className="gift-modal" onClick={(e) => e.stopPropagation()}>
        <div className="gift-emoji">⚔</div>
        <div className="gift-title">백층 던전</div>

        {!myGuild ? (
          <>
            <div className="gift-sub">
              던전은 <b>길드 원정</b>입니다 — 길드원들이 각자의 시간에
              이어 등반하는 비동기 코업
            </div>
            {error && <div className="gift-warn">{error}</div>}
            <div className="gift-actions">
              <button className="gift-btn" onClick={close}>
                닫기
              </button>
              <button className="gift-btn primary" onClick={goGuild}>
                🏯 길드 보러가기
              </button>
            </div>
          </>
        ) : !dungeon ? (
          <div className="gift-sub">입장 중…</div>
        ) : (
          <>
            <div className="gift-sub">
              {dungeon.emblem} {dungeon.guildName} · 원정 #{dungeon.attempt} ·
              이번 주 <b>{dungeon.floor}층</b>
              {dungeon.tentative > 0 && (
                <span className="dungeon-tentative"> +{dungeon.tentative}</span>
              )}
            </div>

            {dungeon.ended ? (
              <>
                <div className="dungeon-result">
                  {dungeon.banked
                    ? `🏮 +${dungeon.banked}층 확정! 길드가 ${dungeon.floor}층에 도달했다`
                    : (OUTCOME_TEXT[dungeon.lastOutcome ?? "trap"] ?? "")}
                </div>
                <div className="gift-actions">
                  <button className="gift-btn" onClick={close}>
                    마을로
                  </button>
                  <button className="gift-btn primary" onClick={() => dungeonEnter()}>
                    다시 입장
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="dungeon-result">
                  {dungeon.lastOutcome
                    ? OUTCOME_TEXT[dungeon.lastOutcome]
                    : "문을 골라 오르세요 — 욕심은 함정을 부른다"}
                </div>
                <div className="dungeon-doors">
                  {[0, 1, 2].map((d) => (
                    <button
                      key={d}
                      className="dungeon-door"
                      disabled={dungeon.busy}
                      onClick={() => dungeonPick(d)}
                    >
                      🚪
                    </button>
                  ))}
                </div>
                <div className="gift-actions">
                  <button className="gift-btn" onClick={close}>
                    마을로
                  </button>
                  <button
                    className="gift-btn primary"
                    disabled={dungeon.busy || dungeon.tentative === 0}
                    onClick={() => dungeonBank()}
                  >
                    귀환 — +{dungeon.tentative}층 확정
                  </button>
                </div>
              </>
            )}

            <div className="gift-note">
              시드:{" "}
              {dungeon.offchain ? (
                "오프체인 폴백"
              ) : (
                <a
                  className="gift-txlink"
                  href={`${explorer}/block/${dungeon.seedBlock}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  GIWA 블록 #{dungeon.seedBlock} ↗
                </a>
              )}{" "}
              · 함정을 밟으면 잠정 층수를 잃고, 귀환하면 길드 기록에 쌓입니다 ·{" "}
              <a
                className="gift-txlink"
                href={DUNGEON_URL}
                target="_blank"
                rel="noreferrer"
              >
                솔로 아케이드 ↗
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
